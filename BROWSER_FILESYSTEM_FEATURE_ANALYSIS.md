# Browser Control & Local File Access: Feature Analysis

**Date:** January 31, 2026  
**Project:** Agent-in-a-Box v2  
**Branches Analyzed:**  
- `main` — Web app deployed on Railway (Docker/Postgres)  
- `main_withLocalApp` — Desktop app (Electron + SQLite)

---

## Executive Summary

| Feature | `main` (Web/Railway) | `main_withLocalApp` (Desktop/Electron) |
|---------|----------------------|----------------------------------------|
| **Browser Control** | ✅ Possible with caveats | ✅ Fully feasible |
| **Local File Access** | ⚠️ Severely limited | ✅ Fully feasible |
| **Recommended Approach** | Headless browser, sandboxed KB uploads | Native Playwright + fs tools |

**Bottom Line:**  
- **Desktop app** is the natural home for these features — it already has the architecture in place.
- **Web app** can support browser automation (headless), but local file access requires a companion desktop agent or is limited to server-side sandboxed operations.

---

## Part 1: `main_withLocalApp` (Desktop / Electron)

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                │
│  - Spawns Express server as child process              │
│  - BrowserWindow loads localhost:4100                   │
│  - System tray integration                              │
└────────────────────────┬────────────────────────────────┘
                         │ spawn (node server/dist/index.js)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Express Server                        │
│  - SQLite database (better-sqlite3)                     │
│  - All MCP servers bundled                              │
│  - Browser tools (Playwright) already implemented       │
│  - Tool executor with full feature gating               │
└─────────────────────────────────────────────────────────┘
```

**Key Files:**
- `desktop/main.ts` — Electron main process
- `desktop/preload.ts` — Context bridge (minimal exposure currently)
- `server/src/tools/browserTools.ts` — **Already implemented!**
- `server/src/llm/toolExecutor.ts` — Tool execution routing

### Browser Control: ✅ ALREADY IMPLEMENTED

The desktop app **already has browser control** via Playwright in `browserTools.ts`:

| Tool | Description | Status |
|------|-------------|--------|
| `browser__navigate` | Navigate to URL | ✅ Implemented |
| `browser__click` | Click element by selector | ✅ Implemented |
| `browser__type` | Type into input field | ✅ Implemented |
| `browser__screenshot` | Capture page screenshot | ✅ Implemented |
| `browser__snapshot` | Get accessibility tree | ✅ Implemented |
| `browser__evaluate` | Execute JS in page | ✅ Implemented |
| `browser__get_text` | Extract text content | ✅ Implemented |
| `browser__wait` | Wait for element | ✅ Implemented |

**How it works:**
1. Lazy-loads Playwright when first browser tool is called
2. Maintains per-agent browser contexts (persistent cookies/sessions)
3. Uses headless Chromium by default
4. Gated by `deepTools` feature flag (per-agent)

**To enable:**
```typescript
// In agent's features config:
{
  "deepTools": true  // Enables browser tools + web search/fetch
}
```

**Improvements to Consider:**

1. **Headed mode option** — Allow user to see the browser:
   ```typescript
   browserInstance = await playwright.chromium.launch({
     headless: process.env.BROWSER_HEADLESS !== 'false',
     // ...
   });
   ```

2. **Chrome DevTools Protocol (CDP) attachment** — Let agent attach to user's existing Chrome:
   ```typescript
   // Connect to running Chrome instance
   browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
   ```

3. **User-visible browser window** — For transparency, show what the agent is doing

### Local File Access: ⚠️ NOT YET IMPLEMENTED

The desktop app does **not** currently expose filesystem tools to the agent, but the infrastructure is ready.

**Current file handling:**
- Knowledge Base uploads go to `uploads/kb/` directory
- Documents are stored and chunked for RAG
- No direct filesystem access for agents

**Recommended Implementation:**

#### Option A: Add Native File Tools (Recommended)

Create `server/src/tools/filesystemTools.ts`:

```typescript
/**
 * Filesystem Tools
 * 
 * Provides sandboxed file operations for desktop agents.
 * Files are restricted to allowed directories (configurable).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolCall } from '../llm/types';

// Allowed base directories (configurable per-agent or globally)
const ALLOWED_DIRS = [
  process.env.EXPERT_AGENT_DATA_DIR || '',
  path.join(process.env.HOME || '', 'Documents'),
  path.join(process.env.HOME || '', 'Downloads'),
];

export const FILESYSTEM_TOOLS: Tool[] = [
  {
    name: 'fs__read_file',
    description: '[filesystem] Read contents of a file. Returns text content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to read' },
        encoding: { type: 'string', description: 'Encoding (default: utf-8)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__write_file',
    description: '[filesystem] Write content to a file. Creates directories if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to write to' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'fs__list_directory',
    description: '[filesystem] List contents of a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Include subdirectories' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__file_info',
    description: '[filesystem] Get file metadata (size, modified date, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
  },
];

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return ALLOWED_DIRS.some(dir => dir && resolved.startsWith(dir));
}

export async function executeFilesystemTool(
  agentId: string,
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  const action = toolCall.name.replace('fs__', '');
  const input = toolCall.input;

  const targetPath = input.path as string;
  if (!isPathAllowed(targetPath)) {
    return {
      success: false,
      output: `Access denied: Path "${targetPath}" is outside allowed directories`,
    };
  }

  try {
    switch (action) {
      case 'read_file': {
        const content = await fs.readFile(targetPath, input.encoding || 'utf-8');
        return { success: true, output: content.slice(0, 50000) };
      }
      case 'write_file': {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, input.content as string);
        return { success: true, output: `Written ${(input.content as string).length} bytes to ${targetPath}` };
      }
      case 'list_directory': {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const listing = entries.map(e => 
          `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`
        ).join('\n');
        return { success: true, output: listing };
      }
      case 'file_info': {
        const stat = await fs.stat(targetPath);
        return {
          success: true,
          output: JSON.stringify({
            size: stat.size,
            modified: stat.mtime.toISOString(),
            created: stat.birthtime.toISOString(),
            isDirectory: stat.isDirectory(),
          }, null, 2),
        };
      }
      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { success: false, output: `Filesystem error: ${(err as Error).message}` };
  }
}

export function isFilesystemTool(toolName: string): boolean {
  return toolName.startsWith('fs__');
}
```

**Wire into toolExecutor.ts:**

```typescript
import { FILESYSTEM_TOOLS, isFilesystemTool, executeFilesystemTool } from '../tools/filesystemTools';

// In getDetailedToolsForAgent():
if (features.deepTools) {  // Or add new feature flag: filesystemAccess
  tools.push(...FILESYSTEM_TOOLS);
}

// In executeWithTools() loop:
if (isFilesystemTool(toolCall.name)) {
  const fsResult = await executeFilesystemTool(options.agentId, toolCall);
  // ... handle result
  continue;
}
```

**Security Considerations:**

1. **Path allowlisting** — Only allow access to specific directories
2. **Per-agent scoping** — Each agent gets its own sandboxed directory
3. **Size limits** — Cap file read/write sizes
4. **Audit logging** — Log all filesystem operations
5. **User confirmation** — Optional dialog for sensitive operations

#### Option B: Use MCP Filesystem Server

The project already references `@modelcontextprotocol/server-filesystem` in `mcp-server-manager.ts`. This could be enabled:

```typescript
// In mcp-server-manager.ts, add to bundled servers:
{
  id: 'mcp-filesystem',
  name: 'Filesystem',
  description: 'Secure file operations with configurable access controls.',
  npmPackage: '@modelcontextprotocol/server-filesystem',
  category: 'system',
  envVars: [],  // Path restrictions configured at runtime
}
```

**Pros:** Standard MCP protocol, easier to swap implementations  
**Cons:** Extra dependency, less control over security

### Desktop App: Recommended Design

```
┌──────────────────────────────────────────────────────────────────┐
│                         Expert Agent (Desktop)                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐ │
│  │   Browser   │   │ Filesystem  │   │     MCP Hub             │ │
│  │   Tools     │   │   Tools     │   │  (Gmail, Slack, etc.)   │ │
│  └──────┬──────┘   └──────┬──────┘   └───────────┬─────────────┘ │
│         │                 │                       │               │
│         └────────────┬────┴───────────────────────┘               │
│                      ▼                                            │
│         ┌────────────────────────────┐                            │
│         │      Tool Executor         │                            │
│         │   (Feature-gated routing)  │                            │
│         └─────────────┬──────────────┘                            │
│                       ▼                                            │
│         ┌────────────────────────────┐                            │
│         │     LLM Provider           │                            │
│         │  (Claude/GPT/Gemini/Ollama)│                            │
│         └────────────────────────────┘                            │
│                                                                   │
│  Feature Flags:                                                   │
│    - deepTools: true     → Browser + Web Search/Fetch            │
│    - filesystemAccess: true → Local file read/write (new)        │
│    - mcpHub: true        → All MCP integrations                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation Effort: Desktop

| Task | Effort | Priority |
|------|--------|----------|
| Browser tools already implemented | ✅ Done | — |
| Add `filesystemTools.ts` | ~4 hours | High |
| Wire into toolExecutor | ~1 hour | High |
| Add feature flag `filesystemAccess` | ~30 min | High |
| UI to configure allowed directories | ~2-3 hours | Medium |
| Headed browser mode option | ~1 hour | Low |
| CDP attachment to user's Chrome | ~3-4 hours | Low |

---

## Part 2: `main` (Web / Railway)

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Railway Cloud                       │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Docker Container                        ││
│  │  - Node.js Express server                           ││
│  │  - PostgreSQL (external Railway addon)              ││
│  │  - Stateless (no local storage persistence)         ││
│  │  - No access to client's filesystem                 ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                         ▲
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                        │
│  - React Admin App                                       │
│  - Agent Chat Widget                                     │
│  - No filesystem access (browser sandbox)               │
└─────────────────────────────────────────────────────────┘
```

### Browser Control: ⚠️ POSSIBLE WITH CAVEATS

**The Challenge:**  
In a cloud deployment, Playwright runs **on the server**, not on the user's machine. The agent can browse the web, but:
- User can't see what's happening (no visual feedback)
- Can't access pages that require the user's cookies/session
- Cloud costs increase (browser processes are resource-heavy)

**Options:**

#### Option A: Server-Side Headless Browser (Simplest)

Keep the existing `browserTools.ts` implementation, but understand limitations:
- ✅ Agent can browse public websites
- ✅ Agent can fill forms, scrape data
- ❌ No access to user's authenticated sessions
- ❌ No visual feedback to user
- ⚠️ Resource-intensive (memory, CPU)

**Railway Configuration:**
```yaml
# railway.json
{
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/health",
    "numReplicas": 1
  }
}
```

Add to Dockerfile:
```dockerfile
# Install Playwright browsers
RUN npx playwright install --with-deps chromium
```

**Memory requirements:** ~500MB+ per browser instance. Consider:
- Limiting concurrent browser sessions
- Auto-closing idle browsers
- Using browser pooling

#### Option B: Browser Extension Relay (Advanced)

Create a browser extension that users install, which:
1. Connects to your backend via WebSocket
2. Receives commands from the agent
3. Executes actions in the user's actual browser
4. Sends results back

```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Browser Extension (Chrome/Firefox)         │ │
│  │  - WebSocket connection to backend                 │ │
│  │  - Receives commands: navigate, click, type        │ │
│  │  - Executes in user's authenticated context        │ │
│  │  - Returns DOM snapshots, screenshots              │ │
│  └────────────────────┬───────────────────────────────┘ │
└───────────────────────┼─────────────────────────────────┘
                        │ WebSocket
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Railway Backend                       │
│  - Routes browser commands to extension                 │
│  - Agent can control user's actual browser              │
└─────────────────────────────────────────────────────────┘
```

**Pros:**
- Agent can access user's authenticated sessions
- User sees what's happening
- No server-side browser resources

**Cons:**
- Requires user to install extension
- Complex implementation
- Security/trust considerations

**Implementation Effort:** ~2-4 weeks for MVP

### Local File Access: ❌ NOT DIRECTLY POSSIBLE

**The Fundamental Problem:**  
Web apps cannot access the user's filesystem. This is a browser security sandbox constraint, not something you can work around.

**Options:**

#### Option A: File Upload/Download Only (Current)

Keep the existing Knowledge Base approach:
- User uploads files via browser
- Files stored on server (or S3/GCS)
- Agent can read/process uploaded files
- Agent can generate files for user to download

This is **not** the same as local file access, but it's the best you can do without a local agent.

#### Option B: Companion Desktop Agent (Recommended for Full Features)

Deploy a lightweight local agent that:
1. Runs on user's machine
2. Connects to cloud backend via WebSocket
3. Executes filesystem operations locally
4. Reports results to cloud

```
┌─────────────────────────────────────────────────────────┐
│                    User's Machine                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Local Agent (Electron/Tauri/Node)          │ │
│  │  - WebSocket to cloud                              │ │
│  │  - fs__read_file, fs__write_file, etc.            │ │
│  │  - Sandboxed to configured directories             │ │
│  └────────────────────┬───────────────────────────────┘ │
└───────────────────────┼─────────────────────────────────┘
                        │ WebSocket (wss://)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Railway Backend                       │
│  - Accepts file operation requests from LLM            │
│  - Routes to connected local agent                     │
│  - Returns results to LLM                              │
└─────────────────────────────────────────────────────────┘
```

**This is essentially what Clawdbot does** — and it's why Clawdbot requires a local Gateway.

**Implementation Path:**
1. Create minimal local agent (could reuse desktop app code)
2. Add WebSocket bridge endpoint to cloud backend
3. Route filesystem tool calls to local agent
4. Fall back gracefully if no local agent connected

#### Option C: Web File System Access API (Limited)

Modern browsers have a [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API):

```typescript
// Request access to a directory
const dirHandle = await window.showDirectoryPicker();

// Read a file
const fileHandle = await dirHandle.getFileHandle('example.txt');
const file = await fileHandle.getFile();
const contents = await file.text();

// Write a file
const writable = await fileHandle.createWritable();
await writable.write('new content');
await writable.close();
```

**Limitations:**
- User must explicitly grant permission each time
- Only works in secure contexts (HTTPS)
- Not supported in all browsers
- Files stay on client — can't be processed server-side without upload

**Use Case:** Let user pick a directory, then upload/sync specific files. Not true "local file access."

### Web App: Recommended Design

Given the constraints, I recommend a **hybrid approach**:

```
┌──────────────────────────────────────────────────────────────────┐
│                    Agent-in-a-Box (Cloud)                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐   ┌─────────────────┐                       │
│  │ Headless Browser│   │   MCP Hub       │                       │
│  │ (Server-side)   │   │ (Cloud APIs)    │                       │
│  │ - Public pages  │   │ - Gmail, Slack  │                       │
│  │ - Web scraping  │   │ - Sheets, etc.  │                       │
│  └────────┬────────┘   └────────┬────────┘                       │
│           │                     │                                 │
│           └──────────┬──────────┘                                 │
│                      ▼                                            │
│           ┌──────────────────────┐                                │
│           │   Tool Executor      │                                │
│           └──────────┬───────────┘                                │
│                      │                                            │
│                      ▼                                            │
│           ┌──────────────────────┐      ┌─────────────────────┐  │
│           │   WebSocket Bridge   │◀────▶│  Local Agent (opt)  │  │
│           │   (for local agent)  │      │  on user's machine  │  │
│           └──────────────────────┘      └─────────────────────┘  │
│                                                                   │
│  Features Available:                                              │
│    ✅ Browser (server-side headless)                             │
│    ✅ MCP integrations (APIs)                                    │
│    ⚠️ Filesystem (if local agent connected)                     │
│    ✅ KB file uploads (via browser)                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation Effort: Web

| Task | Effort | Priority |
|------|--------|----------|
| Enable server-side Playwright | ~2 hours | High |
| Add Dockerfile Playwright deps | ~30 min | High |
| Browser session limits/pooling | ~3-4 hours | Medium |
| WebSocket bridge for local agent | ~1-2 weeks | Medium |
| Minimal local agent package | ~1 week | Medium |
| Browser extension relay | ~2-4 weeks | Low |
| Web File System Access API | ~1-2 days | Low |

---

## Part 3: Comparison & Recommendations

### Feature Comparison

| Capability | Desktop (`main_withLocalApp`) | Web (`main`) |
|------------|-------------------------------|--------------|
| **Browser - Public pages** | ✅ Full | ✅ Full (headless) |
| **Browser - User's sessions** | ✅ Possible (headed/CDP) | ⚠️ Requires extension |
| **Browser - Visual feedback** | ✅ Can show window | ❌ Server-side only |
| **Filesystem - Read** | ✅ Native | ❌ Upload only |
| **Filesystem - Write** | ✅ Native | ❌ Download only |
| **Filesystem - Watch** | ✅ Possible | ❌ Not possible |
| **Resource usage** | User's machine | Server costs |
| **Deployment** | exe/dmg installer | Docker container |
| **Offline capability** | ✅ With Ollama | ❌ Requires network |

### Recommendations

#### For Desktop App (`main_withLocalApp`)

1. **Browser tools: Already done!** Just enable `deepTools` feature flag.

2. **Add filesystem tools:**
   - Create `filesystemTools.ts` (code provided above)
   - Add `filesystemAccess` feature flag
   - Implement path allowlisting for security

3. **Optional enhancements:**
   - Headed browser mode for transparency
   - CDP attachment for user's existing Chrome
   - File watcher for reactive updates

#### For Web App (`main`)

1. **Enable server-side browser:**
   - Add Playwright to Dockerfile
   - Keep existing `browserTools.ts`
   - Implement session pooling for cost control

2. **For full filesystem access:**
   - Build minimal local companion agent
   - Reuse code from desktop app
   - WebSocket bridge for cloud ↔ local communication

3. **Consider product positioning:**
   - Web = "Quick start, API integrations"
   - Desktop = "Full power, local access"
   - Both can use same backend code

### Migration Path

If you want **one codebase** that works for both:

```
agentinabox/
├── server/                  # Shared backend (works in both modes)
│   ├── src/
│   │   ├── tools/
│   │   │   ├── browserTools.ts    # Works in both (Playwright)
│   │   │   ├── filesystemTools.ts # Desktop-only, or via bridge
│   │   │   └── ...
│   │   └── ...
│   └── ...
├── web/                     # React frontend (shared)
├── desktop/                 # Electron wrapper (desktop only)
└── local-agent/             # Lightweight agent for web users (new)
    ├── src/
    │   ├── websocket-client.ts
    │   ├── filesystem-executor.ts
    │   └── browser-bridge.ts
    └── package.json
```

---

## Conclusion

**Desktop app** is the right place for browser control + filesystem access. The architecture is already there — you just need to implement `filesystemTools.ts` and wire it up.

**Web app** can support browser automation (server-side), but true local filesystem access requires either:
- A companion local agent (recommended)
- Limiting scope to file uploads/downloads (simpler)

The desktop app effectively **is** the local agent — so if a user wants full capabilities with the web version, they could run the desktop app alongside it and have it connect to the cloud backend.

**Next Steps:**
1. Implement `filesystemTools.ts` for desktop app (~4 hours)
2. Enable Playwright in Railway Dockerfile (~30 min)
3. Decide on local agent strategy for web users

---

*Analysis by Clark • January 31, 2026*
