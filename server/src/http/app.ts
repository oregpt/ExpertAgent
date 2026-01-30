import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { chatRouter } from './chatRoutes';
import { capabilityRouter } from './capabilityRoutes';
import { kbRouter } from './kbRoutes';
import { ragRouter } from './ragRoutes';
import { adminRouter } from './adminRoutes';
import { getFeatures } from '../licensing';

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log('[app] Created uploads directory:', uploadsPath);
}

export function createHttpApp() {
  const app = express();

  // Enable CORS for all origins (dev mode)
  app.use(cors());
  app.use(express.json());

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadsPath));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'agentinabox-server' });
  });

  // Public endpoint: Widget features (what the embeddable widget can do)
  // This is NOT the admin licensing endpoint - it exposes only what the widget needs
  app.get('/api/widget/features', (_req, res) => {
    const features = getFeatures();
    res.json({
      multimodal: features.multimodal,
      customBranding: features.customBranding,
      mcpHub: features.mcpHub,
    });
  });

  app.use('/api/chat', chatRouter);
  app.use('/api/capabilities', capabilityRouter);
  app.use('/api/kb', kbRouter);
  app.use('/api/rag', ragRouter);
  app.use('/api/admin', adminRouter);

  // In production, serve the frontend static files
  if (process.env.NODE_ENV === 'production') {
    const publicPath = path.join(__dirname, '../../public');
    app.use(express.static(publicPath));

    // SPA fallback - serve index.html for all non-API routes
    // Note: Express 5 / path-to-regexp 8+ requires '{*path}' syntax instead of '*'
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  return app;
}
