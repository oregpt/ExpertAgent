# Next Steps: Lighthouse MCP Server

## Current Status
- ✅ MCP server built and tested
- ✅ 32 tools for Canton Network (5N Lighthouse API)
- ✅ No API key required (public API)
- ✅ Docs page with Lighthouse theme
- ⏳ **Not yet added to Agent-in-a-Box well-known servers**
- ⏳ **Not yet published to npm**

---

## To Do: Wire into MCP Hub

### 1. Add to well-known servers list

Edit `server/src/mcp-hub/servers/index.ts`:

```typescript
import { registerLighthouseServer } from './lighthouse/index.js';

// In the registration function:
registerLighthouseServer(registry);
```

### 2. Add to capabilities config

Edit the capabilities config to include:

```typescript
{
  id: 'lighthouse',
  name: 'Lighthouse (Canton Explorer)',
  description: '5N Lighthouse Explorer for Canton Network',
  provider: 'cantonloop',
  category: 'blockchain',
  requiresApiKey: false,  // Public API
  tools: 32,
  docsUrl: '/mcp/lighthouse/docs'
}
```

### 3. Test in Agent-in-a-Box

```bash
# Start the server
npm run dev

# Test the tools via MCP
curl -X POST http://localhost:3000/mcp/lighthouse/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "price_get", "arguments": {}}'
```

---

## To Do: Publish to npm

### 1. Create standalone package.json

```json
{
  "name": "@agenticledger/lighthouse-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for 5N Lighthouse (Canton Network Explorer)",
  "main": "dist/index.js",
  "bin": {
    "lighthouse-mcp-server": "dist/index.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/agenticledger/lighthouse-mcp-server"
  },
  "keywords": ["mcp", "canton", "blockchain", "lighthouse", "cantonloop", "5n"],
  "author": "Ore Phillips <ore.phillips@icloud.com>",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  }
}
```

### 2. Build and publish

```bash
npm run build
npm publish --access public
```

### 3. Test installation

```bash
npx @agenticledger/lighthouse-mcp-server
```

---

## Integration with Agent-in-a-Box

Once wired in, customers can:

1. Go to **Capabilities** page in admin
2. Enable "Lighthouse (Canton Explorer)"
3. **No API key needed** — works immediately
4. Agent can now query Canton Network data via Lighthouse

### Example Agent Prompts

```
"What's the current CC price?"
→ Uses price_get tool

"Show me the latest rounds on Canton"
→ Uses rounds_list tool

"Search for Digital-Asset validator"
→ Uses search tool

"Get the balance for party PAR::1220abc..."
→ Uses party_balance tool

"List all super validators"
→ Uses super_validators_list tool
```

---

## Client: 5N / CantonLoop
- **Product:** Lighthouse Explorer
- **API:** lighthouse.cantonloop.com/api
- **Auth:** None (public API)
- **Rate Limits:** Standard rate limits apply

---

## Comparison: Lighthouse vs CC Explorer Pro

| Feature | Lighthouse | CC Explorer Pro |
|---------|------------|-----------------|
| Provider | 5N / CantonLoop | NodeFortress |
| API Key | ❌ Not required | ✅ Required |
| Tools | 32 | 14 |
| Party Tools | 8 (balance, burns, pnl, rewards, etc.) | 2 |
| Governance | ✅ Full support | ❌ Limited |
| CNS | ✅ Full support | ❌ No |
| Pricing | Free | Paid tiers |

Both can be enabled simultaneously — they complement each other.

---

## Files Created

```
lighthouse/
├── index.ts              # Bundled MCP server entry
├── README.md             # Verbose documentation
├── NEXT_STEPS.md         # This file
├── .gitignore            # Git ignore rules
├── src/
│   ├── api-client.ts     # HTTP client (32 methods)
│   └── tools.ts          # MCP tool definitions (SLIM)
├── docs/
│   ├── index.html        # Interactive docs (Lighthouse theme)
│   └── TEST-RESULTS.md   # Test results
└── test/
    └── test-tools.ts     # Test suite
```

---

## Notes

- **SLIM descriptions** in tools.ts for token efficiency
- **VERBOSE descriptions** in README.md and docs for humans
- **Lighthouse theme** (dark + neon yellow-green #F3FF97)
- **No .env.example** needed (no secrets)
