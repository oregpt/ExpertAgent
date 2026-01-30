# Next Steps: CCView MCP Server

## Current Status
- ✅ MCP server built and tested
- ✅ 49 tools for Canton Network (ccview.io API)
- ✅ Added to Agent-in-a-Box well-known servers list
- ⏳ **Not yet published to npm**

## To Do: Publish to npm

### 1. Create npm account/org (if not exists)
```bash
npm login
```

### 2. Update package.json
Make sure these fields are set:
```json
{
  "name": "@oregpt/ccview-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Canton Network Explorer (ccview.io)",
  "main": "dist/index.js",
  "bin": {
    "ccview-mcp-server": "dist/index.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/oregpt/ccview-mcp-server"
  },
  "keywords": ["mcp", "canton", "blockchain", "ccview"],
  "author": "Ore Phillips",
  "license": "MIT"
}
```

### 3. Build and publish
```bash
npm run build
npm publish --access public
```

### 4. Test installation
```bash
npx @oregpt/ccview-mcp-server
```

## Integration with Agent-in-a-Box

Once published, customers can:
1. Go to **Capabilities** page in admin
2. Enable "CCView (Canton Explorer)"
3. Enter their CCView API key
4. Agent can now query Canton Network data

## Client: PixelPlex
- Product: Canton Network Mission Control
- API: ccview.io
