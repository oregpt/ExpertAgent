# Agent-in-a-Box v2 — Test Plan

## Prerequisites

- **Backend:** `cd server && npx ts-node --transpile-only src/index.ts` (port 4501)
- **Frontend:** `cd web && npx vite --host` (port 5173)
- **Database:** PostgreSQL on localhost:5432, db `agentinabox_v2_test`
- **Heartbeats disabled:** `UPDATE ai_agent_heartbeat_config SET enabled = false;` (prevent Claude calls during startup)

---

## Phase 1: UI Smoke Tests (No API Keys Needed)

These verify the admin console renders, saves, and loads data correctly.

### T1.1 — Create New Agent
1. Navigate to `/config`
2. Click "+ New Agent"
3. Type name: `Test Finance Bot`
4. Click "Create Agent"
- **Expected:** Agent appears in dropdown, auto-selected, default fields populated

### T1.2 — Edit Agent Configuration
1. Select agent from T1.1
2. Set description: `AI finance assistant for testing`
3. Change model to `Claude Opus 4`
4. Change system prompt to a custom prompt
5. Click "Save Configuration"
6. Switch to another agent and back
- **Expected:** All fields persist after switch

### T1.3 — Agent Capabilities Toggle
1. Select agent from T1.1
2. Expand "Capabilities" accordion
3. Enable: Soul & Memory, Deep Tools, Proactive Engine
4. Click "Save Capabilities"
5. Verify via API: `GET /api/admin/agents/<id>` → features should show `true`
- **⚠️ KNOWN BUG:** Toggle state inversion on new agents — see Bug #1

### T1.4 — Delete Agent
1. Select agent from T1.1
2. Click "Delete"
3. Confirm deletion
- **Expected:** Agent removed from dropdown, another agent selected

### T2.1 — Save soul.md
1. Navigate to `/soul`
2. Select agent with Soul & Memory enabled
3. Click "soul.md" tab
4. Type content (markdown with headers, bullets)
5. Click "Save"
- **Expected:** No "unsaved" indicator, content persists on page reload

### T2.2 — Save memory.md
1. Click "memory.md" tab
2. Type structured memory content
3. Click "Save"
- **Expected:** Saved, reloads on tab switch

### T2.3 — Save context.md
1. Click "context.md" tab
2. Type organization context
3. Click "Save"
- **Expected:** Saved, reloads on tab switch

### T2.4 — Tab Switch Persistence
1. Switch between soul → memory → context → soul
- **Expected:** Each tab loads the previously saved content from DB

### T2.5 — Agent Switch Loads Different Docs
1. Save soul.md for Agent A with content "AAA"
2. Switch to Agent B, verify soul.md is different (or empty)
3. Switch back to Agent A, verify "AAA" is there
- **Expected:** Documents are per-agent isolated

### T3.1 — Configure Heartbeat
1. Navigate to `/heartbeat`
2. Select agent
3. Toggle heartbeat ON
4. Set interval: 15 minutes
5. Set quiet hours: 23:00 → 07:00
6. Set timezone: America/New_York
7. Type checklist items
8. Click "Save Configuration"
9. Verify via API: `GET /api/agents/<id>/heartbeat`
- **Expected:** All fields match what was entered

### T4.1 — Create Cron Job
1. Navigate to `/cron`
2. Select agent
3. Click "+ Add Job"
4. Schedule: `0 9 * * 1-5`
5. Task: `Run daily finance check`
6. Click "Create Job"
- **Expected:** Job appears in list with schedule, next run, toggle, run/delete buttons

### T4.2 — Create Second Cron Job
1. Click "+ Add Job" again
2. Schedule: `0 17 * * 5`
3. Task: `Generate weekly summary`
4. Click "Create Job"
- **Expected:** Two jobs listed, count shows "(2)"

### T4.3 — Delete Cron Job
1. Click "✕ Delete" on one job
2. Confirm
- **Expected:** Job removed, count decrements

### T5.1 — Capabilities Page Loads
1. Navigate to `/capabilities`
2. Select agent
- **Expected:** MCP Hub Status header, list of capabilities with toggles and API key fields

### T6.1 — Chat Widget Renders
1. Navigate to `/chat`
2. Select agent
- **Expected:** Chat widget with welcome message, input field, send button

### T7.1 — Knowledge Base Renders
1. Navigate to `/knowledge`
- **Expected:** Upload button, folder tree, category tabs, empty state message

### T8.1 — Tools Page Renders
1. Navigate to `/tools`
- **Expected:** Embed code snippet, API endpoints section

---

## Phase 2: Functional Tests (Requires API Keys)

These test actual agent behavior — does the soul affect responses, does memory persist, do MCP tools work.

### Prerequisites
- At least one agent with `ANTHROPIC_API_KEY` configured in Agent API Keys
- Agent has Soul & Memory, Deep Tools, and Proactive Engine enabled

### F1 — Soul Influences Response (System Prompt Injection)
1. Set soul.md to: `You must end every response with "— Signed, Finance Bot"`
2. Send chat message: `What is 2 + 2?`
- **Expected:** Response includes `— Signed, Finance Bot` at the end
- **Verifies:** soul.md content is injected into system prompt via contextBuilder

### F2 — Context Influences Response
1. Set context.md to: `The company name is TestCorp. The fiscal year ends June 30.`
2. Send chat message: `When does our fiscal year end?`
- **Expected:** Response mentions `June 30` and/or `TestCorp`
- **Verifies:** context.md is injected into system prompt

### F3 — Memory Read (Agent Knows Its Memory)
1. Set memory.md to: `## Key Facts\n- The CEO's name is Alice Johnson\n- We use NetSuite for ERP`
2. Send chat message: `Who is our CEO?`
- **Expected:** Response mentions `Alice Johnson`
- **Verifies:** memory.md is included in context or searchable

### F4 — Memory Write (Agent Updates Memory)
1. Send chat message: `Remember that our new CFO is Bob Smith, starting March 2026`
2. Check memory tools were called (server logs should show `memory__write` or `memory__append`)
3. Verify via API: `GET /api/agents/<id>/documents/memory.md`
- **Expected:** memory.md now includes Bob Smith reference
- **Verifies:** Agent can write to its own memory via tools

### F5 — Memory Search (Semantic Recall)
1. Upload several knowledge docs or write detailed memory content
2. Use the Memory Search box on `/soul` page: type `CFO`
- **Expected:** Returns relevant chunks mentioning Bob Smith / finance leadership
- **Verifies:** pgvector embedding + semantic search works

### F6 — Deep Tools: Web Search
1. Enable Deep Tools for agent
2. Send chat message: `Search the web for the current Bitcoin price`
- **Expected:** Agent uses `web__search` tool, returns recent price
- **Verifies:** web_search tool is available and functional

### F7 — Deep Tools: Web Fetch
1. Send chat message: `Fetch the contents of https://example.com and summarize it`
- **Expected:** Agent uses `web__fetch` tool, returns summary
- **Verifies:** web_fetch tool works

### F8 — Heartbeat Fires
1. Enable heartbeat for agent (interval: 1 minute for testing)
2. Write checklist: `Reply with "Heartbeat OK - [current time]"`
3. Wait 60-90 seconds
4. Check server logs for `[heartbeat] Executing heartbeat for agent <id>`
- **Expected:** Heartbeat fires, Claude responds, log shows execution
- **Verifies:** Proactive engine polling + heartbeat service

### F9 — Cron Job Executes
1. Create cron job: schedule `*/1 * * * *` (every minute), task: `Say hello with the current time`
2. Wait 60-90 seconds
3. Check server logs for cron execution
- **Expected:** Job fires on schedule, Claude responds
- **Verifies:** Cron scheduler + proactive engine

### F10 — Session Continuity
1. Send message: `My name is TestUser`
2. Agent responds acknowledging name
3. Send follow-up: `What's my name?`
- **Expected:** Agent recalls `TestUser` from same session
- **Verifies:** Session/conversation history maintained

### F11 — Background Agent (Sub-task Spawn)
1. Enable Background Agents feature
2. Send message: `Spawn a background task to research the top 3 DeFi protocols by TVL`
- **Expected:** Agent uses `agent__spawn_task` tool, spawns sub-agent
- **Verifies:** agent__spawn_task tool wired and functional

---

## Phase 3: MCP Integration Tests (Requires Specific API Keys)

Each test verifies an MCP server is properly wired, executes, and returns results.

### M1 — QuickBooks Online
**Keys needed:** `qbo_client_id`, `qbo_client_secret`, `qbo_refresh_token`, `qbo_realm_id`, `qbo_redirect_uri`
1. Enable `quickbooks` capability for agent
2. Configure OAuth tokens in Agent API Keys or Capabilities page
3. Send: `List the top 5 accounts in QuickBooks`
- **Expected:** Agent uses `mcp__quickbooks` tool with action `query`, returns account data

### M2 — Google Calendar
**Keys needed:** `google_client_id`, `google_client_secret`, `google_refresh_token`, `google_redirect_uri`
1. Enable `calendar` capability
2. Configure tokens
3. Send: `What's on my calendar today?`
- **Expected:** Agent uses `mcp__google-calendar` tool, returns events

### M3 — Slack
**Keys needed:** `slack_bot_token`
1. Enable `slack` capability
2. Configure bot token
3. Send: `List my Slack channels`
- **Expected:** Agent uses `mcp__slack` tool with action `list_channels`

### M4 — Notion
**Keys needed:** `notion_api_key`
1. Enable `notion` capability
2. Configure API key
3. Send: `Search my Notion for "meeting notes"`
- **Expected:** Agent uses `mcp__notion` tool with action `search`

### M5 — Google Sheets
**Keys needed:** `google_client_id`, `google_client_secret`, `google_refresh_token`, `google_redirect_uri`
1. Enable `sheets` capability
2. Configure tokens
3. Send: `Read the first 10 rows of spreadsheet <ID>`
- **Expected:** Agent uses `mcp__google-sheets` tool

### M6 — Gmail
**Keys needed:** `google_client_id`, `google_client_secret`, `google_refresh_token`, `google_redirect_uri`
1. Enable `email` capability
2. Configure tokens
3. Send: `Search my inbox for emails from last week`
- **Expected:** Agent uses `mcp__gmail` tool with action `search_emails`

### M7 — AnyAPI (CoinGecko - No Auth)
**Keys needed:** None (public API)
1. AnyAPI should be auto-available (no auth needed for CoinGecko)
2. Send: `What is the current price of Bitcoin?`
- **Expected:** Agent uses `mcp__anyapi` with CoinGecko endpoint

### M8 — Lighthouse (CantonLoop - No Auth)
**Keys needed:** None (public API)
1. Enable `mcp-lighthouse` capability
2. Send: `Show me the latest Canton network statistics`
- **Expected:** Agent uses `mcp__lighthouse` tool

---

## Known Bugs

### Bug #1 — Capabilities Toggle Inversion (Config Page) — FIXED
**Severity:** Medium
**Steps to reproduce:**
1. Create a new agent
2. Expand Capabilities accordion
3. Click Soul & Memory toggle (appears OFF)
4. Click "Save Capabilities"
5. Check API: `GET /api/admin/agents/<id>` → `features.soulMemory` is `false`
**Expected:** Should be `true` after toggling ON
**Root cause:** Toggle component initial state doesn't match API response for agents with empty `features` object. When `features.soulMemory` is `undefined`, the toggle renders as OFF but its internal state is `true` (default), so clicking it flips to `false`.
**Fix:** Initialize toggle state from `agent.features[key] === true` (strict), not truthy fallback.

---

## API Verification Endpoints

Quick curl/node commands to verify state without the UI:

```bash
# List all agents
node -e "require('http').get('http://127.0.0.1:4501/api/admin/agents',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"

# Get agent features
node -e "require('http').get('http://127.0.0.1:4501/api/admin/agents/AGENT_ID',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"

# Get heartbeat config
node -e "require('http').get('http://127.0.0.1:4501/api/agents/AGENT_ID/heartbeat',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"

# Get cron jobs
node -e "require('http').get('http://127.0.0.1:4501/api/agents/AGENT_ID/cron-jobs',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"

# Get soul document
node -e "require('http').get('http://127.0.0.1:4501/api/agents/AGENT_ID/documents/soul.md',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"

# Get capabilities
node -e "require('http').get('http://127.0.0.1:4501/api/admin/capabilities',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"
```

---

## Phase 5: New MCP Server Tests (Feb 4 Build)

### Servers Added (24 total bundled servers)

#### No Auth Required (Test Immediately)
| Test ID | Server | Test Query | Expected |
|---------|--------|------------|----------|
| M-SEC1 | SEC EDGAR | `Show me Tesla's recent 10-K filings` | Returns TSLA filings with dates |
| M-SEC2 | SEC EDGAR | `Get Apple's revenue concept data` | Returns XBRL data for AAPL |
| M-BW1 | Bitwave Price | `What's BTC price from Bitwave?` | Returns Bitcoin price |
| M-WAL1 | Wallet Balance | `List supported chains` | Returns ~14 chains |

#### Exchange MCPs (Require API Keys)
| Test ID | Server | Auth | Test |
|---------|--------|------|------|
| M-BIN1 | BinanceUS | key+secret | Get account balances |
| M-KRK1 | Kraken | key+secret | Get account balance |
| M-CB1 | Coinbase | keyName+privKey | List accounts |

#### Productivity MCPs
| Test ID | Server | Auth | Test |
|---------|--------|------|------|
| M-DOC1 | Google Docs | OAuth2 | List recent documents |
| M-GAM1 | Gamma | API key | Get available themes |

#### Finance MCPs
| Test ID | Server | Auth | Test |
|---------|--------|------|------|
| M-PLD1 | Plaid | clientId+secret+accessToken | Get linked accounts |
| M-KAI1 | Kaiko | API key | Get BTC/USD direct price |

#### Canton/Blockchain
| Test ID | Server | Auth | Test |
|---------|--------|------|------|
| M-TIE1 | TheTie Canton | optional key | Get cumulative metrics |
| M-FAM1 | FAAM Tracker | optional key | Get stats |

#### Other
| Test ID | Server | Auth | Test |
|---------|--------|------|------|
| M-CHAT1 | ChatScraper | tokens | List Telegram channels |
| M-TRD1 | Trader | API key | Get trading strategies |

### Quick Validation After Server Restart

```bash
# Test SEC EDGAR (no auth):
curl -X POST http://localhost:4501/api/chat/start -H "Content-Type: application/json" -d '{"agentId":"default-agent"}' 
# Then send: "Get Tesla's company facts from SEC EDGAR"

# Test Bitwave (no auth):
# Send: "Use Bitwave to get ETH price"

# Test Wallet Balance (no auth):
# Send: "List supported blockchains for wallet balance"
```
