import { db } from '../db/client';
import { agents, conversations, messages, agentCapabilities } from '../db/schema';
import { getRelevantContext } from '../rag/ragService';
import { getProviderForModel } from '../llm';
import { LLMMessage } from '../llm/types';
import { executeWithTools } from '../llm/toolExecutor';
import { eq, desc, and } from 'drizzle-orm';

// ============================================================================
// Helpers
// ============================================================================

export async function ensureDefaultAgent(): Promise<string> {
  const existing = (await db.select().from(agents).limit(1)) as any[];
  if (existing.length) {
    return existing[0].id as string;
  }

  const inserted = (await db
    .insert(agents)
    .values({
      id: 'default-agent',
      slug: 'default',
      name: 'Agent-in-a-Box',
      description: 'Default Agent-in-a-Box assistant',
      instructions:
        'You are an Agent-in-a-Box assistant. Use the knowledge base and tools when relevant and always cite your sources when you rely on retrieved documents.',
      defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-sonnet-4-20250514',
    })
    .returning()) as any[];

  return inserted[0].id as string;
}

export async function startConversation(agentId: string, externalUserId?: string, title?: string) {
  const rows = (await db
    .insert(conversations)
    .values({ agentId, externalUserId, title })
    .returning()) as any[];
  return rows[0];
}

export async function appendMessage(
  conversationId: number,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
) {
  const rows = (await db
    .insert(messages)
    .values({ conversationId, role, content, metadata: metadata || {} })
    .returning()) as any[];

  return rows[0];
}

export async function getConversationWithMessages(conversationId: number) {
  const convRows = (await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)) as any[];

  const conv = convRows[0];
  if (!conv) return null;

  const msgRows = (await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))) as any[];

  return { conversation: conv, messages: msgRows.reverse() };
}

/**
 * Check if an agent has MCP Hub enabled (via capabilities)
 */
async function agentHasToolsEnabled(agentId: string): Promise<boolean> {
  // Check if any MCP capability is enabled for this agent
  const enabledCaps = await db
    .select()
    .from(agentCapabilities)
    .where(and(eq(agentCapabilities.agentId, agentId), eq(agentCapabilities.enabled, 1)));

  return enabledCaps.length > 0;
}

// ============================================================================
// Main Chat Functions
// ============================================================================

export interface ChatReplyResult {
  reply: string;
  sources: { content: string; sourceTitle: string }[];
  toolsUsed?: Array<{
    name: string;
    input: Record<string, unknown>;
    output: string;
    success: boolean;
  }>;
}

export async function generateReply(
  conversationId: number,
  userMessage: string
): Promise<ChatReplyResult> {
  const conv = await getConversationWithMessages(conversationId);
  if (!conv) throw new Error('Conversation not found');

  const agentId = conv.conversation.agentId as string;

  // Check if tools are enabled first
  const hasTools = await agentHasToolsEnabled(agentId);
  
  // Get RAG context (reduced when tools enabled to save tokens)
  const ragMaxTokens = hasTools ? 1000 : 2000;
  const rag = await getRelevantContext(agentId, userMessage, ragMaxTokens);

  // Build conversation history
  const history: LLMMessage[] = [];

  const agentRows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
  const agent = agentRows[0];

  let systemInstructions =
    (agent?.instructions as string | null) ||
    'You are an Agent-in-a-Box assistant. Use the provided context and tools when relevant. Always cite your sources.';

  if (hasTools) {
    systemInstructions +=
      '\n\nYou have access to tools that can help you answer questions. Use them when appropriate to fetch real-time data or perform actions.';
  }

  history.push({
    role: 'system',
    content: systemInstructions,
  });

  // Add conversation history (limit when using tools to save tokens)
  const maxHistory = hasTools ? 4 : 20;
  const recentMessages = (conv.messages as any[]).slice(-maxHistory);
  for (const m of recentMessages) {
    const role = (m.role as 'user' | 'assistant' | 'system') || 'user';
    // Truncate long messages to save tokens
    const content = (m.content as string).length > 1500 
      ? (m.content as string).slice(0, 1500) + '...[truncated]'
      : m.content as string;
    history.push({ role, content });
  }

  // Build user message with RAG context
  let userContent = userMessage;
  if (rag.context) {
    userContent += `\n\n---\nRelevant Context from Knowledge Base:\n${rag.context}`;
  }

  history.push({ role: 'user', content: userContent });

  const model =
    (agent?.defaultModel as string | null) ||
    process.env.DEFAULT_MODEL ||
    'claude-sonnet-4-20250514';

  // Execute with tool support if enabled
  let reply: string;
  let toolsUsed: ChatReplyResult['toolsUsed'];

  if (hasTools) {
    const result = await executeWithTools(history, {
      model,
      maxTokens: 2048,
      agentId,
      enableTools: true,
    });
    reply = result.reply;
    toolsUsed = result.toolsUsed.length > 0 ? result.toolsUsed : undefined;
  } else {
    // Simple generation without tools
    const provider = getProviderForModel(model);
    reply = await provider.generate(history, {
      model,
      maxTokens: 2048,
      agentId,
    });
  }

  // Save assistant message
  await appendMessage(conversationId, 'assistant', reply, {
    sources: rag.sources,
    toolsUsed,
  });

  const sources = rag.sources.map((s) => ({ content: s.content, sourceTitle: s.sourceTitle }));

  const returnVal: ChatReplyResult = { reply, sources };
  if (toolsUsed && toolsUsed.length > 0) {
    returnVal.toolsUsed = toolsUsed;
  }
  return returnVal;
}

export async function streamReply(
  conversationId: number,
  userMessage: string,
  onChunk: (delta: string, isFinal: boolean) => void
): Promise<ChatReplyResult> {
  const conv = await getConversationWithMessages(conversationId);
  if (!conv) throw new Error('Conversation not found');

  const agentId = conv.conversation.agentId as string;

  // Check if tools are enabled first
  const hasTools = await agentHasToolsEnabled(agentId);
  
  // Get RAG context (reduced when tools enabled to save tokens)
  const ragMaxTokens = hasTools ? 1000 : 2000;
  const rag = await getRelevantContext(agentId, userMessage, ragMaxTokens);

  // Build conversation history
  const history: LLMMessage[] = [];

  const agentRows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
  const agent = agentRows[0];

  let systemInstructions =
    (agent?.instructions as string | null) ||
    'You are an Agent-in-a-Box assistant. Use the provided context and tools when relevant. Always cite your sources.';
  if (hasTools) {
    systemInstructions +=
      '\n\nYou have access to tools that can help you answer questions. Use them when appropriate to fetch real-time data or perform actions.';
  }

  history.push({
    role: 'system',
    content: systemInstructions,
  });

  // Add conversation history (limit when using tools to save tokens)
  const maxHistory = hasTools ? 4 : 20;
  const recentMessages = (conv.messages as any[]).slice(-maxHistory);
  for (const m of recentMessages) {
    const role = (m.role as 'user' | 'assistant' | 'system') || 'user';
    // Truncate long messages to save tokens
    const content = (m.content as string).length > 1500 
      ? (m.content as string).slice(0, 1500) + '...[truncated]'
      : m.content as string;
    history.push({ role, content });
  }

  // Build user message with RAG context
  let userContent = userMessage;
  if (rag.context) {
    userContent += `\n\n---\nRelevant Context from Knowledge Base:\n${rag.context}`;
  }

  history.push({ role: 'user', content: userContent });

  const model =
    (agent?.defaultModel as string | null) ||
    process.env.DEFAULT_MODEL ||
    'claude-sonnet-4-20250514';

  let full: string;
  let toolsUsed: ChatReplyResult['toolsUsed'];

  if (hasTools) {
    // For tool calling, we can't stream during the tool loop
    // Execute tools first, then stream the final response
    const result = await executeWithTools(history, {
      model,
      maxTokens: 2048,
      agentId,
      enableTools: true,
    });
    full = result.reply;
    toolsUsed = result.toolsUsed.length > 0 ? result.toolsUsed : undefined;

    // Simulate streaming for the final response
    const words = full.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      onChunk(word, false);
      // Small delay to simulate streaming
      await new Promise((r) => setTimeout(r, 10));
    }
    onChunk('', true);
  } else {
    // Standard streaming without tools
    const provider = getProviderForModel(model);
    full = '';

    await provider.stream(
      history,
      {
        model,
        maxTokens: 2048,
        agentId,
      },
      (chunk) => {
        if (chunk.type === 'delta') {
          full += chunk.content;
          onChunk(chunk.content, false);
        } else if (chunk.type === 'final') {
          onChunk('', true);
        }
      }
    );
  }

  // Save assistant message
  await appendMessage(conversationId, 'assistant', full, {
    sources: rag.sources,
    toolsUsed,
  });

  const sources = rag.sources.map((s) => ({ content: s.content, sourceTitle: s.sourceTitle }));

  const returnVal: ChatReplyResult = { reply: full, sources };
  if (toolsUsed && toolsUsed.length > 0) {
    returnVal.toolsUsed = toolsUsed;
  }
  return returnVal;
}
