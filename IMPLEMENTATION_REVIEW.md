# Agent-in-a-Box v2 — Full Implementation Reference

**Version:** 2.0.0-alpha.7
**Date:** 2026-01-30
**Author:** AgenticLedger (Ore Phillips)
**Status:** All 7 phases built. 42/43 tests passing. Pre-deployment.

---

## 1. Architecture Overview

Agent-in-a-Box v2 is an **enterprise AI agent platform** that allows customers to deploy white-labeled AI agents with memory, tools, proactive behavior, and multi-channel delivery. Built on Express 5 + TypeScript + PostgreSQL (pgvector) + Drizzle ORM.

### System Diagram
```
┌──────────────────────────────────────────────────────┐
│                    Admin Dashboard                    │
│              (Vite + React + TypeScript)              │
│              localhost:5173 → API :4500               │
└───────────────────────┬──────────────────────────────┘
                        │ REST API
┌───────────────────────▼──────────────────────────────┐
│                   Express 5 Server                    │
│                  (localhost:4500)                      │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Chat Engine  │  │ Admin Routes │  │Memory Routes│ │
│  │  (streaming  │  │  (CRUD for   │  │ (doc CRUD + │ │
│  │   + tools)   │  │  agents, KB) │  │  search)    │ │
│  └──────┬───────┘  └──────────────┘  └─────────────┘ │
│         │                                             │
│  ┌──────▼───────────────────────────────────────────┐│
│  │              Context Builder (Phase 5)            ││
│  │  soul.md + context.md + memory recall + history   ││
│  │  + session summaries + channel awareness          ││
│  └──────┬───────────────────────────────────────────┘│
│         │                                             │
│  ┌──────▼──────┐  ┌────────────┐  ┌───────────────┐ │
│  │ Tool Executor│  │  MCP Hub   │  │  Deep Tools   │ │
│  │ (loop up to  │  │(anyapi,    │  │ (web_search,  │ │
│  │  10 iters)   │  │ bundled)   │  │  web_fetch)   │ │
│  └──────────────┘  └────────────┘  └───────────────┘ │
│                                                       │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Proactive  │  │   Channel    │  │  Licensing   │ │
│  │   Engine    │  │   Router     │  │   System     │ │
│  │ (heartbeat  │  │ (Slack,Teams │  │ (JWT keys,   │ │
│  │  + cron)    │  │  webhook)    │  │  3 tiers)    │ │
│  └────────────┘  └──────────────┘  └──────────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐│
│  │         PostgreSQL + pgvector (Drizzle ORM)       ││
│  │  ai_agents, ai_conversations, ai_messages,        ││
│  │  ai_agent_documents, ai_agent_memory_embeddings,  ││
│  │  ai_agent_cron_jobs, ai_agent_channels, ...       ││
│  └──────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────┘
```

### Stack
- **Runtime:** Node.js 22 + TypeScript 5.9
- **Framework:** Express 5 (path-to-regexp v8)
- **Database:** PostgreSQL + pgvector extension (1536-dim OpenAI embeddings)
- **ORM:** Drizzle ORM 0.45
- **LLM Providers:** Anthropic (Claude), OpenAI, Google Gemini, Grok — per-agent configurable
- **Frontend:** Vite + React + TypeScript (admin dashboard + chat widget)
- **Licensing:** JWT-signed license keys with 3 tiers (starter/pro/enterprise)

### Key Dependencies
```json
{
  "@anthropic-ai/sdk": "^0.71.2",
  "@google/generative-ai": "^0.24.1",
  "openai": "^6.15.0",
  "express": "^5.2.1",
  "express-rate-limit": "^7.5.0",
  "drizzle-orm": "^0.45.1",
  "jsonwebtoken": "^9.0.3",
  "zod": "^4.2.1",
  "pg": "^8.16.3"
}
```

---

## 2. Database Schema (16 tables)

### Core Tables
| Table | Purpose |
|-------|---------|
| `ai_agents` | Agent definitions (name, model, instructions, branding, features JSONB) |
| `ai_conversations` | Sessions with channelType, sessionSummary, messageCount |
| `ai_messages` | Messages (user/assistant/system) with metadata JSONB |
| `ai_documents` | Knowledge base documents (folderId, category, tags) |
| `ai_document_chunks` | RAG embeddings (pgvector 1536-dim) |

### v2 Soul & Memory Tables
| Table | Purpose |
|-------|---------|
| `ai_agent_documents` | Agent-editable docs: soul.md, memory.md, context.md, daily/*.md |
| `ai_agent_memory_embeddings` | Chunked embeddings for semantic search across memory |

### v2 Proactive Tables
| Table | Purpose |
|-------|---------|
| `ai_agent_cron_jobs` | Scheduled tasks with cron/interval, model override, enabled flag |
| `ai_agent_heartbeat_config` | Per-agent heartbeat: interval, checklist, quiet hours, timezone |
| `ai_agent_task_runs` | Execution audit log (heartbeat/cron/background runs) |

### v2 Channel Tables
| Table | Purpose |
|-------|---------|
| `ai_agent_channels` | Per-agent channel configs (Slack/Teams/webhook) with JSONB config |

### Supporting Tables
| Table | Purpose |
|-------|---------|
| `ai_capabilities` | Capability registry (MCP servers, anyapi) |
| `ai_agent_capabilities` | Per-agent capability enablement |
| `ai_capability_tokens` | Encrypted credential storage (5 token fields + IV) |
| `ai_agent_api_keys` | Per-agent LLM API keys (AES-256-GCM encrypted) |
| `ai_folders` / `ai_tags` / `ai_document_tags` | KB organization (folders, tags, junction) |
| `ai_gitlab_connections` / `ai_gitlab_refreshes` | GitLab KB sync config + refresh history |

---

## 3. Feature Flag / Licensing System

### Architecture
```
License Key (JWT) → validateLicenseKey() → FeatureFlags → setFeatures()
                                                            │
                                      ┌─────────────────────┤
                                      ▼                     ▼
                               getFeatures()        getAgentFeatures(agentId)
                             (global ceiling)    (per-agent: global AND override)
```

### Three Tiers
| Feature | Starter | Pro | Enterprise |
|---------|---------|-----|------------|
| multiAgent | ❌ | ✅ (5) | ✅ (100) |
| multimodal | ✅ | ✅ | ✅ |
| mcpHub | ✅ | ✅ | ✅ |
| customBranding | ❌ | ✅ | ✅ |
| gitlabKbSync | ❌ | ✅ | ✅ |
| **soulMemory** | ❌ | ✅ | ✅ |
| **deepTools** | ❌ | ✅ | ✅ |
| **proactive** | ❌ | ❌ | ✅ |
| **backgroundAgents** | ❌ | ❌ | ✅ |
| **multiChannel** | ❌ | ✅ | ✅ |

### How It Works
1. **License keys** are signed JWTs containing `FeatureFlags`. Only AgenticLedger can generate them (requires `LICENSE_SECRET`).
2. **In production**, env var overrides are **disabled** — must have a valid license key.
3. **In development**, `FEATURE_*` env vars override base features (for testing).
4. **Per-agent overrides**: v2 features (soul, deep tools, proactive, channels) can be disabled per-agent via `features` JSONB column. Agent can only *restrict*, never exceed global.
5. **Resolution logic**: `effective = global_flag AND (agent_override !== false)`

### Agent Feature Resolution (agentFeatures.ts)
```typescript
export async function getAgentFeatures(agentId: string): Promise<FeatureFlags> {
  const globalFeatures = getFeatures();
  const agentOverrides = await loadAgentOverrides(agentId); // from DB, 30s cache
  return {
    // Non-v2: always global
    multiAgent: globalFeatures.multiAgent,
    mcpHub: globalFeatures.mcpHub,
    // ...
    // v2: global AND agent override
    soulMemory: globalFeatures.soulMemory && (agentOverrides.soulMemory !== false),
    deepTools: globalFeatures.deepTools && (agentOverrides.deepTools !== false),
    proactive: globalFeatures.proactive && (agentOverrides.proactive !== false),
    backgroundAgents: globalFeatures.backgroundAgents && (agentOverrides.backgroundAgents !== false),
    multiChannel: globalFeatures.multiChannel && (agentOverrides.multiChannel !== false),
  };
}
```

---

## 4. Chat Engine (chatService.ts)

### Request Flow
```
User message → startConversation → appendMessage(user) → generateReply()
                                                           │
                                                           ▼
                                                    agentHasToolsEnabled?
                                                    ├─ Yes → executeWithTools (loop)
                                                    └─ No  → provider.generate (simple)
                                                           │
                                                           ▼
                                                    appendMessage(assistant)
                                                    appendToDailyLog (fire-and-forget)
                                                    postResponseMaintenance (fire-and-forget)
                                                           │
                                                           ▼
                                                    { reply, sources, toolsUsed }
```

### Context Assembly (contextBuilder.ts)
Before every LLM call, the context builder assembles:
1. **System prompt**: soul.md + context.md (if soulMemory=ON) or static instructions (v1)
2. **Memory recall**: Semantic search across agent memory docs (top 5, similarity > 0.3)
3. **Session history**: Last N messages from current conversation (4 if tools, 20 if not)
4. **Session summaries**: LLM-generated summaries of last 3 prior conversations
5. **Channel awareness**: Appends "This conversation is via {channelType}"
6. **RAG context**: Knowledge base search (still in chatService, not contextBuilder)

All independent lookups run in parallel via `Promise.all`.

### Tool Executor (toolExecutor.ts)
The tool executor handles a multi-turn tool calling loop:

1. **Get tools**: `getDetailedToolsForAgent()` collects:
   - MCP Hub tools (filtered by agent's enabled capabilities, max 20, priority-sorted)
   - Memory tools (if `soulMemory` enabled): `memory__read`, `memory__write`, `memory__search`, `memory__append`
   - Deep tools (if `deepTools` enabled): `web__search`, `web__fetch`

2. **Loop** (max 10 iterations):
   - Call LLM with tools
   - If text response → done
   - If tool calls → execute each (memory, deep, or MCP), append results, loop

3. **Tool namespacing**: Tools are prefixed `server__toolname` (e.g., `ccview__get_governance_info`). Memory tools are `memory__read`, deep tools are `web__search`.

4. **Output truncation**: Tool outputs are capped at 20,000 chars to prevent token overflow.

### Streaming
The server supports SSE streaming via `streamReply()`. When tools are involved, tools execute first (non-streaming), then the final response is word-simulated. Without tools, native LLM streaming is used.

---

## 5. Soul & Memory System (Phase 1)

### Document Types
| Doc Key | Doc Type | Purpose |
|---------|----------|---------|
| `soul.md` | soul | Agent personality, tone, behavior rules |
| `memory.md` | memory | Long-term curated memory |
| `context.md` | context | Current context / working notes |
| `daily/YYYY-MM-DD.md` | daily | Auto-appended conversation log |
| (custom) | custom | User-created documents |

### Memory Tools (LLM-callable)
```
memory__read(doc_key)              — Read a document
memory__write(doc_key, content)    — Overwrite a document
memory__search(query, top_k)       — Semantic search
memory__append(doc_key, text)      — Append to a document
```

### Embedding Pipeline
- Documents are chunked and embedded using OpenAI's `text-embedding-3-small` (1536-dim)
- Stored in `ai_agent_memory_embeddings` using pgvector
- Semantic search uses cosine similarity via pgvector's `<=>` operator
- Embeddings are regenerated on document upsert (fire-and-forget)

### Daily Log
After every chat response, a fire-and-forget function appends to `daily/YYYY-MM-DD.md`:
```markdown
### HH:MM - [widget]
User: {first 100 chars}...
Agent: {first 200 chars}...
```

---

## 6. Deep Tools (Phase 2)

### web__search
- Uses Brave Search API (`BRAVE_API_KEY`)
- Input: `{ query, count?, freshness? }`
- Returns: title + URL + description for top results

### web__fetch
- HTTP GET with HTML → text extraction
- Input: `{ url, max_chars? }`
- Strips scripts/styles, extracts text content
- Max 50,000 chars output

---

## 7. Proactive Engine (Phase 3)

### Architecture
```
ProactiveEngine (singleton)
  └── setInterval(poll, 60_000)
        ├── checkHeartbeats()
        │     └── getAllEnabledConfigs() → isDue() → executeHeartbeat()
        └── checkCronJobs()
              └── getDueJobs() → executeJob()
```

### Heartbeats
- Per-agent config: `intervalMinutes`, `checklist` (markdown), `quietHoursStart/End`, `timezone`
- `isDue()` checks: enabled + interval elapsed + not in quiet hours
- Execution: creates a system conversation, sends the checklist as user message, logs result to `ai_agent_task_runs`

### Cron Jobs
- Schedule: cron expressions or simple intervals ("every 30m", "every 2h")
- Fields: `taskText`, `model` (optional override), `enabled`, `lastRunAt`, `nextRunAt`
- `getDueJobs()` finds jobs where `nextRunAt <= now AND enabled`
- After execution, `nextRunAt` is recalculated

### Background Agents
- Spawn fire-and-forget sub-tasks via API
- Creates an isolated conversation, runs the task, logs to `ai_agent_task_runs`
- Feature-gated: requires `backgroundAgents` flag

---

## 8. Multi-Channel System (Phase 4)

### Channel Router (singleton)
```typescript
class ChannelRouter {
  adapters: Map<string, ChannelAdapter>;  // registered adapters
  initializedChannels: Set<string>;        // tracking initialized configs
  
  // Outbound: agent → channel
  sendMessage(channelType, channelId, message)
  sendToAllChannels(agentId, text)  // for proactive broadcasts
  
  // Inbound: channel → agent
  handleInbound(channelType, req, res)
  processInbound(inbound)  // route to chatService, send reply back
}
```

### Adapters
Each adapter implements `ChannelAdapter` interface:
- **SlackAdapter**: Bot token auth, Slack API for sending, event webhooks for receiving
- **TeamsAdapter**: Bot Framework auth, activity handling
- **WebhookAdapter**: Generic webhook for custom integrations

### Message Formatting
`formatForChannel()` adapts markdown to platform-specific syntax (e.g., Slack mrkdwn, Teams card format).

### Channel CRUD API
```
POST   /api/agents/:id/channels           — Create channel config
GET    /api/agents/:id/channels           — List channels (secrets masked)
PUT    /api/agents/:id/channels/:chanId   — Update
DELETE /api/agents/:id/channels/:chanId   — Delete
```

---

## 9. Session Continuity (Phase 5)

### Context Builder (detailed above in §4)
Central orchestration point for all context assembly.

### Session Manager
- `updateSessionActivity()`: bumps `message_count` and `last_message_at` on each response
- `shouldSummarize()`: checks if message count exceeds threshold (e.g., 20) and no summary exists yet
- `summarizeSession()`: calls LLM to generate a 2-3 sentence summary, stored in `session_summary`
- `getRecentSessions()`: loads last N sessions for an agent (used in context builder)

### Memory Distiller
- Periodically reviews daily logs and extracts key insights
- Updates `memory.md` with distilled learnings
- Triggered via heartbeat/cron or manual API call

---

## 10. Security (Phase 6)

### Authentication
- `requireAuth` middleware checks `Authorization: Bearer <token>` header
- Token validated against `API_SECRET` env var
- Admin routes protected; chat widget endpoints are public-facing

### Input Validation
- Zod schemas for request bodies (`documentUpdateSchema`, `memorySearchSchema`, etc.)
- `validate()` middleware returns 400 with structured errors on invalid input
- **Known gap**: heartbeat PUT route missing validation middleware for `intervalMinutes` (accepts 0)

### Rate Limiting
- `express-rate-limit` applied to chat endpoints
- Configurable via `RATE_LIMIT_*` env vars

### CORS
- Configured per-environment (permissive in dev, restrictive in production)

### Logging
- Structured logger (`utils/logger.ts`) used throughout
- Request/response logging for all API calls

---

## 11. REST API Summary

### Infrastructure
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/health` | Health check (db status, version, uptime) |

### Agent CRUD
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/agents` | List all agents |
| POST | `/api/admin/agents` | Create agent (checks license limit) |
| GET | `/api/admin/agents/:id` | Get agent |
| PUT | `/api/admin/agents/:id` | Update agent |
| DELETE | `/api/admin/agents/:id` | Delete agent (prevents last) |
| GET | `/api/admin/agents/:id/features` | Get resolved features (global + agent) |

### Chat
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/chat/conversations` | Start conversation |
| POST | `/api/chat/conversations/:id/messages` | Send message (returns reply) |
| POST | `/api/chat/conversations/:id/stream` | SSE streaming reply |

### Soul & Memory
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/agents/:id/documents` | List agent documents |
| GET | `/api/agents/:id/documents/:key` | Read document |
| PUT | `/api/agents/:id/documents/:key` | Upsert document |
| DELETE | `/api/agents/:id/documents/:key` | Delete document |
| POST | `/api/agents/:id/memory/search` | Semantic search |

### Proactive Engine
| Method | Route | Purpose |
|--------|-------|---------|
| GET/PUT | `/api/agents/:id/heartbeat` | Get/set heartbeat config |
| CRUD | `/api/agents/:id/cron-jobs` | Cron job management |
| POST | `/api/agents/:id/proactive/run` | Trigger background task |
| GET | `/api/agents/:id/proactive/runs` | List task runs |

### Channels
| Method | Route | Purpose |
|--------|-------|---------|
| CRUD | `/api/agents/:id/channels` | Channel config management |
| POST | `/api/channels/:type/inbound` | Inbound webhook endpoint |

### Knowledge Base
| Method | Route | Purpose |
|--------|-------|---------|
| CRUD | `/api/admin/agents/:id/folders` | Folder management |
| CRUD | `/api/admin/agents/:id/tags` | Tag management |
| CRUD | `/api/admin/agents/:id/documents` | KB document management |
| POST | `/api/admin/agents/:id/documents/bulk-*` | Bulk operations |

### Capabilities & MCP
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/capabilities` | List capabilities |
| POST | `/api/admin/capabilities/:id/toggle` | Enable/disable |
| CRUD | `/api/admin/agents/:id/api-keys` | Per-agent LLM keys |
| GET | `/api/admin/mcp/status` | MCP Hub status |
| POST | `/api/admin/mcp/execute` | Test tool execution |

---

## 12. Startup Sequence

```typescript
// index.ts startup order
app.listen(port, async () => {
  initializeLicensing();          // 1. Load license/env → set feature flags
  await initializeDatabase();      // 2. pgvector extension, migrations
  await initializeMCPHub();        // 3. Register MCP servers (if licensed)
  await initializeCapabilities();  // 4. Seed default capabilities (if licensed)
  proactiveEngine.start();         // 5. Start heartbeat/cron polling (if licensed)
  await initializeChannels();      // 6. Load channel configs, init adapters (if licensed)
});

// Graceful shutdown
process.on('SIGTERM', () => {
  proactiveEngine.stop();
  channelRouter.shutdown();
  process.exit(0);
});
```

---

## 13. Test Results (42/43 PASS)

### Summary
| Category | Pass | Fail |
|----------|------|------|
| API Tests (A1-A14) | 33 | 1 |
| Browser Tests (B1-B4) | 9 | 0 |
| **Total** | **42** | **1** |

### Key Verifications
- ✅ Soul injection (agent personality from soul.md)
- ✅ Memory write via LLM tool call
- ✅ Cross-session memory recall (API + browser widget)
- ✅ Auto daily logs (daily/YYYY-MM-DD.md created after chat)
- ✅ Heartbeat/cron/channel CRUD
- ✅ Input validation (400 on bad data)
- ✅ Health check with DB status
- ✅ Feature flag gating (all features ON for testing)
- ✅ Admin UI fully functional (chat, KB, config, tools tabs)

### Known Issue
- **A13.3** (minor): Heartbeat PUT route doesn't enforce Zod validation on `intervalMinutes`. Accepts 0 when it should reject.

---

## 14. Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
ANTHROPIC_API_KEY=sk-ant-...

# Optional LLM
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
GROK_API_KEY=...
LLM_PROVIDER=claude          # default provider

# Server
PORT=4500
NODE_ENV=development
API_SECRET=your-api-secret    # for auth middleware

# v2 Features (dev only — production requires license key)
FEATURE_SOUL_MEMORY=true
FEATURE_DEEP_TOOLS=true
FEATURE_PROACTIVE=true
FEATURE_BACKGROUND_AGENTS=true
FEATURE_MULTI_CHANNEL=true
FEATURE_MULTI_AGENT=true
FEATURE_MCP_HUB=true
FEATURE_MULTIMODAL=true
FEATURE_CUSTOM_BRANDING=true

# Deep Tools
BRAVE_API_KEY=...             # for web__search

# Licensing
AGENTICLEDGER_LICENSE_KEY=eyJ...   # signed JWT
LICENSE_SECRET=...                  # for generating keys (AgenticLedger only)
```

---

## 15. File Structure (server/src/)

```
src/
├── index.ts                     # Entry point, startup sequence
├── config/
│   └── appConfig.ts             # Config loader, type definitions
├── db/
│   ├── client.ts                # Drizzle + pg Pool
│   ├── init.ts                  # DB migrations, pgvector setup
│   └── schema.ts                # 16 Drizzle table definitions
├── chat/
│   └── chatService.ts           # Chat engine (generate + stream + daily log)
├── llm/
│   ├── index.ts                 # Provider registry
│   ├── types.ts                 # LLMMessage, Tool, ToolCall types
│   ├── toolExecutor.ts          # Tool calling loop (MCP + memory + deep)
│   ├── anthropicProvider.ts     # Claude SDK wrapper
│   ├── openaiProvider.ts        # OpenAI SDK wrapper
│   └── geminiProvider.ts        # Gemini SDK wrapper
├── licensing/
│   ├── index.ts                 # Init, env parsing, licensing status
│   ├── features.ts              # FeatureFlags type, BASE/FULL presets, getters
│   ├── license.ts               # JWT sign/verify, tier presets, key generation
│   └── agentFeatures.ts         # Per-agent resolution (global AND override)
├── memory/
│   ├── index.ts                 # Barrel exports
│   ├── defaults.ts              # Auto-create soul.md/memory.md/context.md
│   ├── documentService.ts       # CRUD for ai_agent_documents
│   ├── memoryEmbedder.ts        # Chunking + embedding pipeline
│   └── memoryTools.ts           # LLM-callable memory tools
├── session/
│   ├── index.ts                 # Barrel exports
│   ├── contextBuilder.ts        # Context assembly orchestrator
│   ├── sessionManager.ts        # Activity tracking, summarization
│   └── memoryDistiller.ts       # Daily log → memory.md distillation
├── tools/
│   ├── deepTools.ts             # Deep tool definitions + executor
│   ├── webSearch.ts             # Brave Search API client
│   ├── webFetch.ts              # HTML fetch + text extraction
│   └── gitlab/                  # GitLab KB sync (client, refresh, converters)
├── proactive/
│   ├── index.ts                 # Barrel exports
│   ├── proactiveEngine.ts       # Singleton polling loop (60s interval)
│   ├── heartbeatService.ts      # Heartbeat check + execution
│   ├── cronService.ts           # Cron check + execution + scheduling
│   └── backgroundAgent.ts       # Fire-and-forget sub-task spawner
├── channels/
│   ├── index.ts                 # Barrel exports
│   ├── channelRouter.ts         # Singleton router (send + receive)
│   ├── messageFormatter.ts      # Platform-specific message formatting
│   ├── types.ts                 # ChannelAdapter, ChannelMessage interfaces
│   ├── slack/slackAdapter.ts    # Slack bot adapter
│   ├── teams/teamsAdapter.ts    # Teams bot adapter
│   └── webhook/webhookAdapter.ts # Generic webhook adapter
├── http/
│   ├── app.ts                   # Express app setup (CORS, rate limit, routes)
│   ├── adminRoutes.ts           # Admin API (~1700 lines)
│   └── memoryRoutes.ts          # Memory/document API
├── middleware/
│   ├── auth.ts                  # Bearer token auth
│   ├── rateLimit.ts             # Rate limiting config
│   └── validation.ts            # Zod validation middleware
├── rag/
│   └── ragService.ts            # Knowledge base RAG (existing v1)
├── mcp-hub/                     # MCP server management (existing v1)
├── capabilities/                # Capability registry (existing v1)
└── utils/
    └── logger.ts                # Structured logging
```

---

## 16. Integration Points for Platform Embedders

### Embedding the Chat Widget
The chat widget is a React component that connects to the server via REST + SSE:
- `POST /api/chat/conversations` — start a session
- `POST /api/chat/conversations/:id/stream` — SSE streaming messages
- Widget expects `agent_id` parameter to target a specific agent

### Multi-Tenant Setup
- Each agent is isolated: own documents, memory, channels, capabilities, API keys
- `features` JSONB on the agent allows per-customer feature toggling
- License key controls global ceiling; per-agent overrides only restrict

### Custom Tool Integration
- Register custom MCP servers via `POST /api/admin/mcp/custom-server`
- Or use the anyapi capability for JSON-configurable REST API tools
- Tools are namespaced `server__toolname` to avoid conflicts

### Webhook Integration
- Configure webhook channel via `POST /api/agents/:id/channels`
- Set `callback_url` in config for outbound messages
- Send inbound messages to `POST /api/channels/webhook/inbound`

---

## 17. Design Decisions & Trade-offs

1. **In-process proactive engine** (no Redis/Bull): Simpler deployment, but no horizontal scaling for proactive tasks. Fine for single-instance deployments.

2. **pgvector over Pinecone/Weaviate**: Co-located with main DB, no extra service to manage. Trade-off: won't scale to millions of vectors per agent.

3. **JWT license keys**: Offline validation (no license server needed). Trade-off: can't revoke keys without updating the secret.

4. **Fire-and-forget daily logs**: Non-blocking but can silently fail. Acceptable for audit-level data.

5. **Tool output truncation at 20K chars**: Prevents token overflow but may lose data. Tools returning large datasets need pagination.

6. **Per-agent feature overrides stored in JSONB**: Flexible but untyped at DB level. Application code enforces schema.

7. **30-second agent features cache**: Reduces DB load but means feature changes take up to 30s to propagate.

8. **Streaming with tools**: When tools are used, streaming is simulated (word-by-word delay). True streaming only works for tool-free responses.

---

*This document is intended for integration partners evaluating the Agent-in-a-Box v2 implementation. For questions, contact the AgenticLedger team.*
