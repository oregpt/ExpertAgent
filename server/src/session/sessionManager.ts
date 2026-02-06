/**
 * Session Manager
 *
 * Manages conversation sessions for agents across channels.
 * Handles session creation, activity tracking, lazy summarization,
 * and recent session retrieval.
 *
 * Key behaviors:
 * - getOrCreateSession: finds an active session (message in last 30 min) or creates a new one
 * - updateSessionActivity: bumps message_count and last_message_at after each turn
 * - summarizeSession: uses LLM to generate a summary when message_count > threshold
 * - Session summaries are generated lazily (only when shouldSummarize returns true)
 */

import { db } from '../db/client';
import { conversations, messages } from '../db/schema';
import { eq, and, desc, gte, isNull, sql } from 'drizzle-orm';
import { dbNow } from '../db/date-utils';

// ============================================================================
// Types
// ============================================================================

export interface Session {
  id: number;
  agentId: string;
  externalUserId: string | null;
  title: string | null;
  channelType: string | null;
  channelId: string | null;
  sessionSummary: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionSummary {
  id: number;
  title: string | null;
  channelType: string | null;
  sessionSummary: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}

// Session is considered "active" if last message was within this window
const SESSION_ACTIVE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// Summarize threshold: only summarize conversations with more than this many messages
const SUMMARIZE_THRESHOLD = 20;

// ============================================================================
// Session CRUD
// ============================================================================

/**
 * Find an existing active session for this agent/channel, or create a new one.
 *
 * "Active" = last_message_at within the SESSION_ACTIVE_WINDOW_MS window.
 * If channelType/channelId are provided, looks for a matching session on that channel.
 * Otherwise, looks for any recent session for the agent (widget default behavior).
 */
export async function getOrCreateSession(
  agentId: string,
  channelType?: string,
  channelId?: string,
  externalUserId?: string
): Promise<Session> {
  const cutoff = new Date(Date.now() - SESSION_ACTIVE_WINDOW_MS);

  // Build conditions: agent_id match + recent activity
  const conditions: any[] = [
    eq(conversations.agentId, agentId),
    gte(conversations.lastMessageAt, cutoff),
  ];

  // If channel info provided, match on it
  if (channelType) {
    conditions.push(eq(conversations.channelType, channelType));
  }
  if (channelId) {
    conditions.push(eq(conversations.channelId, channelId));
  }

  // Find the most recent active session
  const rows = await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1) as any[];

  if (rows.length > 0) {
    return rowToSession(rows[0]);
  }

  // No active session found — also check for sessions with NULL last_message_at
  // (freshly created sessions that haven't had a message yet)
  const freshConditions: any[] = [
    eq(conversations.agentId, agentId),
    isNull(conversations.lastMessageAt),
  ];
  if (channelType) {
    freshConditions.push(eq(conversations.channelType, channelType));
  }
  if (channelId) {
    freshConditions.push(eq(conversations.channelId, channelId));
  }

  const freshRows = await db
    .select()
    .from(conversations)
    .where(and(...freshConditions))
    .orderBy(desc(conversations.createdAt))
    .limit(1) as any[];

  if (freshRows.length > 0) {
    return rowToSession(freshRows[0]);
  }

  // Create a new session
  const insertedRows = await db
    .insert(conversations)
    .values({
      agentId,
      externalUserId: externalUserId || null,
      title: channelType ? `${channelType} session` : 'Chat session',
      channelType: channelType || 'widget',
      channelId: channelId || null,
      messageCount: 0,
      lastMessageAt: null,
    })
    .returning() as any[];

  return rowToSession(insertedRows[0]);
}

/**
 * Update session activity counters after a message exchange.
 * Bumps message_count and sets last_message_at to now.
 */
export async function updateSessionActivity(conversationId: number): Promise<void> {
  await db
    .update(conversations)
    .set({
      messageCount: sql`COALESCE(message_count, 0) + 1`,
      lastMessageAt: dbNow(),
      updatedAt: dbNow(),
    })
    .where(eq(conversations.id, conversationId));
}

/**
 * Check if a session should be summarized.
 * Returns true if message_count > SUMMARIZE_THRESHOLD and no summary exists yet.
 */
export async function shouldSummarize(conversationId: number): Promise<boolean> {
  const rows = await db
    .select({
      messageCount: conversations.messageCount,
      sessionSummary: conversations.sessionSummary,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1) as any[];

  if (rows.length === 0) return false;

  const row = rows[0];
  const count = (row.messageCount as number) || 0;
  const summary = row.sessionSummary as string | null;

  return count > SUMMARIZE_THRESHOLD && !summary;
}

/**
 * Generate a summary of the conversation using the LLM and store it.
 *
 * Loads the last 30 messages, sends them to the LLM with a summarization prompt,
 * and stores the result in session_summary.
 */
export async function summarizeSession(conversationId: number): Promise<string | null> {
  // Load conversation messages
  const msgRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(30) as any[];

  if (msgRows.length === 0) return null;

  // Get agent info for the conversation
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1) as any[];

  if (convRows.length === 0) return null;

  const agentId = convRows[0].agentId as string;

  // Build the transcript
  const transcript = msgRows
    .reverse()
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => `${(m.role as string).toUpperCase()}: ${(m.content as string).slice(0, 500)}`)
    .join('\n');

  // Call LLM to summarize
  try {
    const { getProviderForModel } = await import('../llm');
    const { agents } = await import('../db/schema');

    const agentRows = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1) as any[];

    const model = (agentRows[0]?.defaultModel as string) ||
      process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514';

    const provider = getProviderForModel(model);
    const summary = await provider.generate(
      [
        {
          role: 'system',
          content: 'You are a concise summarizer. Summarize the following conversation in 2-4 sentences, capturing the key topics discussed, any decisions made, and important context. Be factual and brief.',
        },
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${transcript}`,
        },
      ],
      { model, maxTokens: 300, agentId }
    );

    // Store the summary
    await db
      .update(conversations)
      .set({
        sessionSummary: summary,
        updatedAt: dbNow(),
      })
      .where(eq(conversations.id, conversationId));

    console.log(`[session] Summarized conversation ${conversationId} (${msgRows.length} msgs)`);
    return summary;
  } catch (err) {
    console.warn(`[session] Failed to summarize conversation ${conversationId}:`, err);
    return null;
  }
}

/**
 * Get recent sessions for an agent, ordered by most recent activity.
 * Includes session summaries for context building.
 */
export async function getRecentSessions(
  agentId: string,
  limit = 5
): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      channelType: conversations.channelType,
      sessionSummary: conversations.sessionSummary,
      messageCount: conversations.messageCount,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.agentId, agentId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit) as any[];

  return rows.map((r: any) => ({
    id: r.id as number,
    title: r.title as string | null,
    channelType: r.channelType as string | null,
    sessionSummary: r.sessionSummary as string | null,
    messageCount: (r.messageCount as number) || 0,
    lastMessageAt: r.lastMessageAt as Date | null,
    createdAt: r.createdAt as Date,
  }));
}

/**
 * Get a session by its conversation ID.
 */
export async function getSession(conversationId: number): Promise<Session | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1) as any[];

  if (rows.length === 0) return null;
  return rowToSession(rows[0]);
}

// ============================================================================
// Helpers
// ============================================================================

function rowToSession(row: any): Session {
  return {
    id: row.id as number,
    agentId: row.agentId as string,
    externalUserId: row.externalUserId as string | null,
    title: row.title as string | null,
    channelType: row.channelType as string | null,
    channelId: row.channelId as string | null,
    sessionSummary: row.sessionSummary as string | null,
    messageCount: (row.messageCount as number) || 0,
    lastMessageAt: row.lastMessageAt as Date | null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}
