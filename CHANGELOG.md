# Agent-in-a-Box v2 Changelog

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
