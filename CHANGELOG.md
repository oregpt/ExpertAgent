# Agent-in-a-Box v2 Changelog

## 2.0.0-alpha.6 (2026-01-31)

### Phase 5: Session Continuity ✅

Agents maintain context across conversations — session management, context building, daily logs, and memory distillation.

#### 5A: Session Management
- Created `server/src/db/migrations/007_enhance_conversations.sql` — adds session metadata columns to `ai_conversations`:
  - `channel_type` — tracks which channel (widget, slack, teams, webhook, cron)
  - `channel_id` — channel-specific identifier
  - `session_summary` — LLM-generated conversation summary
  - `message_count` — running message counter
  - `last_message_at` — last activity timestamp
  - Indexes on `(agent_id, channel_type, channel_id)` and `(agent_id, last_message_at DESC)`
- Updated `server/src/db/schema.ts` with new Drizzle column definitions on `conversations` table
- Updated `server/src/db/init.ts` to run ALTER TABLE migrations + create indexes on startup
- Created `server/src/session/sessionManager.ts`:
  - `getOrCreateSession(agentId, channelType?, channelId?)` — finds active session (last message within 30 min) or creates new one
  - `updateSessionActivity(conversationId)` — bumps message_count and last_message_at
  - `shouldSummarize(conversationId)` — returns true if message_count > 20 and no summary yet
  - `summarizeSession(conversationId)` — generates LLM summary of last 30 messages, stores in session_summary
  - `getRecentSessions(agentId, limit)` — retrieves recent sessions with summaries for context building
  - `getSession(conversationId)` — loads a single session by ID

#### 5A.4 / 5D: Context Builder (Cross-Channel Context)
- Created `server/src/session/contextBuilder.ts` — the brain of the system:
  - `buildContext(agentId, conversationId, userMessage, options?)` returns `{ systemPrompt, memoryContext, sessionHistory, ragContext }`
  - **System prompt**: soul.md + context.md (soulMemory=true) or v1 static instructions (soulMemory=false)
  - **Memory recall**: semantic search across agent memory (top 5 results, similarity > 0.3 threshold)
  - **Session history**: loads last 20 messages (or 4 when tools enabled) from current conversation
  - **Session summaries**: includes summaries from up to 3 prior conversations as context
  - **Cross-channel awareness**: appends "This conversation is via {channelType}." to system prompt
  - All channels share the same memory (soul.md, memory.md, context.md) — conversation history is per-session
  - Agent caching (1-minute TTL) to reduce DB lookups
  - Parallel Promise.all for independent lookups (agent, system prompt, memory, history)

#### 5B: Auto Daily Logs
- Modified `server/src/chat/chatService.ts` — after each conversation turn:
  - Auto-appends to daily log document: `daily/YYYY-MM-DD.md`
  - Format: `### HH:MM - [channel_type]\nUser: {first 100 chars}\nAgent: {first 200 chars}\n\n`
  - Uses `upsertDocument` with append logic (read existing, append, write back)
  - **Fire-and-forget** — async function, never blocks the user response
  - Only runs when `soulMemory` feature flag is enabled

#### 5C: Memory Distillation
- Created `server/src/session/memoryDistiller.ts`:
  - `distillMemory(agentId)` — the periodic memory review process:
    1. Reads last 3 days of daily logs (`daily/YYYY-MM-DD.md`)
    2. Reads current `memory.md`
    3. Sends to LLM with distillation prompt (extract learnings, update memory, remove outdated info)
    4. Writes updated `memory.md` back
    5. Re-embeds `memory.md` for semantic search
  - `runDistillation(agentId)` — convenience wrapper returning a status string (for proactive engine / cron)
  - Not auto-scheduled — admin creates a cron job for it when desired
  - Requires `soulMemory` feature flag

#### 5E: Chat Service Refactor
- Refactored `chatService.ts` to use `contextBuilder.buildContext()`:
  - Removed inline `buildSystemPrompt()` and `recallMemory()` functions (moved to contextBuilder)
  - Before LLM call: `buildContext()` returns system prompt, memory context, session history
  - After LLM response: fire-and-forget `appendToDailyLog()` + `postResponseMaintenance()`
  - `postResponseMaintenance()` bumps session activity counters and triggers lazy summarization
  - Both `generateReply()` and `streamReply()` updated with identical Phase 5 integration
  - All v1 behavior preserved — context builder falls back to static instructions when soulMemory=false

#### 5F: Barrel Export
- Created `server/src/session/index.ts` — exports all session module functions and types

### Design Principles
- **contextBuilder is the single brain** — all context assembly (soul, memory, history, summaries, channel awareness) flows through one function
- **Daily logs are fire-and-forget** — never block the user response; errors silently swallowed
- **Memory distillation is a function, not auto-scheduled** — admin creates a cron job for it
- **Cross-channel memory is shared; conversation history is per-session** — Slack and widget share memory.md but have separate histories
- **Session summaries are lazy** — only generated when message_count > 20 threshold and no summary exists
- **All features respect soulMemory flag** — soulMemory=false means v1 behavior exactly preserved
- **No new dependencies** — uses existing LLM providers, Drizzle ORM, and memory services
- **Clean TypeScript build** — zero compilation errors

---

## 2.0.0-alpha.5 (2026-01-31)

### Phase 4: Multi-Channel Delivery ✅

Agents reach users where they already work — Slack, Teams, and generic webhooks.

#### 4A: Channel Abstraction Layer
- Created `server/src/channels/types.ts` — common interfaces: `ChannelMessage`, `InboundMessage`, `ChannelAdapter`, `AgentChannelRow`
- Created `server/src/channels/channelRouter.ts` — singleton ChannelRouter class
  - `registerAdapter(adapter)` — register a channel adapter by name
  - `initializeAll()` — load all enabled channel configs from DB, initialize adapters
  - `sendMessage(channelType, channelId, message)` — route outbound to correct adapter with formatting
  - `sendToAllChannels(agentId, text)` — broadcast to all enabled channels (used by proactive engine)
  - `handleInbound(channelType, req, res)` — route inbound webhook to adapter
  - `processInbound(inbound)` — find agent for channel, call chatService, send response back
  - `shutdown()` — graceful cleanup of all adapters
  - Full logging for all sends/receives
- Created `server/src/channels/messageFormatter.ts`
  - `formatForSlack(text)` — markdown → Slack mrkdwn (bold, italic, code, links, headers, strikethrough)
  - `formatForTeams(text)` — passthrough (Teams supports standard markdown)
  - `formatForWebhook(text)` — plain passthrough
  - `formatForChannel(text, channelType)` — auto-dispatch by channel type
  - Code block and inline code protection during formatting

#### 4B: Slack Integration
- Created `server/src/channels/slack/slackAdapter.ts` — implements ChannelAdapter
  - Uses Slack Web API via axios (NO @slack/bolt dependency)
  - `initialize(config)` — configures bot_token, signing_secret; auto-resolves bot user ID via auth.test
  - `sendMessage(channelId, message)` — POST to chat.postMessage with thread support
  - `handleInbound(req, res)` — handles Events API: URL verification challenge, message events
  - Filters bot messages and subtypes to prevent infinite loops
  - `verifyWebhook(req)` — HMAC-SHA256 signature verification per Slack spec
  - Timing-safe comparison, 5-minute replay attack prevention

#### 4C: Microsoft Teams Integration
- Created `server/src/channels/teams/teamsAdapter.ts` — implements ChannelAdapter
  - Uses Bot Framework REST API via axios (NO botbuilder SDK)
  - `initialize(config)` — configures app_id, app_password
  - `getAccessToken()` — OAuth2 client credentials flow with in-memory caching (5-minute buffer before expiry)
  - `sendMessage(conversationId, message)` — POST activity to Bot Framework service URL
  - `handleInbound(req, res)` — parses Bot Framework activity, strips @mentions
  - Responds with 200 immediately, processes async
  - Captures service URL from first inbound for reply routing

#### 4D: Webhook Channel (Generic)
- Created `server/src/channels/webhook/webhookAdapter.ts` — implements ChannelAdapter
  - `initialize(config)` — configures callback_url, shared secret
  - `sendMessage(channelId, message)` — POST JSON to callback URL with HMAC-SHA256 signature header
  - `handleInbound(req, res)` — accepts POST with { text, senderId, senderName? }
  - `verifyWebhook(req)` — verifies X-Webhook-Signature header via HMAC-SHA256
  - Simple, universal — any system can integrate via webhooks

#### 4E: Database Schema
- Created `server/src/db/migrations/006_agent_channels.sql` — ai_agent_channels table
  - agent_id, channel_type (slack/teams/webhook), channel_name, config (JSONB), enabled
  - Indexes on agent_id and channel_type
- Updated `server/src/db/schema.ts` with Drizzle `agentChannels` table definition
- Updated `server/src/db/init.ts` to create table + indexes on startup

#### 4F: API Routes
- Created `server/src/http/channelRoutes.ts` with all endpoints:
  - `GET /api/agents/:id/channels` — list configured channels (hides config secrets)
  - `POST /api/agents/:id/channels` — add channel with validation per type
  - `PUT /api/agents/:id/channels/:channelId` — update channel config/status
  - `DELETE /api/agents/:id/channels/:channelId` — remove channel
  - `POST /api/channels/slack/events` — Slack Events API webhook (signature verified)
  - `POST /api/channels/teams/messages` — Teams Bot Framework webhook
  - `POST /api/channels/webhook/:agentId` — generic inbound webhook (HMAC verified)
- All CRUD routes gated by `multiChannel` feature flag (403 if disabled)
- Webhook endpoints return 404 when feature disabled (but route exists)
- Validates channel-specific config fields on create (bot_token for Slack, app_id for Teams, etc.)
- Registered in `app.ts`

#### 4G: Proactive Engine Integration
- Updated `server/src/proactive/heartbeatService.ts`:
  - After heartbeat completes with non-HEARTBEAT_OK result → broadcasts to all enabled channels
- Updated `server/src/proactive/cronService.ts`:
  - After cron job completes with non-HEARTBEAT_OK result → broadcasts to all enabled channels
- Both use dynamic import to avoid circular dependency issues

#### 4H: Server Integration
- Updated `server/src/index.ts`:
  - Added `initializeChannels()` — registers Slack, Teams, Webhook adapters; loads configs from DB
  - Only initializes if `multiChannel` feature flag is enabled
  - Calls after proactive engine start
  - Graceful shutdown includes `channelRouter.shutdown()`

#### 4I: Feature Flag
- Added `multiChannel: boolean` to `FeatureFlags` interface
- Added to `BASE_FEATURES` (false) and `FULL_FEATURES` (true)
- Added `FEATURE_MULTI_CHANNEL` env var support
- Added to license key validation in `license.ts`
- Added to feature summary logging
- When disabled: no channel router starts, CRUD returns 403, webhooks return 404

#### 4J: Barrel Export
- Created `server/src/channels/index.ts` — exports channelRouter, formatters, types, and all adapters

#### Infrastructure
- Added raw body capture middleware in `app.ts` (required for Slack/webhook HMAC verification)

### Design Principles
- **NO NEW NPM DEPENDENCIES** — uses axios (already installed) for all HTTP calls
- **No @slack/bolt, no botbuilder SDK** — raw REST API calls only
- **Feature flag modularity** — multiChannel=false means no channels initialize, widget still works
- **Async webhook processing** — all webhook endpoints respond immediately (200 OK), process async (Slack 3s timeout)
- **Slack signature verification** — HMAC-SHA256 with timing-safe comparison, replay attack prevention
- **Teams token caching** — in-memory with 5-minute pre-expiry buffer
- **Channel router is the hub** — proactive engine and future features all send through it
- **Secrets in JSONB config** — bot tokens, passwords stored in config column (encrypted at rest in production DB)
- **Clean TypeScript build** — zero compilation errors

---

## 2.0.0-alpha.4 (2026-01-31)

### Phase 3: Proactive Engine ✅

Agents that act without being asked - heartbeats, cron jobs, and background tasks.

#### 3A: Database Schema
- Created `server/src/db/migrations/003_agent_cron_jobs.sql` — scheduled tasks table with cron/interval schedule, task text, model override, enable/disable
- Created `server/src/db/migrations/004_agent_heartbeat_config.sql` — per-agent heartbeat config (interval, checklist, quiet hours, timezone)
- Created `server/src/db/migrations/005_agent_task_runs.sql` — execution audit log for heartbeats, cron, and background tasks
- Updated `server/src/db/schema.ts` with Drizzle definitions for `agentCronJobs`, `agentHeartbeatConfig`, `agentTaskRuns`
- Updated `server/src/db/init.ts` to auto-create all three tables + indexes on startup

#### 3B: Proactive Engine Service
- Created `server/src/proactive/proactiveEngine.ts` — singleton polling engine
  - `start()` — begins 60-second polling loop (no-op if `proactive` feature flag is off)
  - `stop()` — cleanup on shutdown
  - Checks for due heartbeats (enabled, interval elapsed, not in quiet hours)
  - Checks for due cron jobs (enabled, next_run_at <= now)
  - Guard against overlapping poll cycles
- Created `server/src/proactive/heartbeatService.ts`
  - `getConfig()` / `upsertConfig()` — heartbeat config CRUD
  - `isDue()` — checks interval elapsed + quiet hours (handles overnight spans)
  - `executeHeartbeat()` — builds prompt from checklist, sends to chat service, logs result
  - `getAllEnabledConfigs()` — for polling loop
- Created `server/src/proactive/cronService.ts`
  - Full CRUD: `createJob`, `updateJob`, `deleteJob`, `listJobs`, `getJob`
  - `getDueJobs()` — finds enabled jobs where next_run_at <= now
  - `executeJob()` — sends task_text to chat service, updates timestamps, logs to task runs
  - `calculateNextRun()` — schedule parser supporting:
    - Simple intervals: `every 30m`, `every 1h`, `every 24h`, `every 2d`
    - 5-field cron: wildcards, exact values, step (*/N), comma lists, ranges (A-B)
    - Walks forward minute-by-minute (up to 8 days) to find next match
  - No external cron libraries — lightweight pattern matching only
- Created `server/src/proactive/backgroundAgent.ts`
  - `spawnTask(agentId, taskText, options?)` — fire-and-forget isolated task execution
  - Options: model override, timeout (default 2 min)
  - Gated by `backgroundAgents` feature flag
- Created `server/src/proactive/index.ts` — barrel export

#### 3C: API Routes
- Created `server/src/http/proactiveRoutes.ts` with all endpoints:
  - `GET /api/agents/:id/heartbeat` — get heartbeat config
  - `PUT /api/agents/:id/heartbeat` — update heartbeat config
  - `GET /api/agents/:id/cron` — list cron jobs
  - `POST /api/agents/:id/cron` — create cron job (validates schedule on create)
  - `PUT /api/agents/:id/cron/:jobId` — update cron job
  - `DELETE /api/agents/:id/cron/:jobId` — delete cron job
  - `POST /api/agents/:id/cron/:jobId/run` — manually trigger (fire-and-forget)
  - `GET /api/agents/:id/proactive/runs` — task run history (last 50, configurable up to 200)
- All routes gated by `proactive` feature flag (403 if disabled)
- Registered in `app.ts`

#### 3D: Server Integration
- `server/src/index.ts`: calls `proactiveEngine.start()` after server startup
- Added graceful shutdown: SIGTERM/SIGINT call `proactiveEngine.stop()`

#### 3E: Feature Flags
- Added `proactive: boolean` to FeatureFlags interface
- Added `backgroundAgents: boolean` to FeatureFlags interface
- Updated `BASE_FEATURES` (both false), `FULL_FEATURES` (both true)
- Added `FEATURE_PROACTIVE` and `FEATURE_BACKGROUND_AGENTS` env var support
- Added to license key validation in `license.ts`
- Added to feature summary logging

### Design Principles
- **In-process only** — No Redis, no Bull. Simple setInterval polling loop.
- **Modularity** — proactive=false means engine doesn't start. App works as v1.
- **No heavy libraries** — Custom cron parser handles common patterns (hourly, daily, weekly, step intervals)
- **Chat service reuse** — Proactive tasks call generateReply() the same way user messages do
- **Audit trail** — Every execution (heartbeat, cron, background) logged to ai_agent_task_runs
- **Error resilience** — Failed tasks advance timestamps to prevent retry storms; errors logged but don't crash engine

---

## 2.0.0-alpha.3 (2026-01-31)

### Phase 2: Deep Tool Ecosystem ✅

Real-world tools beyond API wrappers — agents can now search the web and read pages.

#### 2A: Web Search Tool
- Created `server/src/tools/webSearch.ts`
- Tool name: `web__search` — search the web via Brave Search API
- Input: `{ query: string, count?: number }` (default count=5, max 10)
- Returns formatted results with title, URL, and snippet
- Graceful degradation: if `BRAVE_API_KEY` not set, returns helpful error message (tool still registered)
- Logging: logs query and result count on every call

#### 2B: Web Fetch Tool
- Created `server/src/tools/webFetch.ts`
- Tool name: `web__fetch` — fetch a URL and extract readable text content
- Input: `{ url: string, maxChars?: number }` (default maxChars=10000)
- Simple HTML-to-text extraction: strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<noscript>`, `<svg>` blocks; decodes HTML entities; collapses whitespace
- Extracts page `<title>`, returns structured output with url/title/content/truncated
- 2MB download limit, 15s timeout, User-Agent header
- No new dependencies — uses axios (already installed) + regex
- Logging: logs URL and extracted char count on every call

#### 2C: Tool Registration
- Created `server/src/tools/deepTools.ts` — barrel file exporting all deep tool definitions and unified executor
- `getDeepToolDefinitions()` returns tool schemas (same format as memory tools)
- `isDeepTool(name)` checks if a tool name is a deep tool
- `executeDeepTool(toolCall)` routes to the correct handler
- Updated `server/src/llm/toolExecutor.ts`:
  - Imports deep tools alongside memory tools
  - Adds deep tools to tool list when `deepTools` feature flag is enabled
  - Routes `web__search` and `web__fetch` calls through deep tool executor
  - Output truncation (20k chars) applied consistently

#### 2D: Feature Flag
- Added `deepTools: boolean` to `FeatureFlags` interface in `features.ts`
- Added to `BASE_FEATURES` (false) and `FULL_FEATURES` (true)
- Added `FEATURE_DEEP_TOOLS` env var support in licensing `index.ts`
- Added `deepTools` to license key validation in `license.ts`
- Added `deepTools` to feature summary logging
- All deep tools gated by this flag — if off, tools don't appear in tool list

#### 2E: Logging
- `web__search`: logs query string and result count
- `web__fetch`: logs URL and extracted character count
- `toolExecutor`: logs when deep tools are added to tool list

### Design Principles
- **Pattern consistency:** Follows exact same structure as Phase 1 memory tools (memoryTools.ts)
- **No new dependencies:** Uses axios (already installed) + regex for HTML extraction
- **Graceful degradation:** Missing BRAVE_API_KEY = helpful error, not a crash
- **Feature flag modularity:** deepTools=false → these tools simply don't exist in the tool list
- **Simple extraction:** No Playwright, no Puppeteer, no heavy libraries — just HTML stripping

---

## 2.0.0-alpha.2 (2026-01-30)

### Phase 1: Soul & Memory System ✅

The core differentiator — agents that remember and evolve.

#### 1A: Database Schema
- Created `ai_agent_documents` table — stores soul.md, memory.md, context.md, daily/*.md per agent
- Created `ai_agent_memory_embeddings` table — chunked vector embeddings for semantic search
- Added indexes: agent_id+doc_type, unique agent_id+doc_key, HNSW vector similarity
- SQL migration files: `server/src/db/migrations/001_agent_documents.sql`, `002_agent_memory_embeddings.sql`
- Updated `server/src/db/schema.ts` with Drizzle table definitions
- Updated `server/src/db/init.ts` to auto-create tables on startup

#### 1B: Document Service
- `server/src/memory/documentService.ts` — getDocument, upsertDocument, listDocuments, deleteDocument, searchMemory (pgvector semantic search)
- `server/src/memory/memoryEmbedder.ts` — auto-chunk documents by paragraph/heading, generate OpenAI embeddings, incremental re-embedding (only changed chunks updated)
- `server/src/memory/defaults.ts` — default templates for soul.md, memory.md, context.md

#### 1C: Agent Integration
- On agent creation → auto-creates default soul.md, memory.md, context.md (when soulMemory enabled)
- Modified `chatService.ts` — injects soul.md + context.md as system prompt when soulMemory is enabled; falls back to v1 static instructions when disabled
- Added memory recall step — before responding, searches agent memory for relevant context and includes top results
- Registered 4 memory tools the LLM can call:
  - `memory__read(doc_key)` — read a document
  - `memory__write(doc_key, content)` — update a document
  - `memory__search(query)` — semantic search across memory
  - `memory__append(doc_key, text)` — append to daily log
- Tools integrated into tool executor alongside MCP Hub tools

#### 1D: API Routes
- `GET /api/agents/:id/documents` — list documents
- `GET /api/agents/:id/documents/:key` — read document
- `PUT /api/agents/:id/documents/:key` — create/update document
- `DELETE /api/agents/:id/documents/:key` — delete document
- `POST /api/agents/:id/memory/search` — semantic search (body: { query, topK })
- All routes gated by soulMemory feature flag (403 if disabled)

#### 1E: Feature Flag
- Added `soulMemory` flag to FeatureFlags interface
- Updated BASE_FEATURES (default: false), FULL_FEATURES (default: true)
- Updated license validation to include soulMemory
- Updated env var loader for `FEATURE_SOUL_MEMORY`
- All new code checks soulMemory flag — app works exactly as v1 when disabled

### Design Principles
- **Modularity:** soulMemory=false → pure v1 behavior. No code paths break.
- **Incremental embedding:** Only changed document chunks are re-embedded on update.
- **Background processing:** Embedding runs fire-and-forget to not block API responses.
- **Existing patterns:** Follows codebase conventions (Drizzle ORM, Express Router, pgvector, OpenAI embeddings).

---

## 2.0.0-alpha.1 (2026-01-30)

### Vision
Agent-in-a-Box v2 adds soul/memory, proactive behavior, deep tools, and multi-channel delivery
to the existing enterprise chatbot platform. Every new capability is independently toggleable.

### Phase 0: Foundation
- Cloned from Agent-in-a-Box v1
- Fresh git repo initialized
- Updated package.json (name, version, description)
- Added v2 feature flags to .env.example
- Cleaned temp files
- Created architecture doc and build plan

### Planned Phases
- **Phase 1:** Soul & Memory System — self-evolving agent personality and memory ✅
- **Phase 2:** Deep Tool Ecosystem — web search, fetch, memory tools
- **Phase 3:** Proactive Engine — heartbeats, cron jobs, background agents
- **Phase 4:** Multi-Channel Delivery — Slack, Teams, webhooks
- **Phase 5:** Session Continuity — cross-session learning, context management
- **Phase 6:** Security & Hardening
- **Phase 7:** Licensing v2 & Modularity

See `../AGENTINABOX_V2_BUILD_PLAN.md` for full checklist.
