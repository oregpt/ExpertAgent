/**
 * Context Builder
 *
 * The single place that assembles all context for an agent request:
 * - System prompt (soul.md + context.md or v1 static instructions)
 * - Memory recall (semantic search across agent memory)
 * - Conversation history (recent messages from this session)
 * - Session summaries from prior conversations
 * - Cross-channel awareness (what channel this conversation is on)
 *
 * Design principles:
 * - soulMemory=true → soul.md + context.md + memory recall + session summaries
 * - soulMemory=false → v1 static instructions only
 * - All channels share the same memory (soul/memory/context docs)
 * - Conversation history is per-session (per channel conversation)
 * - RAG context is NOT handled here (still injected at the user-message level in chatService)
 */

import { db } from '../db/client';
import { agents, messages, conversations } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getFeatures } from '../licensing/features';
import { getAgentFeatures } from '../licensing/agentFeatures';
import { getDocument, searchMemory } from '../memory';
import { getRecentSessions, getSession } from './sessionManager';
import { LLMMessage } from '../llm/types';

// ============================================================================
// Types
// ============================================================================

export interface BuiltContext {
  /** Full system prompt (soul.md + context.md or v1 instructions) */
  systemPrompt: string;
  /** Formatted memory recall results (empty string if none or soulMemory disabled) */
  memoryContext: string;
  /** Recent conversation messages from this session */
  sessionHistory: LLMMessage[];
  /** RAG-style context from knowledge base (placeholder — RAG is still in chatService) */
  ragContext: string;
}

export interface BuildContextOptions {
  /** Whether the agent has tools enabled (affects history window size) */
  hasTools?: boolean;
  /** Maximum number of history messages to include */
  maxHistory?: number;
  /** Maximum number of memory search results */
  memoryTopK?: number;
}

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the full context for an agent request.
 *
 * This is the single orchestration point. The chat service calls this
 * before every LLM invocation.
 */
export async function buildContext(
  agentId: string,
  conversationId: number,
  userMessage: string,
  options: BuildContextOptions = {}
): Promise<BuiltContext> {
  const features = await getAgentFeatures(agentId);
  const hasTools = options.hasTools ?? false;
  const maxHistory = options.maxHistory ?? (hasTools ? 4 : 20);
  const memoryTopK = options.memoryTopK ?? 5;

  // Run independent lookups in parallel
  const [agent, systemPrompt, memoryContext, sessionHistory] = await Promise.all([
    loadAgent(agentId),
    buildSystemPrompt(agentId, hasTools),
    features.soulMemory ? recallMemory(agentId, userMessage, memoryTopK) : Promise.resolve(''),
    loadSessionHistory(conversationId, maxHistory),
  ]);

  // Build cross-channel and session summary context (appended to system prompt)
  let enrichedSystemPrompt = systemPrompt;

  if (features.soulMemory) {
    // Add session summaries from recent prior sessions
    const sessionSummaryBlock = await buildSessionSummaryContext(agentId, conversationId);
    if (sessionSummaryBlock) {
      enrichedSystemPrompt += '\n\n' + sessionSummaryBlock;
    }

    // Add cross-channel awareness
    const session = await getSession(conversationId);
    if (session?.channelType) {
      enrichedSystemPrompt += `\n\n---\nThis conversation is via ${session.channelType}.`;
    }
  }

  return {
    systemPrompt: enrichedSystemPrompt,
    memoryContext,
    sessionHistory,
    ragContext: '', // RAG is still handled in chatService (getRelevantContext)
  };
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Build the system prompt for an agent.
 *
 * soulMemory=true → soul.md + context.md
 * soulMemory=false → v1 static instructions field
 */
async function buildSystemPrompt(agentId: string, hasTools: boolean): Promise<string> {
  const features = await getAgentFeatures(agentId);

  let systemInstructions: string;

  if (features.soulMemory) {
    // v2: Load soul.md + context.md from document store
    const [soulDoc, contextDoc] = await Promise.all([
      getDocument(agentId, 'soul.md'),
      getDocument(agentId, 'context.md'),
    ]);

    if (soulDoc && soulDoc.content.trim()) {
      systemInstructions = soulDoc.content;

      // Append context.md if it exists
      if (contextDoc && contextDoc.content.trim()) {
        systemInstructions += '\n\n---\n\n' + contextDoc.content;
      }
    } else {
      // Fallback to v1 static instructions if soul.md not set up
      systemInstructions = await getStaticInstructions(agentId);
    }
  } else {
    // v1 behavior: static instructions field
    systemInstructions = await getStaticInstructions(agentId);
  }

  if (hasTools) {
    systemInstructions +=
      '\n\n## Tools\n' +
      'You have tools available and MUST use them proactively. ' +
      'For ANY question about current events, news, prices, live data, weather, or anything that requires up-to-date information, ' +
      'you MUST call the appropriate tool — do NOT answer from your training data alone.\n\n' +
      'Key tools:\n' +
      '- web__search: Search the web for current information (news, prices, facts)\n' +
      '- web__fetch: Fetch and read content from a specific URL\n' +
      '- memory__read / memory__write: Read or update your persistent memory\n' +
      '- mcp__*: External service integrations (check available actions)\n\n' +
      'When in doubt, USE A TOOL rather than guessing. Always prefer tool results over your training data for anything time-sensitive.';
  }

  return systemInstructions;
}

/**
 * Load v1-style static instructions from the agent's DB record.
 */
async function getStaticInstructions(agentId: string): Promise<string> {
  const agent = await loadAgent(agentId);
  return (
    (agent?.instructions as string | null) ||
    'You are an Agent-in-a-Box assistant. Use the provided context and tools when relevant. Always cite your sources.'
  );
}

// ============================================================================
// Memory Recall
// ============================================================================

/**
 * Semantic search across agent memory for context relevant to the user's message.
 * Returns formatted context string or empty.
 */
async function recallMemory(agentId: string, userMessage: string, topK: number): Promise<string> {
  try {
    const results = await searchMemory(agentId, userMessage, topK);
    if (results.length === 0) return '';

    // Only include results above a relevance threshold
    const relevant = results.filter((r) => r.similarity > 0.3);
    if (relevant.length === 0) return '';

    let memoryContext = '## Relevant Memory\n';
    for (const r of relevant) {
      memoryContext += `- [${r.docKey}] ${r.chunkText}\n`;
    }
    return memoryContext;
  } catch (err) {
    // Memory recall is best-effort — don't block chat if it fails
    console.warn('[context-builder] Memory recall failed:', err);
    return '';
  }
}

// ============================================================================
// Session History
// ============================================================================

/**
 * Load recent messages from a conversation for inclusion in context.
 * Returns them as LLMMessage array (oldest first).
 */
async function loadSessionHistory(
  conversationId: number,
  maxMessages: number
): Promise<LLMMessage[]> {
  const msgRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(maxMessages) as any[];

  // Reverse to chronological order, filter out empty messages
  return msgRows.reverse()
    .map((m: any) => {
      const role = (m.role as 'user' | 'assistant' | 'system') || 'user';
      const content = (m.content as string).length > 1500
        ? (m.content as string).slice(0, 1500) + '...[truncated]'
        : (m.content as string);
      return { role, content } as LLMMessage;
    })
    .filter((m) => m.content.trim().length > 0);
}

// ============================================================================
// Session Summary Context
// ============================================================================

/**
 * Build a context block from recent prior session summaries.
 *
 * Finds the last few sessions (excluding the current one) that have summaries,
 * and formats them as prior-conversation context for the agent.
 */
async function buildSessionSummaryContext(
  agentId: string,
  currentConversationId: number
): Promise<string | null> {
  try {
    const recentSessions = await getRecentSessions(agentId, 6);

    // Filter to sessions that: (a) have a summary, (b) are not the current one
    const priorSummaries = recentSessions.filter(
      (s) => s.id !== currentConversationId && s.sessionSummary
    );

    if (priorSummaries.length === 0) return null;

    let block = '## Prior Conversation Summaries\n';
    for (const s of priorSummaries.slice(0, 3)) {
      const when = s.lastMessageAt
        ? new Date(s.lastMessageAt).toISOString().split('T')[0]
        : 'unknown date';
      const channel = s.channelType || 'unknown';
      block += `- [${when} via ${channel}] ${s.sessionSummary}\n`;
    }
    return block;
  } catch (err) {
    console.warn('[context-builder] Failed to build session summary context:', err);
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

let agentCache: Map<string, { data: any; expiry: number }> = new Map();
const AGENT_CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load agent from DB with simple in-memory caching (1 minute TTL).
 */
async function loadAgent(agentId: string): Promise<any> {
  const cached = agentCache.get(agentId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1) as any[];

  const agent = rows[0] || null;
  agentCache.set(agentId, { data: agent, expiry: Date.now() + AGENT_CACHE_TTL_MS });
  return agent;
}
