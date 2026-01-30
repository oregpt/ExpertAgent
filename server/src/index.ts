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

// Start server
app.listen(config.port, async () => {
  logger.info('Agent-in-a-Box server started', { port: config.port });

  // Initialize licensing FIRST (before anything else)
  initializeLicensing();

  // Initialize database (pgvector extension, migrations)
  await initializeDatabase();

  // Initialize MCP Hub and capabilities after server starts (if licensed)
  await initializeMCPHub();
  await initializeCapabilities();

  // Start proactive engine (heartbeats, cron jobs) — no-op if feature disabled
  proactiveEngine.start();

  // Initialize multi-channel delivery — no-op if feature disabled
  await initializeChannels();
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
