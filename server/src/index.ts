import { loadConfig } from './config/appConfig';
import { createHttpApp } from './http/app';
import { getMCPServerManager } from './mcp-hub';
import { capabilityService } from './capabilities';
import { initializeDatabase } from './db/init';
import { initializeLicensing, getFeatures } from './licensing';
import { proactiveEngine } from './proactive';
import { channelRouter, SlackAdapter, TeamsAdapter, WebhookAdapter } from './channels';

const config = loadConfig();
const app = createHttpApp();

// Initialize MCP Hub and capabilities (only if licensed)
async function initializeMCPHub() {
  const features = getFeatures();

  if (!features.mcpHub) {
    console.log('[server] MCP Hub disabled (not licensed)');
    return;
  }

  try {
    // Initialize the MCP Server Manager (registers built-in servers)
    const manager = getMCPServerManager();
    await manager.initialize();

    console.log('[server] MCP Hub initialized successfully');
  } catch (error) {
    console.error('[server] Failed to initialize MCP Hub:', error);
  }
}

async function initializeCapabilities() {
  const features = getFeatures();

  if (!features.mcpHub) {
    console.log('[server] Capabilities seeding skipped (MCP Hub not licensed)');
    return;
  }

  try {
    // Seed default capabilities
    await capabilityService.seedDefaultCapabilities();
    console.log('[server] Default capabilities seeded');
  } catch (error) {
    console.error('[server] Failed to seed capabilities:', error);
  }
}

// Initialize multi-channel system (only if licensed)
async function initializeChannels() {
  const features = getFeatures();

  if (!features.multiChannel) {
    console.log('[server] Multi-channel disabled (not licensed)');
    return;
  }

  try {
    // Register all adapter types
    channelRouter.registerAdapter(new SlackAdapter());
    channelRouter.registerAdapter(new TeamsAdapter());
    channelRouter.registerAdapter(new WebhookAdapter());

    // Load channel configs from DB and initialize each adapter
    await channelRouter.initializeAll();

    console.log('[server] Multi-channel system initialized');
  } catch (error) {
    console.error('[server] Failed to initialize channels:', error);
  }
}

// Start server
app.listen(config.port, async () => {
  console.log(`Agent-in-a-Box server listening on port ${config.port}`);

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
  console.log(`\n[server] Received ${signal} — shutting down...`);
  proactiveEngine.stop();
  await channelRouter.shutdown().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
