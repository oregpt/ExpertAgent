import { Router } from 'express';
import { ensureDefaultAgent } from '../chat/chatService';
import { search } from '../rag/ragService';

export const ragRouter = Router();

ragRouter.get('/search', async (req, res) => {
  try {
    const agentId = (req.query.agentId as string) || (await ensureDefaultAgent());
    const query = String(req.query.q || req.query.query || '');
    if (!query.trim()) return res.status(400).json({ error: 'q (query) is required' });

    const limit = req.query.limit ? Number(req.query.limit) : 5;
    const maxTokens = req.query.maxTokens ? Number(req.query.maxTokens) : 3000;

    const results = await search(agentId, query, limit, maxTokens);
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to run RAG search' });
  }
});
