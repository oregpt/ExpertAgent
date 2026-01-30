import { db } from '../db/client';
import { agents, conversations, messages, agentCapabilities } from '../db/schema';
import { getRelevantContext } from '../rag/ragService';
import { getProviderForModel } from '../llm';
import { LLMMessage } from '../llm/types';
import { executeWithTools } from '../llm/toolExecutor';
import { eq, desc, and } from 'drizzle-orm';
import { getFeatures } from '../licensing/features';
import { getAgentFeatures } from '../licensing/agentFeatures';
import { buildContext } from '../session/contextBuilder';
import { updateSessionActivity, shouldSummarize, summarizeSession } from '../session/sessionManager';
import { getDocument, upsertDocument } from '../memory/documentService';

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
  // v2: Check per-agent features — these add tools regardless of MCP caps
  const features = await getAgentFeatures(agentId);
  if (features.soulMemory || features.deepTools) {
    return true;
  }

  // Check if any MCP capability is enabled for this agent
  const enabledCaps = await db
    .select()
    .from(agentCapabilities)
    .where(and(eq(agentCapabilities.agentId, agentId), eq(agentCapabilities.enabled, 1)));

  return enabledCaps.length > 0;
}

// ============================================================================
// v2 Phase 5: Daily Log Auto-Append (Fire-and-Forget)
// ============================================================================

/**
 * Append a conversation turn to the daily log document.
 * Fire-and-forget — never blocks the user response.
 *
 * Format: ### HH:MM - [channel_type]\nUser: ...\nAgent: ...\n\n
 * Doc key: daily/YYYY-MM-DD.md
 */
function appendToDailyLog(
  agentId: string,
  userMessage: string,
  agentReply: string,
  channelType?: string
): void {
  // Quick global gate — if globally off, skip entirely (per-agent can only be more restrictive)
  const globalFeatures = getFeatures();
  if (!globalFeatures.soulMemory) return;

  // Fire-and-forget via unhandled promise
  (async () => {
    try {
      // Per-agent feature check
      const features = await getAgentFeatures(agentId);
      if (!features.soulMemory) return;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().slice(0, 5);   // HH:MM
      const docKey = `daily/${dateStr}.md`;
      const channel = channelType || 'widget';

      // Build the log entry
      const userSnippet = userMessage.slice(0, 100) + (userMessage.length > 100 ? '...' : '');
      const agentSnippet = agentReply.slice(0, 200) + (agentReply.length > 200 ? '...' : '');
      const entry = `### ${timeStr} - [${channel}]\nUser: ${userSnippet}\nAgent: ${agentSnippet}\n\n`;

      // Read existing content and append
      const existing = await getDocument(agentId, docKey);
      const existingContent = existing?.content || `# Daily Log — ${dateStr}\n\n`;
      const updatedContent = existingContent + entry;

      await upsertDocument(agentId, 'daily', docKey, updatedContent);
    } catch (err) {
      // Best-effort — silently swallow errors
      console.warn('[chat] Daily log append failed (non-fatal):', err);
    }
  })();
}

// ============================================================================
// v2 Phase 5: Post-Response Session Maintenance (Fire-and-Forget)
// ============================================================================

/**
 * After a response is generated, update session activity and optionally
 * trigger lazy summarization. Fire-and-forget.
 */
function postResponseMaintenance(conversationId: number): void {
  (async () => {
    try {
      // Bump message_count and last_message_at
      await updateSessionActivity(conversationId);

      // Check if this conversation should be summarized
      const needsSummary = await shouldSummarize(conversationId);
      if (needsSummary) {
        console.log(`[chat] Triggering lazy summarization for conversation ${conversationId}`);
        await summarizeSession(conversationId);
      }
    } catch (err) {
      console.warn('[chat] Post-response maintenance failed (non-fatal):', err);
    }
  })();
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

  // v2 Phase 5: Use contextBuilder to assemble all context
  const ctx = await buildContext(agentId, conversationId, userMessage, { hasTools });

  // Build LLM message array from context
  const history: LLMMessage[] = [];

  // System prompt (from contextBuilder: soul.md + context.md + session summaries + channel awareness)
  history.push({ role: 'system', content: ctx.systemPrompt });

  // Session history (from contextBuilder: recent messages, already truncated)
  history.push(...ctx.sessionHistory);

  // Build user message with RAG context + memory recall
  let userContent = userMessage;
  if (rag.context) {
    userContent += `\n\n---\nRelevant Context from Knowledge Base:\n${rag.context}`;
  }

  // Memory recall from contextBuilder
  if (ctx.memoryContext) {
    userContent += `\n\n---\n${ctx.memoryContext}`;
  }

  history.push({ role: 'user', content: userContent });

  // Get agent model
  const agentRows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
  const agent = agentRows[0];
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

  // v2 Phase 5: Fire-and-forget post-response tasks
  const channelType = (conv.conversation.channelType as string | null) || undefined;
  appendToDailyLog(agentId, userMessage, reply, channelType);
  postResponseMaintenance(conversationId);

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

  // v2 Phase 5: Use contextBuilder to assemble all context
  const ctx = await buildContext(agentId, conversationId, userMessage, { hasTools });

  // Build LLM message array from context
  const history: LLMMessage[] = [];

  // System prompt (from contextBuilder: soul.md + context.md + session summaries + channel awareness)
  history.push({ role: 'system', content: ctx.systemPrompt });

  // Session history (from contextBuilder: recent messages, already truncated)
  history.push(...ctx.sessionHistory);

  // Build user message with RAG context + memory recall
  let userContent = userMessage;
  if (rag.context) {
    userContent += `\n\n---\nRelevant Context from Knowledge Base:\n${rag.context}`;
  }

  // Memory recall from contextBuilder
  if (ctx.memoryContext) {
    userContent += `\n\n---\n${ctx.memoryContext}`;
  }

  history.push({ role: 'user', content: userContent });

  // Get agent model
  const agentRows = (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)) as any[];
  const agent = agentRows[0];
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

  // v2 Phase 5: Fire-and-forget post-response tasks
  const channelType = (conv.conversation.channelType as string | null) || undefined;
  appendToDailyLog(agentId, userMessage, full, channelType);
  postResponseMaintenance(conversationId);

  const sources = rag.sources.map((s) => ({ content: s.content, sourceTitle: s.sourceTitle }));

  const returnVal: ChatReplyResult = { reply: full, sources };
  if (toolsUsed && toolsUsed.length > 0) {
    returnVal.toolsUsed = toolsUsed;
  }
  return returnVal;
}
