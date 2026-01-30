# Modularity Test Plan — Agent-in-a-Box v2

Every v2 capability is independently toggleable via its feature flag.
When a flag is OFF, the system behaves exactly like v1 for that capability.

---

## Feature Flag: `soulMemory`

**Controls:** Soul & Memory system (soul.md, memory.md, context.md, daily logs, semantic search)

### When OFF (v1 behavior):
| Area | Behavior |
|------|----------|
| **System Prompt** | Uses v1 static `instructions` field from agent DB record |
| **Memory Recall** | No semantic memory search before response |
| **Memory Tools** | `memory__read`, `memory__write`, `memory__search`, `memory__append` **not included** in tool list |
| **Daily Logs** | No daily log auto-append after conversation turns |
| **Agent Creation** | Default soul.md, memory.md, context.md documents **not created** |
| **Session Summaries** | Not included in system prompt context |
| **Cross-Channel Awareness** | Not appended to system prompt |

### Endpoints returning 403:
- `GET /api/agents/:id/documents`
- `GET /api/agents/:id/documents/:key`
- `PUT /api/agents/:id/documents/:key`
- `DELETE /api/agents/:id/documents/:key`
- `POST /api/agents/:id/memory/search`

### Guard locations:
- `server/src/session/contextBuilder.ts` — `buildContext()` and `buildSystemPrompt()` check flag
- `server/src/http/memoryRoutes.ts` — `requireSoulMemory` middleware on all routes
- `server/src/http/adminRoutes.ts` — agent creation skips `createDefaultDocuments()` when off
- `server/src/llm/toolExecutor.ts` — `getDetailedToolsForAgent()` skips MEMORY_TOOLS when off
- `server/src/chat/chatService.ts` — `appendToDailyLog()` returns early when off

---

## Feature Flag: `deepTools`

**Controls:** Web search and web fetch tools (web__search, web__fetch)

### When OFF (v1 behavior):
| Area | Behavior |
|------|----------|
| **Tool List** | `web__search` and `web__fetch` **not included** in available tools |
| **Chat** | Agent cannot search the web or fetch URLs (v1 MCP Hub tools only) |
| **Server Startup** | No effect — tools are loaded on-demand |

### Endpoints returning 403:
None — deep tools are gated at the tool executor level, not via API routes.

### Guard locations:
- `server/src/llm/toolExecutor.ts` — `getDetailedToolsForAgent()` skips DEEP_TOOLS when off

---

## Feature Flag: `proactive`

**Controls:** Heartbeat polling, cron job scheduling, proactive engine

### When OFF (v1 behavior):
| Area | Behavior |
|------|----------|
| **Proactive Engine** | `start()` is a no-op — no polling loop, no background execution |
| **Heartbeats** | Not polled, not executed |
| **Cron Jobs** | Not polled, not executed |
| **Server Startup** | Engine logs "disabled" and returns immediately |

### Endpoints returning 403:
- `GET /api/agents/:id/heartbeat`
- `PUT /api/agents/:id/heartbeat`
- `GET /api/agents/:id/cron`
- `POST /api/agents/:id/cron`
- `PUT /api/agents/:id/cron/:jobId`
- `DELETE /api/agents/:id/cron/:jobId`
- `POST /api/agents/:id/cron/:jobId/run`
- `GET /api/agents/:id/proactive/runs`

### Services not started:
- `ProactiveEngine` polling loop does not start
- No `setInterval` created

### Guard locations:
- `server/src/proactive/proactiveEngine.ts` — `start()` checks flag, returns early
- `server/src/http/proactiveRoutes.ts` — `requireProactive` middleware on all routes

---

## Feature Flag: `backgroundAgents`

**Controls:** Sub-agent spawning for fire-and-forget tasks

### When OFF (v1 behavior):
| Area | Behavior |
|------|----------|
| **spawnTask()** | Throws `Error('Background agents feature is not enabled')` |
| **Task Runs** | No background tasks created |

### Endpoints returning 403:
None — background agents are triggered programmatically (by proactive engine or tools), not via direct API endpoint.

### Guard locations:
- `server/src/proactive/backgroundAgent.ts` — `spawnTask()` checks flag, throws if off

---

## Feature Flag: `multiChannel`

**Controls:** Slack, Teams, and webhook channel adapters

### When OFF (v1 behavior):
| Area | Behavior |
|------|----------|
| **Channel Router** | Not initialized — no adapters registered |
| **Channel Adapters** | Slack, Teams, Webhook adapters **not loaded** |
| **Webhook Endpoints** | Return 404 (not 403) |
| **Server Startup** | Logs "Multi-channel disabled" and skips initialization |
| **Widget** | Works normally (widget is always available) |

### Endpoints returning 403:
- `GET /api/agents/:id/channels`
- `POST /api/agents/:id/channels`
- `PUT /api/agents/:id/channels/:channelId`
- `DELETE /api/agents/:id/channels/:channelId`

### Endpoints returning 404:
- `POST /api/channels/slack/events`
- `POST /api/channels/teams/messages`
- `POST /api/channels/webhook/:agentId`

### Services not started:
- `ChannelRouter` — no adapters registered, `initializeAll()` not called
- Slack WebSocket/Events listener not started
- Teams Bot Framework not listening
- Webhook callbacks not active

### Guard locations:
- `server/src/index.ts` — `initializeChannels()` checks flag, skips if off
- `server/src/http/channelRoutes.ts` — `requireMultiChannel` middleware on CRUD routes
- `server/src/http/channelRoutes.ts` — webhook endpoints individually check flag (return 404)

---

## Independence Matrix

Each row shows a flag combination. ✅ = works, ❌ = feature disabled (v1 behavior).

| soulMemory | deepTools | proactive | backgroundAgents | multiChannel | Expected Result |
|:---:|:---:|:---:|:---:|:---:|----|
| ❌ | ❌ | ❌ | ❌ | ❌ | **v1 equivalent (Starter tier)** — widget, RAG, MCP tools |
| ✅ | ❌ | ❌ | ❌ | ❌ | v1 + soul/memory, agent has personality |
| ✅ | ✅ | ❌ | ❌ | ❌ | + web search and fetch tools |
| ✅ | ✅ | ❌ | ❌ | ✅ | + Slack/Teams/webhook channels (Pro tier) |
| ✅ | ✅ | ✅ | ✅ | ✅ | **Everything (Enterprise tier)** |
| ❌ | ❌ | ✅ | ✅ | ❌ | Proactive + background but no memory — works (uses v1 instructions) |
| ❌ | ❌ | ❌ | ❌ | ✅ | Channels only — works (widget + Slack/Teams/webhook) |

### Key Guarantees:
1. **No orphaned dependencies** — Disabling any flag doesn't break other modules
2. **No startup errors** — Any combination of flags starts cleanly
3. **Graceful degradation** — Each module falls back to v1 behavior when its flag is off
4. **Clean shutdown** — Even with all flags on, SIGTERM/SIGINT cleanly stops everything

---

## License Tiers

| Feature | Starter | Pro | Enterprise |
|---------|:-------:|:---:|:----------:|
| Widget Chat | ✅ | ✅ | ✅ |
| RAG / Knowledge Base | ✅ | ✅ | ✅ |
| MCP Hub / Tools | ✅ | ✅ | ✅ |
| Multimodal | ✅ | ✅ | ✅ |
| Multi-Agent | ❌ (1 agent) | ✅ (5 agents) | ✅ (100 agents) |
| Custom Branding | ❌ | ✅ | ✅ |
| Soul & Memory | ❌ | ✅ | ✅ |
| Deep Tools | ❌ | ✅ | ✅ |
| Multi-Channel | ❌ | ✅ | ✅ |
| GitLab KB Sync | ❌ | ✅ | ✅ |
| Proactive Engine | ❌ | ❌ | ✅ |
| Background Agents | ❌ | ❌ | ✅ |

---

## How to Test

```bash
# 1. Set all flags to false in .env:
FEATURE_SOUL_MEMORY=false
FEATURE_DEEP_TOOLS=false
FEATURE_PROACTIVE=false
FEATURE_BACKGROUND_AGENTS=false
FEATURE_MULTI_CHANNEL=false

# 2. Start server — verify clean startup, no errors
npm run dev

# 3. Test widget chat — should work (v1 behavior)
# 4. Hit memory endpoint — should get 403
curl http://localhost:4000/api/agents/default-agent/documents
# Expected: {"error":"Soul & Memory feature not enabled","code":"SOUL_MEMORY_NOT_LICENSED",...}

# 5. Enable flags one at a time and verify each module activates
FEATURE_SOUL_MEMORY=true  # → memory endpoints work, soul.md injected
FEATURE_DEEP_TOOLS=true   # → web__search and web__fetch appear in tool list
FEATURE_PROACTIVE=true    # → proactive engine starts, cron/heartbeat routes work
FEATURE_MULTI_CHANNEL=true # → channel CRUD works, webhook endpoints active

# 6. Generate a tier license:
LICENSE_SECRET=test-secret npx ts-node scripts/generate-license.ts --org "Test" --tier pro
# Set the output as AGENTICLEDGER_LICENSE_KEY and verify features match tier
```
