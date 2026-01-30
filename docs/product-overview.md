# Product Overview - Agent-in-a-Box (Engineer/AI-Agent Focus)

## 1. Purpose and Positioning

Agent-in-a-Box is a **reusable, multi-agent AI platform** extracted from the AgenticLedger ecosystem.

It is designed so that **you, as an AI agent with tool access**, can:

- Stand up fully functional **AI assistants** (chat + RAG + tools) for a new client or project.
- Reuse the same foundation each time (same schema, same HTTP surface, same widget), and then:
  - Create multiple **agents** with different personalities and capabilities.
  - Plug in new **knowledge** (documents) per agent.
  - Plug in new **capabilities** ("tools") with secure credential storage.
  - Adjust each **agent's behavior** via system prompt + LLM model.
  - Configure **single or multi-model** selection per agent.

Primary audience:

- **Backend/frontend engineers** and **infra agents** who will deploy, extend, and operate the system.
- Higher-level product owners are secondary; this doc assumes you understand HTTP, Postgres, and TypeScript.

---

## 2. Core Product Surfaces

### 2.1 End-User Chat Widget

A React component `AgentChatWidget` (packaged as a library) that renders a **polished, Intercom-style assistant**:

- **Modes**
  - `mode="launcher"`: Floating button at bottom-right, opens a chat panel.
  - `mode="inline"`: Chat panel directly rendered in a layout area.
- **Behavior**
  - On mount, it calls `POST /api/chat/start` to create a conversation.
  - On user message, it streams from `POST /api/chat/:conversationId/stream`.
  - It shows a **"Working MM:SS"** indicator while streaming.
- **Model Selection** (for multi-model agents)
  - When an agent is configured in `multi` model mode, users see a model dropdown.
  - Changing models starts a fresh conversation.
- **Branding & Theming**
  - Uses `AgentTheme` and `applyTheme` to set:
    - Primary/secondary colors
    - Background, text color
    - Border radius
    - Font family
  - Includes a **"Powered by AgenticLedger"** footer (white-labeling can be added later).

This widget is what gets embedded into the customer's app or website. Your job as an AI engineer is to ensure:

- The widget can be **imported from the built library**.
- The embed code examples stay in sync with the actual props and theme options.
- Styling and behavior remain Intercom-quality by default.

---

### 2.2 Admin App (Operator Console)

The **AdminApp** is a React SPA that gives non-engineers control of agents:

#### Navigation

- **Chat** - Test agent conversations
- **Knowledge Base** - Manage documents
- **Capabilities** - Enable integrations
- **Configuration** - Agent settings
- **Tools** - Embed codes and API info

#### Multi-Agent Management

All pages now include an **agent selector dropdown** allowing operators to switch between agents:

- **Chat Preview**
  - Select which agent to test
  - Model selector appears for multi-model agents
  - Renders `AgentChatWidget` inline for live preview

- **Knowledge Base Management**
  - Select which agent's knowledge base to manage
  - Uploads files (PDF, DOCX, TXT, MD) via `POST /api/kb/:agentId/files`
  - Lists documents via `GET /api/kb/:agentId`
  - Deletes via `DELETE /api/kb/:agentId/:documentId`
  - Shows metadata (title, type, size, created date)

- **Agent Configuration**
  - Fetches agent config via `GET /api/admin/agents/:agentId`
  - Saves changes via `PUT /api/admin/agents/:agentId`:
    - `name` - Display name
    - `description` - Internal description
    - `instructions` - System prompt
    - `defaultModel` - LLM model ID
    - `modelMode` - `single` or `multi`
    - `allowedModels` - Array of allowed model IDs (for multi-mode)
  - **Model Mode Toggle:**
    - **Single Model:** Agent always uses one model
    - **Multi-Model:** Admin selects allowed models, users can choose in chat
  - Changes are persisted to Postgres (`ai_agents`) and used immediately

- **Capabilities Management**
  - View all available capabilities
  - Enable/disable per agent
  - Configure API credentials securely
  - Categories: Finance, Communication, Data, etc.

- **Embed Code Panel**
  - Shows example code to embed the widget in a third-party app
  - Includes `apiBaseUrl`, `agentId`, `mode`, and theme options

Future operator views:

- **Conversation Logs & Analytics:** Inspect conversations, tool calls, latency, and usage.

---

### 2.3 Backend Capabilities (Tools)

The backend exposes a **capabilities framework** with two types:

#### MCP (Model Context Protocol) Servers

- External tool servers following the MCP specification
- Managed via MCP Hub orchestrator
- Hot-reload capability connections

#### AnyAPI (JSON-Configurable APIs)

- Describes external API calls as **capabilities**:
  - Example capability IDs:
    - `coingecko.simple_price`
    - `openweather.current_weather`
    - `github.search_repositories`
- Each capability definition includes:
  - Parameter schema (e.g., `symbol`, `vs_currency`)
  - HTTP method, URL template, and optional headers
- Execution:
  - An HTTP call to `/api/capabilities/anyapi/execute` triggers the capability
  - The service calls the upstream API and returns both data and a human-readable summary

#### Secure Credential Storage

- Per-agent token storage with AES-256-GCM encryption
- Supports up to 5 tokens per capability (for complex OAuth flows)
- Token fields: `token1` (primary), `token2` (secondary/refresh), `token3-5` (additional)
- Expiration support for OAuth tokens

Your role as an AI engineer is to:

- Treat AnyAPI and other capabilities as **tool endpoints** you can call programmatically.
- Add new capabilities for each client by extending the capability definitions and wiring their secrets.

---

### 2.4 Knowledge Base & RAG

The Knowledge Base is the **primary grounding mechanism**:

- Operators upload files (PDF, DOCX, TXT, MD) per agent
- The backend:
  - Extracts text
  - Splits into chunks
  - Generates embeddings using OpenAI (text-embedding-3-small, 1536 dimensions)
  - Stores them in Postgres with **pgvector** for similarity search

During chat:

- The chat service calls RAG:
  - `getRelevantContext(agentId, conversation)` runs a vector similarity search
  - Returns a `Context:` string plus metadata for sources
- The LLM's system prompt includes:
  - Agent instructions from DB
  - A `Context:` section with top-N chunks

As an AI agent, you can rely on this to **inject domain knowledge** into responses without hard-coding any customer-specific content.

---

### 2.5 Multi-Agent Architecture

The platform supports **multiple independent agents** within a single deployment:

#### Agent Properties

| Property | Description |
|----------|-------------|
| `id` | Unique identifier (auto-generated) |
| `slug` | URL-friendly identifier |
| `name` | Display name |
| `description` | Internal description |
| `instructions` | System prompt |
| `defaultModel` | Default LLM model |
| `modelMode` | `single` or `multi` |
| `allowedModels` | Array of allowed models (when multi) |

#### Use Cases

- **Customer Support Agent:** Friendly tone, references FAQs
- **Technical Docs Assistant:** Precise language, references API docs
- **Internal Knowledge Agent:** Access to internal company documents
- **Sales Assistant:** Product-focused, lead generation

Each agent maintains:
- Its own knowledge base
- Its own conversation history
- Its own capability enablements
- Its own model configuration

---

### 2.6 Deployment Targets & Integration Surface

- **Backend**
  - Node.js service (Express + Drizzle)
  - Requires Postgres with **pgvector extension**
  - Requires secrets for Anthropic and OpenAI
  - Docker support with `Dockerfile` and `docker-compose.yml`

- **Frontend**
  - Admin SPA served by Vite (or any static host)
  - Widget bundled as a library (UMD/ESM)

From an AI engineer's perspective:

- Your primary "external integration surface" is:
  - The **HTTP API** under `/api/*`
  - The **React component** interface for the widget and AdminApp
- Everything else is implementation detail you can reason about but don't expose directly to clients.

---

## 3. API Quick Reference

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/agents` | List all agents |
| POST | `/api/admin/agents` | Create new agent |
| GET | `/api/admin/agents/:agentId` | Get agent config |
| PUT | `/api/admin/agents/:agentId` | Update agent |
| DELETE | `/api/admin/agents/:agentId` | Delete agent |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/start` | Start new conversation |
| POST | `/api/chat/:conversationId/stream` | Stream chat response (SSE) |
| GET | `/api/chat/:conversationId/messages` | Get conversation history |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/kb/:agentId` | List documents |
| POST | `/api/kb/:agentId/files` | Upload files |
| DELETE | `/api/kb/:agentId/:documentId` | Delete document |

### Capabilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/capabilities` | List capabilities |
| POST | `/api/admin/capabilities/:capabilityId/toggle` | Enable/disable |
| POST | `/api/admin/capabilities/:capabilityId/tokens` | Set credentials |
| DELETE | `/api/admin/capabilities/:capabilityId/tokens` | Remove credentials |

### Models

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/models` | List available LLM models |

---

## 4. Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `ai_agents` | Agent configurations |
| `ai_documents` | Uploaded document metadata |
| `ai_document_chunks` | Document chunks with pgvector embeddings |
| `ai_conversations` | Chat conversations |
| `ai_messages` | Individual messages |
| `ai_capabilities` | Capability registry |
| `ai_agent_capabilities` | Per-agent capability enablement |
| `ai_capability_tokens` | Encrypted credentials |

### pgvector Requirements

The system requires the pgvector extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Embeddings are stored as `vector(1536)` (OpenAI text-embedding-3-small dimension).

---

## 5. Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| Framework | Express |
| ORM | Drizzle |
| Database | PostgreSQL + pgvector |
| Frontend | React + Vite |
| LLM | Anthropic Claude (primary), OpenAI (embeddings) |
| Styling | CSS-in-JS (inline styles) |

---

## 6. Getting Started

1. **Prerequisites:**
   - Node.js 18+
   - PostgreSQL with pgvector extension
   - Anthropic API key
   - OpenAI API key (for embeddings)

2. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and database URL
   ```

3. **Database Initialization:**
   - Tables are auto-created on first server start
   - pgvector extension must be enabled manually or by superuser

4. **Start Development:**
   ```bash
   # Server
   cd server && npm install && npm run dev

   # Frontend
   cd web && npm install && npm run dev
   ```

5. **Access Admin Console:**
   - Open `http://localhost:5173` (or configured port)
   - Create/configure agents
   - Upload knowledge documents
   - Test chat responses
