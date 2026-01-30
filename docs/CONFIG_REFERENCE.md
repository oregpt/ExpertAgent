# Agent-in-a-Box Configuration Reference

This document summarizes the key configuration knobs for deploying Agent-in-a-Box.

## 1. Environment Variables (Server)

### Core
- `PORT`
  - HTTP port for the Agent-in-a-Box server.
  - Default: `4000`.

- `DATABASE_URL`
  - Postgres connection string.
  - Example: `postgres://user:password@host:5432/agentinabox`.

### LLM Providers
- `LLM_PROVIDER`
  - Which provider implementation to use.
  - Values: `claude` (default). (Framework can be extended to support others.)

- `ANTHROPIC_API_KEY`
  - API key for Anthropic Claude (chat + streaming).

- `CLAUDE_DEFAULT_MODEL`
  - Default Claude model ID.
  - Default: `claude-3-5-sonnet-latest`.

### Embeddings
- `OPENAI_API_KEY`
  - API key for OpenAI embeddings.
  - Model used (v1): `text-embedding-3-small` (configured in code, can be made configurable later).

## 2. Capabilities (AnyAPI)

The AnyAPI capability uses environment variables for API keys to keep secrets out of code and config files.

### CoinGecko (no auth)
- No API key required for the basic endpoints currently included.

### OpenWeatherMap
- `OPENWEATHER_API_KEY`
  - API key for OpenWeatherMap.
  - Used as the `appid` query parameter.

### GitHub (public)
- No API key required for the read-only endpoints currently included. If you later add authenticated endpoints, you can extend AnyAPI definitions to use a bearer token.

> Pattern: For an API with id `X`, AnyAPI expects an environment variable `X.toUpperCase() + '_API_KEY'` when `authType: 'apikey'` is set in definitions.

## 3. Agent & App Config (appConfig.ts)

Additional logical configuration is currently defined in `server/src/config/appConfig.ts`.

Key fields in `AppConfig`:

- `port: number`
  - Mirrors `PORT`.

- `databaseUrl: string`
  - Mirrors `DATABASE_URL`.

- `agents: AgentDefinition[]`
  - List of logical agents. In v1 we seed a single default agent in code, but you can later load this from JSON.
  - `AgentDefinition` fields:
    - `id: string`
    - `slug: string`
    - `name: string`
    - `description?: string`
    - `instructions?: string`
    - `defaultModel: string`

- `defaultAgentId: string`
  - Which agent is used by default when no explicit agentId is provided.

- `llmProvider: 'claude' | 'openai' | ...`
  - Current supported value: `claude`.

- `capabilities: CapabilityConfig[]`
  - Which capabilities are enabled.
  - v1: `[{ id: 'anyapi', type: 'anyapi', enabled: true }]`.

## 4. Database Schema Overview

Defined in `server/src/db/schema.ts` (minimal, independent of AgenticLedger):

- `ai_agents`
  - Columns: `id`, `slug`, `name`, `description`, `instructions`, `default_model`, `created_at`, `updated_at`.

- `ai_documents`
  - Per-agent documents: `id`, `agent_id`, `title`, `source_type`, `mime_type`, `size`, `storage_path`, `metadata`, `created_at`.

- `ai_document_chunks`
  - Chunks + embeddings: `id`, `document_id`, `agent_id`, `chunk_index`, `content`, `embedding`, `token_count`, `created_at`.

- `ai_conversations`
  - Conversations: `id`, `agent_id`, `external_user_id`, `title`, `created_at`, `updated_at`.

- `ai_messages`
  - Chat messages: `id`, `conversation_id`, `role`, `content`, `metadata`, `created_at`.

- `ai_capabilities`
  - Capability registry: `id`, `name`, `description`, `type`, `config`, `enabled`, `created_at`.

- `ai_capability_secrets`
  - Capability secrets: `id`, `capability_id`, `name`, `encrypted_value`, `created_at` (encryption to be layered in later).

## 5. HTTP API Summary

### Chat
- `POST /api/chat/start`
  - Body: `{ agentId?: string, externalUserId?: string, title?: string }`.
  - Response: `{ conversationId: number }`.

- `GET /api/chat/:conversationId`
  - Response: `{ conversation, messages }`.

- `POST /api/chat/:conversationId/message`
  - Body: `{ message: string }`.
  - Response: `{ conversationId, reply, sources }`.

- `POST /api/chat/:conversationId/stream`
  - Body: `{ message: string }`.
  - Response: SSE stream with events:
    - `{"event":"start"}`
    - `{"event":"delta","delta":"..."}` (multiple)
    - `{"event":"end","full":"...","sources":[...]}`

### Knowledge Base
- `POST /api/kb/text`
  - Body: `{ agentId?: string, title?: string, text: string, metadata?: object }`.
  - Response: `{ document }`.

- `GET /api/kb?agentId=...`
  - Response: `{ documents }`.

- `DELETE /api/kb/:documentId`
  - Response: `{ success: true }`.

### RAG
- `GET /api/rag/search?agentId=...&q=...&limit=...&maxTokens=...`
  - Response: `{ results: [{ content, documentId, sourceTitle, similarity }] }`.

### Capabilities (AnyAPI)
- `GET /api/capabilities`
  - Response: `{ capabilities: [{ id, name, description }] }`.

- `POST /api/capabilities/anyapi/execute`
  - Body: `{ action: string, params?: object, agentId?: string, conversationId?: number, externalUserId?: string }`.
  - `action` pattern: `"apiId.endpointName"`, e.g. `"coingecko.simple_price"`.
  - Response: `{ success: boolean, data?: any, summary?: string, error?: string }`.

## 6. Frontend Widget Config

`AgentChatWidget` props (from `web/src/AgentChatWidget.tsx`):

- `apiBaseUrl: string`
  - Base URL where the server is reachable, e.g. `https://agent.example.com`.

- `agentId?: string`
  - Optional explicit agent ID; if omitted, server uses `defaultAgentId`.

- `externalUserId?: string`
  - Optional host-provided user identifier to correlate conversations.

- `theme?: Partial<AgentTheme>`
  - Override default theme.
  - `AgentTheme` fields:
    - `primaryColor`, `secondaryColor`, `backgroundColor`, `textColor`, `borderRadius`, `fontFamily`, `logoUrl?`.

## 7. Recommended Defaults

- Use `LLM_PROVIDER=claude` with `CLAUDE_DEFAULT_MODEL=claude-3-5-sonnet-latest`.
- Set `OPENAI_API_KEY` for embeddings.
- For AnyAPI:
  - Set `OPENWEATHER_API_KEY` if using OpenWeatherMap.
- Start with conservative KB and RAG limits, then tune based on usage.

This configuration surface is intentionally small to make per-client deployments repeatable while leaving room to extend capabilities and theming over time.
