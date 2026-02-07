import { loadConfig } from './config/appConfig';
import { createHttpApp } from './http/app';
import { getMCPServerManager } from './mcp-hub';
import { capabilityService } from './capabilities';
import { initializeDatabase } from './db/init';
import { initializeLicensing, getFeatures } from './licensing';
import { proactiveEngine } from './proactive';
import { channelRouter, SlackAdapter, TeamsAdapter, WebhookAdapter } from './channels';
import { logger } from './utils/logger';

const config = loadConfig();
const app = createHttpApp();

// Initialize MCP Hub and capabilities (only if licensed)
async function initializeMCPHub() {
  const features = getFeatures();

  if (!features.mcpHub) {
    logger.info('MCP Hub disabled (not licensed)');
    return;
  }

  try {
    // Initialize the MCP Server Manager (registers built-in servers)
    const manager = getMCPServerManager();
    await manager.initialize();

    logger.info('MCP Hub initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize MCP Hub', { error: (error as Error).message });
  }
}

async function initializeCapabilities() {
  const features = getFeatures();

  if (!features.mcpHub) {
    logger.info('Capabilities seeding skipped (MCP Hub not licensed)');
    return;
  }

  try {
    // Seed default capabilities
    await capabilityService.seedDefaultCapabilities();
    logger.info('Default capabilities seeded');
  } catch (error) {
    logger.error('Failed to seed capabilities', { error: (error as Error).message });
  }
}

// Initialize multi-channel system (only if licensed)
async function initializeChannels() {
  const features = getFeatures();

  if (!features.multiChannel) {
    logger.info('Multi-channel disabled (not licensed)');
    return;
  }

  try {
    // Register all adapter types
    channelRouter.registerAdapter(new SlackAdapter());
    channelRouter.registerAdapter(new TeamsAdapter());
    channelRouter.registerAdapter(new WebhookAdapter());

    // Load channel configs from DB and initialize each adapter
    await channelRouter.initializeAll();

    logger.info('Multi-channel system initialized');
  } catch (error) {
    logger.error('Failed to initialize channels', { error: (error as Error).message });
  }
}

// ============================================================================
// Main Startup — all initialization BEFORE accepting HTTP traffic
// ============================================================================

async function main() {
  // Load platform-level API keys from config file into env vars
  // (These are saved by the setup wizard and available to all agents via fromEnv)
  const dataDir = process.env.EXPERT_AGENT_DATA_DIR || process.cwd();
  const platformKeysPath = require('path').join(dataDir, 'platform-api-keys.json');
  try {
    if (require('fs').existsSync(platformKeysPath)) {
      const platformKeys = JSON.parse(require('fs').readFileSync(platformKeysPath, 'utf-8'));
      const envMap: Record<string, string> = {
        anthropic_api_key: 'ANTHROPIC_API_KEY',
        openai_api_key: 'OPENAI_API_KEY',
        grok_api_key: 'GROK_API_KEY',
        gemini_api_key: 'GEMINI_API_KEY',
      };
      for (const [configKey, envKey] of Object.entries(envMap)) {
        if (platformKeys[configKey] && !process.env[envKey]) {
          process.env[envKey] = platformKeys[configKey];
          logger.info(`Loaded platform API key: ${envKey}`);
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to load platform API keys', { error: (err as Error).message });
  }

  // Initialize licensing FIRST (before anything else)
  initializeLicensing();

  // Initialize database (pgvector extension, migrations) — MUST complete before serving
  await initializeDatabase();

  // Initialize MCP Hub and capabilities (if licensed)
  await initializeMCPHub();
  await initializeCapabilities();

  // NOW start accepting HTTP requests (all dependencies are ready)
  // Use http.createServer for explicit control (Express 5 compatibility)
  const http = await import('http');
  const server = http.createServer(app);
  
  server.listen(config.port, '0.0.0.0', () => {
    const addr = server.address();
    logger.info('Agent-in-a-Box server started', { port: config.port, address: addr });
    console.log(`[server] HTTP listening on http://0.0.0.0:${config.port}`);

    // Signal to Electron parent process that server is ready
    if (process.send) {
      process.send('ready');
    }
  });

  server.on('error', (err: Error) => {
    logger.error('HTTP server error', { error: err.message });
    console.error('[server] BIND ERROR:', err);
    process.exit(1);
  });

  // Start these AFTER server is listening (they depend on DB but don't need to block startup)
  proactiveEngine.start();
  await initializeChannels();
}

main().then(() => {
  console.log('[main] Startup complete — server running');
}).catch((err) => {
  console.error('[main] FATAL:', err);
  logger.error('Fatal startup error', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(signal: string) {
  logger.info('Shutdown signal received', { signal });
  proactiveEngine.stop();
  await channelRouter.shutdown().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
