# ExpertAgent Development Log

## Overview
ExpertAgent is an enterprise AI agent platform with soul memory, proactive behavior, MCP Hub capabilities, and multi-channel delivery. It runs as both a hosted web app (`main` branch) and a standalone desktop app via Electron (`main_withLocalApp` branch).

---

## 2026-02-07 — Mac Desktop Build & Setup Wizard Fixes

### Mac DMG Build (from scratch)
- Cloned repo to `/Users/oreph/Documents/Custom Applications/ExpertAgent`, checked out `main_withLocalApp`
- Built both arm64 (Apple Silicon) and x64 (Intel) DMGs using `electron-builder`
- Created GitHub Release v2.0.0-alpha.7 with both DMGs + Windows .exe

### Key Issues Solved During Build

**Server path error in packaged app**
- `desktop/main.ts` used `path.join(__dirname, '..', 'server', 'dist', 'index.js')` but `__dirname` was `desktop/dist/`, needing `../..`
- Fixed path resolution for both dev and production modes

**Native module (better-sqlite3) ABI mismatch**
- `desktop/main.ts` uses `spawn('node')` (system Node.js), NOT Electron's bundled Node
- `electron-builder`'s `@electron/rebuild` compiles better-sqlite3 for Electron (wrong ABI)
- Workaround: After every build, run `npm rebuild better-sqlite3` for system Node, then copy the `.node` file into the packaged app
- Must also clean `@electron` packages from `server/node_modules` before each build to avoid broken symlinks

**ASAR packaging issues**
- Native modules can't run from inside ASAR archives
- Added `asarUnpack` config to `electron-builder.yml` for server dist, node_modules, and better-sqlite3

**Uploads directory ENOTDIR error**
- Server tried to create `uploads/` inside the ASAR archive
- Fixed `app.ts`, `adminRoutes.ts`, `kbRoutes.ts` to use `EXPERT_AGENT_DATA_DIR` when `IS_DESKTOP=true`

**Setup wizard redirect loop**
- After completing setup, navigating to `/` looped back to wizard
- `useEffect` with empty deps didn't re-run on navigation
- Fixed with `window.location.href = '/'` for full page reload

### MCP Hub Initialization After License Activation
- **Problem:** MCP Hub initialization skipped at startup (no license yet). Entering a license via the setup wizard didn't trigger MCP initialization, so capabilities wouldn't appear until restart.
- **Fix:** Added MCP Hub + capability seeding to the `POST /api/setup/validate-license` endpoint in `app.ts`. After `initializeLicensing()`, if `mcpHub` feature is enabled, initialize the MCP server manager and seed default capabilities.

### Chat Panel UI Improvements
- Renamed "Chat Preview" to "Chat with Agent..."
- Removed "Test your agent's responses" subtitle
- Widened container from 800px to 1600px max
- Chat panel fills viewport height (`calc(100vh - 140px)`, min 700px)
- Widget inline mode stretches to fill parent container (no longer capped at 400x600px)
- Changes pushed to both `main` and `main_withLocalApp` branches

### Ollama Local LLM Support (from Windows team)
- Pulled new `ollamaProvider.ts` — full Ollama integration with tool support and streaming
- `llm/index.ts` updated to route `ollama:` prefixed models to OllamaProvider
- `AgentConfig.tsx` updated with Ollama model selection
- `SetupWizard.tsx` detects Ollama automatically on Step 3, shows model count
- Tested with local Ollama running `llama3.1:8b` and `qwen2.5-coder:7b`
- Note: Smaller models (llama3.1:8b) output tool calls as raw text instead of structured tool_use — this is a model capability limitation, not a code bug

### Setup Wizard — Ollama-Only Completion
- **Problem:** Backend rejected setup completion if no cloud API keys were entered, even when Ollama was available locally
- **Fix:** Frontend sends `ollamaAvailable` flag; backend accepts it as a valid provider source

### API Keys Not Carrying Over from Wizard to Agent
- **Problem 1:** Setup wizard saved keys to `platform-api-keys.json` but didn't set `process.env` in the running process. Keys unavailable until restart.
- **Fix:** Set env vars immediately after saving to disk in the `/api/setup/complete` handler.

- **Problem 2:** Agent config page showed keys as "Using environment variable (fallback)" instead of "Configured" — confusing since the user just entered them.
- **Fix:** Updated UI label to show "Configured (platform key)" with green checkmark for env-sourced keys.

- **Problem 3:** Keys only saved at platform level, not per-agent. User had to re-enter them in agent config.
- **Fix:** Setup wizard now also saves keys as encrypted per-agent keys for all existing agents via `capabilityService.setAgentApiKey()`. Shows as "Configured (encrypted)" immediately.

### Licensing System Notes
- JWT license keys signed with secret `a187523b66ff76479c6c451b6e3104970bccfa66a38a03ac8107a5b1be003d26`
- `BASE_FEATURES` (no license) now includes: `soulMemory`, `deepTools`, `backgroundAgents`, `multiChannel`
- Features still requiring a license: `multiAgent`, `multimodal`, `mcpHub`, `customBranding`, `gitlabKbSync`, `proactive`
- Desktop app loads saved license key from `EXPERT_AGENT_DATA_DIR/license.key` on startup

### Filesystem MCP Investigation
- The `mcp-filesystem` server is listed in `WELL_KNOWN_MCP_SERVERS` (reference catalog) but NOT in `seedDefaultCapabilities()`
- No bundled filesystem server implementation exists — would rely on external npm package via `npx`
- Agent correctly reports it cannot do file operations since no filesystem tool is available
- Adding a bundled filesystem MCP server is a future enhancement

---

## Build Process Reference (Mac)

```bash
# 1. Compile TypeScript
cd server && npx tsc --project tsconfig.json
cd ../web && npx vite build
cp -r dist ../server/public

# 2. Clean electron contamination
cd .. && rm -rf server/node_modules/@electron
rm -f server/node_modules/.bin/asar server/node_modules/.bin/electron \
  server/node_modules/.bin/electron-builder server/node_modules/.bin/electron-fuses \
  server/node_modules/.bin/electron-osx-flat server/node_modules/.bin/electron-osx-sign \
  server/node_modules/.bin/electron-rebuild server/node_modules/.bin/electron-windows-sign \
  server/node_modules/.bin/install-app-deps

# 3. Build DMG
npx electron-builder --mac --arm64

# 4. Fix better-sqlite3 ABI (CRITICAL)
cd server && npm rebuild better-sqlite3
# Copy correct .node file into packaged app:
cp node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  ../dist-desktop/mac-arm64/Expert\ Agent.app/Contents/Resources/app.asar.unpacked/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

### Reset App Data (for fresh wizard testing)
```bash
rm ~/Library/Application\ Support/agentinabox-v2/setup-complete.flag \
   ~/Library/Application\ Support/agentinabox-v2/license.key \
   ~/Library/Application\ Support/agentinabox-v2/platform-api-keys.json \
   ~/Library/Application\ Support/agentinabox-v2/expert-agent.db \
   ~/Library/Application\ Support/agentinabox-v2/expert-agent.db-shm \
   ~/Library/Application\ Support/agentinabox-v2/expert-agent.db-wal
```

---

## Branch Strategy
| Branch | Purpose |
|--------|---------|
| `main` | Hosted/web deployment (no desktop/Electron code) |
| `main_withLocalApp` | Desktop app (Electron + SQLite + setup wizard) |

UI-only changes are cherry-picked to both branches. Desktop-specific changes (setup wizard, licensing endpoints, Electron main process) stay in `main_withLocalApp` only.
