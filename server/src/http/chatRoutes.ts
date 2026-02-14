import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { appendMessage, ensureDefaultAgent, generateReply, startConversation, getConversationWithMessages, streamReply } from '../chat/chatService';
import { db } from '../db/client';
import { agents } from '../db/schema';

export const chatRouter = Router();

chatRouter.post('/start', async (req, res) => {
  try {
    const agentId = (req.body.agentId as string) || (await ensureDefaultAgent());
    const externalUserId = req.body.externalUserId as string | undefined;
    const title = req.body.title as string | undefined;

    const conv = await startConversation(agentId, externalUserId, title);

    // Fetch agent details for the widget header
    const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    const agent = agentRows[0];

    res.json({
      conversationId: conv.id,
      agent: agent ? {
        id: agent.id,
        name: agent.name,
        branding: agent.branding
      } : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

chatRouter.get('/:conversationId', async (req, res) => {
  try {
    const id = Number(req.params.conversationId);
    const conv = await getConversationWithMessages(id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

chatRouter.post('/:conversationId/message', async (req, res) => {
  try {
    const id = Number(req.params.conversationId);
    const message = String(req.body.message || '');
    if (!message.trim()) return res.status(400).json({ error: 'Message is required' });

    await appendMessage(id, 'user', message);

    const result = await generateReply(id, message);

    res.json({ conversationId: id, reply: result.reply, sources: result.sources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Streaming endpoint using Server-Sent Events (SSE)
chatRouter.post('/:conversationId/stream', async (req, res) => {
  try {
    const id = Number(req.params.conversationId);
    const message = String(req.body.message || '');
    if (!message.trim()) return res.status(400).json({ error: 'Message is required' });

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initial event to confirm stream open
    res.write(`data: ${JSON.stringify({ event: 'start' })}\n\n`);

    await appendMessage(id, 'user', message);

    const { reply, sources } = await streamReply(id, message, (delta, _isFinal, eventType) => {
      if (eventType === 'thinking') {
        res.write(`data: ${JSON.stringify({ event: 'thinking' })}\n\n`);
      } else if (eventType === 'tool') {
        res.write(`data: ${JSON.stringify({ event: 'tool', message: delta })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ event: 'delta', delta })}\n\n`);
      }
    });

    const endPayload = { event: 'end', full: reply, sources };
    res.write(`data: ${JSON.stringify(endPayload)}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream message' });
    } else {
      res.write(`data: ${JSON.stringify({ event: 'error', error: 'Failed to stream message' })}\n\n`);
      res.end();
    }
  }
});
