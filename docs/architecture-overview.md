# Architecture Overview – Agent‑in‑a‑Box (Engineer/AI‑Agent Focus)

This document treats you explicitly as an **AI engineer tasked with reading, modifying, and calling this system**.

---

## 1. Project Structure

Top level layout:

- `server/`
  - Node + TypeScript backend (Express + Drizzle + Postgres).
- `web/`
  - React + Vite frontend.
  - Both an Admin SPA and a bundled `AgentChatWidget` library.
- `docs/`
  - Product and architecture docs (including this file) plus any additional configuration references.

You, as an AI, should treat `server/` and `web/` as two services in a single product.

---

## 2. Backend Architecture

### 2.1 Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **HTTP server:** Express
- **ORM:** Drizzle
- **DB:** Postgres
- **LLM provider abstraction:**
  - Initial implementation: Anthropic Claude via `@anthropic-ai/sdk`.
- **Embeddings:**
  - OpenAI `text-embedding-3-small` via `OPENAI_API_KEY`.

Environment configuration:

- `DATABASE_URL` – Postgres connection string.
- `ANTHROPIC_API_KEY` – for chat completion/streaming.
- `OPENAI_API_KEY` – for embeddings.
- Optional keys for capabilities (`OPENWEATHER_API_KEY`, etc.).

---

### 2.2 HTTP Surfaces (APIs)

All HTTP definitions live under `server/src/http`.

#### 2.2.1 Health

- `GET /health` – simple liveness probe.

#### 2.2.2 Chat

- `POST /api/chat/start`
  - Request: `{ agentId?, externalUserId? }`
  - Response: `{ conversationId }`.
  - Side effect: creates an `ai_conversations` row, ensures default agent exists.
- `POST /api/chat/:conversationId/stream`
  - Request: `{ message: string }`
  - Response: **streamed** SSE‑style `data:` lines with JSON payloads:
    - `{ event: 'delta', delta: '...partial text...' }`
    - `{ event: 'end', full: '...final text...' }`

Additional non‑streaming endpoints may exist (`POST /api/chat/:conversationId`), but the primary surface for the widget is the streaming endpoint.

#### 2.2.3 Knowledge Base

- `POST /api/kb/text`
  - Request: `{ agentId?, title?, text, metadata? }`
  - Stores a text document and indexes it into RAG.
- `POST /api/kb/files`
  - Request: `multipart/form-data` with:
    - `file`
    - optional `title`
    - optional `agentId`
    - optional `metadata`
  - Extracts text, stores document, and indexes into RAG.
- `GET /api/kb?agentId=...`
  - Lists documents for an agent.
- `DELETE /api/kb/:documentId`
  - Deletes a document and its chunks.

#### 2.2.4 RAG Search

- `GET /api/rag/search?query=...&agentId=...`
  - Runs a semantic search over `ai_document_chunks`.
  - Intended as a diagnostic surface (Admin/testing), not necessarily exposed to end users.

#### 2.2.5 Capabilities / AnyAPI

- `GET /api/capabilities`
  - Returns capability metadata (IDs, names).
- `POST /api/capabilities/anyapi/execute`
  - Request: `{ capabilityId, params }`
  - Executes a configured AnyAPI capability and returns:
    - `data`: raw upstream response.
    - `summary`: human‑readable summary.

#### 2.2.6 Admin

- `GET /api/admin/agent`
  - Returns current agent config for the default agent.
- `POST /api/admin/agent`
  - Request: `{ name, description, instructions, defaultModel }`
  - Persists to `ai_agents`.

---

### 2.3 Data Model Overview

Most tables are defined in `server/src/db/schema.ts`. Key entities:

1. **Agents**
   - Table: `ai_agents`
   - Important fields:
     - `slug` – unique identifier (`default-agent`).
     - `name`, `description`.
     - `instructions` – system prompt text.
     - `default_model` – LLM model identifier.
   - Note: `ensureDefaultAgent()` inserts a sensible default if none exists.

2. **Conversations & Messages**
   - `ai_conversations`
     - `agent_id` – which agent handled this conversation.
     - `external_user_id` – optional mapping to upstream apps user IDs.
   - `ai_messages`
     - `conversation_id`, `role` (`user` or `assistant`), `content`.
     - `metadata` – JSON, used for storing RAG sources, tool calls, etc.

3. **Knowledge Base & RAG**
   - `ai_documents`
     - `agent_id`, `title`, `source_type` (`text`, `file`), `mime_type`, `size`, `metadata`.
   - `ai_document_chunks`
     - `document_id`, `chunk_index`, `content`, `embedding` (vector).

4. **Capabilities**
   - `ai_capabilities`, `ai_capability_secrets`
   - Store definitions (IDs, configuration) and associated secrets per agent or per capability.

As an AI agent, you do not directly modify the DB; you operate through HTTP or code changes. But understanding these tables lets you reason about state and invariants.

---

### 2.4 Core Backend Services and Flows

#### 2.4.1 Chat Service

The chat service:

- Ensures a `default-agent` exists.
- Creates and fetches conversations.
- Calls RAG for additional context.
- Calls the configured LLM provider for responses.

High‑level flow for `POST /api/chat/:conversationId/stream`:

1. Validate conversation exists.
2. Fetch associated agent config (`ai_agents`).
3. Use `getRelevantContext` to fetch top chunks from RAG.
4. Build messages:
   - System: `agent.instructions` + appended `Context:` block.
   - User: latest user message.
5. Invoke LLM provider `.stream(model, messages)`.
6. As tokens arrive from the provider:
   - Emit SSE `data:` events back to the client.
   - Aggregate into a final string for `event: 'end'`.
7. Persist assistant message to `ai_messages` with metadata (e.g., RAG sources).

**Extension Point for You (AI engineer):**

- Add support for alternate providers (e.g., OpenAI) by:
  - Implementing a new `LLMProvider`.
  - Extending the switch logic in `getDefaultLLMProvider`.
  - Wiring provider selection to `ai_agents` config (model string or provider field).

---

#### 2.4.2 RAG Service

The RAG service handles document ingestion and retrieval:

- Ingestion:
  - Chunking algorithm.
  - Embedding via OpenAI.
  - Storage in `ai_document_chunks`.
- Query:
  - Vector similarity search.
  - Formatting of `Context:` string with sources.

**Extension Points:**

- Adjust chunking strategy (size, overlap) to better match target domains.
- Swap embedding provider or model if needed.

---

#### 2.4.3 File Ingestion

File ingestion path:

1. `POST /api/kb/files`.
2. `multer` writes file to disk (`server/uploads/kb/...`).
3. `fileExtractor`:
   - Detects MIME type.
   - Uses:
     - `pdfjs-dist` for PDFs.
     - `mammoth` for DOCX.
     - Fallback for text formats.
4. Ingested text is treated like any other KB text document and indexed into RAG.

You should ensure file extractor support stays synchronized with front‑end expectations (allowed file types, size limits).

---

#### 2.4.4 Capabilities / AnyAPI

For AnyAPI:

1. Capability defined in `server/src/capabilities/anyapi/definitions.ts`.
2. `POST /api/capabilities/anyapi/execute` receives:
   - `capabilityId` (e.g., `openweather.current_weather`)
   - `params` (e.g., `{ city: "San Francisco" }`)
3. The AnyAPI executor:
   - Looks up definitions.
   - Inserts params into URL/body/query.
   - Adds necessary headers (including any secrets).
   - Calls external API with `axios`.
4. Returns:
   - `data` – full upstream payload.
   - `summary` – concise textual description.

This is the main hook for tool‑calling behavior. From your perspective as an AI, its a structured way to call external HTTP resources with guardrails.

---

## 3. Frontend Architecture

### 3.1 Web Build Setup

- Vite configuration:
  - SPA mode for AdminApp (dev server / build).
  - **Library mode** build for `AgentChatWidget`:
    - ESM bundle.
    - UMD bundle with `React` and `ReactDOM` as externals.

This lets you both:

- Run `npm run dev` to open the AdminApp.
- Import `AgentChatWidget` from the built library in other React apps (or use UMD in plain scripts).

---

### 3.2 AgentChatWidget Component

`AgentChatWidget` (in `web/src/AgentChatWidget.tsx`) is the main embeddable unit:

- Props:
  - `apiBaseUrl`: URL of the backend server.
  - `agentId?`: optional, uses default agent otherwise.
  - `externalUserId?`: attach to conversations to tie back to your apps users.
  - `theme?`: partial `AgentTheme`.
  - `mode?`: `'inline' | 'launcher'`.
- Internal State:
  - `conversationId`.
  - `messages: { id, role, content }[]`.
  - Streaming flags and elapsed time.
  - `isOpen` (for launcher mode).
- Lifecycle:
  - On mount:
    - `POST /api/chat/start`.
  - On send:
    - POST streaming endpoint and update UI as chunks arrive.

All styling uses a mix of **inline styles** and **CSS variables** applied via `applyTheme`, so theming is isolated.

---

### 3.3 AdminApp Component

`AdminApp` (in `web/src/AdminApp.tsx`) composes:

- Chat Preview (`<AgentChatWidget ... />`).
- Knowledge Base Manager (`<KnowledgeBaseManager ... />`).
- Agent Config editor.
- Embed Code panel.

The SPA entry (`web/src/main.tsx`) mounts `AdminApp` for local development.

From your perspective:

- To add new admin features (e.g., capabilities management, logs), add new panels to `AdminApp` and corresponding backend endpoints.

---

## 4. End‑to‑End Flows (Agent Mental Model)

### 4.1 Bringing Up a New Instance

As an AI engineer tasked with provisioning a new clients Agent‑in‑a‑Box:

1. **Backend**
   - Set `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`.
   - Run DB migrations or apply schema DDL.
   - Start server (`npm run dev` or production equivalent).
2. **Frontend**
   - Start `web` dev server for AdminApp.
   - Point AdminApps `apiBaseUrl` at the backend.
3. **Admin Initialization**
   - Open AdminApp in browser.
   - Configure Agent:
     - Name, description.
     - System prompt (instructions).
     - Default model.
   - Upload initial KB docs.
   - Verify chat widget behavior.
4. **Embed**
   - Use the Embed Code panel to integrate `AgentChatWidget` into the customers product.

---

### 4.2 Extending for a New Client

For each new client, you mostly:

- **Reuse:** same backend, same widget, same AdminApp.
- **Customize:**
  - Agent system prompt & model via Admin.
  - KB content via Admin.
  - Capabilities (AnyAPI and others) by:
    - Adding capability definitions.
    - Storing their secrets.
  - Widget theme by changing colors, branding, and potentially hiding "Powered by" via props.
