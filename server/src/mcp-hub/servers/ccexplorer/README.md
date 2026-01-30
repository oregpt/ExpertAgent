# CC Explorer MCP Server

An MCP (Model Context Protocol) server for interacting with the **CC Explorer Pro API** at [pro.ccexplorer.io](https://pro.ccexplorer.io).

## Overview

This server provides AI assistants (Claude, etc.) with tools to query the Canton Network blockchain explorer. It covers governance, validators, parties, contracts, ledger updates, and more.

## API Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Stable | 14 | Tested and working reliably |

**Total: 14 tools**

## Installation

```bash
# Clone the repo
git clone https://github.com/oregpt/ccexplorer-mcp-server.git
cd ccexplorer-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

### Get an API Key

Contact [NodeFortress](https://nodefortress.com) to obtain a CC Explorer Pro API key.

### Set Environment Variable

```bash
export CCEXPLORER_API_KEY=your_api_key_here
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ccexplorer": {
      "command": "node",
      "args": ["/path/to/ccexplorer-mcp-server/dist/index.js"],
      "env": {
        "CCEXPLORER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### ✅ All Tools (14 total)

All tools are stable and tested:

#### Network Overview (3 tools)
| Tool | Description |
|------|-------------|
| `overview_get` | Get network overview (validators, supply, open votes) |
| `round_current` | Get the current round number |
| `consensus_get` | Get latest consensus block and validator set |

#### Governance (3 tools)
| Tool | Description |
|------|-------------|
| `governance_list` | List all governance votes (in progress and closed) |
| `governance_get` | Get a governance vote by tracking CID |
| `search` | Universal search for parties, updates, entities |

#### Validators (2 tools)
| Tool | Description |
|------|-------------|
| `validators_list` | List all active validator licenses |
| `super_validators_list` | List super validators with reward weights |

#### Parties (2 tools)
| Tool | Description |
|------|-------------|
| `party_get` | Get details of a specific party (wallet) by ID |
| `party_updates_list` | List updates involving a specific party |

#### Contracts (2 tools)
| Tool | Description |
|------|-------------|
| `contract_get` | Get details of a specific contract by ID |
| `contract_updates_list` | List updates involving a specific contract |

#### Ledger Updates (2 tools)
| Tool | Description |
|------|-------------|
| `updates_list` | List ledger updates |
| `update_get` | Get a specific ledger update by ID |

## Usage Examples

### Get Network Overview

```
Use the overview_get tool to see current network stats
```

### List Super Validators

```
Use super_validators_list to see all super validators and their reward weights
```

### Check Current Round

```
Use round_current to get the current consensus round number
```

### Search for a Party

```
Use search with query="Cumberland" to find parties by name
```

## Testing

Run the test suite:

```bash
# Set API key
export CCEXPLORER_API_KEY=your_key_here

# Run tests
npm test
```

## Rate Limiting

The CC Explorer Pro API has rate limits. The server handles this automatically with appropriate delays between requests.

## Project Structure

```
ccexplorer-mcp-server/
├── src/
│   ├── api-client.ts    # HTTP client for CC Explorer API
│   ├── tools.ts         # MCP tool definitions (14 tools)
│   └── index.ts         # Server entry point
├── test/
│   └── test-tools.ts    # Automated test suite
├── docs/
│   └── TEST-RESULTS.md  # Test results documentation
├── dist/                # Compiled JavaScript
├── .env                 # API key (gitignored)
├── .env.example         # API key template
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

Contributions welcome! Please:
1. Test your changes against the API
2. Update tool status if needed
3. Document any new findings

## License

MIT

## Author

Ore Phillips ([@oregpt](https://github.com/oregpt))

## Links

- [CC Explorer Pro](https://pro.ccexplorer.io) - Canton Network Explorer (Pro)
- [NodeFortress](https://nodefortress.com) - API Provider
- [Canton Network](https://canton.network) - Learn about Canton
