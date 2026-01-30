# ccview.io MCP Server

An MCP (Model Context Protocol) server for interacting with the **Canton Network Explorer API** at [ccview.io](https://ccview.io).

## Overview

This server provides AI assistants (Claude, etc.) with tools to query the Canton Network blockchain explorer. It covers governance, validators, token transfers, ANS names, and more.

## API Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Stable | 32 | Tested and working reliably |
| ⚠️ Experimental | 12 | Works but may need specific parameters |
| ❌ Deprecated | 5 | Returns 404, likely removed from API |

**Total: 49 tools**

## Installation

```bash
# Clone the repo
git clone https://github.com/oregpt/ccview-mcp-server.git
cd ccview-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

### Get an API Key

1. Go to [ccview.io](https://ccview.io)
2. Create an account or log in
3. Generate an API key

### Set Environment Variable

```bash
export CCVIEW_API_KEY=your_api_key_here
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ccview": {
      "command": "node",
      "args": ["/path/to/ccview-mcp-server/dist/index.js"],
      "env": {
        "CCVIEW_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### ✅ Stable Tools (32)

These tools are fully tested and working:

#### Governance (6 tools)
| Tool | Description |
|------|-------------|
| `governance_list_active` | List active governance proposals |
| `governance_list_completed` | List completed governance proposals |
| `governance_search` | Search all governance proposals |
| `governance_price_votes` | Get governance price votes |
| `governance_details` | Get details for a specific proposal |
| `governance_statistics` | Get overall governance statistics |

#### ANS - Canton Name Service (4 tools)
| Tool | Description |
|------|-------------|
| `ans_check_availability` | Check if an ANS name is available |
| `ans_list_by_party` | List ANS names owned by a party |
| `ans_context_by_name` | Get ANS context for a name |
| `ans_context_by_party` | Get ANS context for a party |

#### Super Validators (3 tools)
| Tool | Description |
|------|-------------|
| `super_validators_escrow` | List super validators in escrow |
| `super_validators_hosted` | List hosted super validators |
| `super_validators_standalone` | List standalone super validators |

#### Validators (3 tools)
| Tool | Description |
|------|-------------|
| `validators_list` | List all validators |
| `validator_details` | Get validator details |
| `validator_statistics` | Get validator statistics |

#### Parties (2 tools)
| Tool | Description |
|------|-------------|
| `party_details` | Get party (wallet) details |
| `party_counterparties` | Get counterparties for a party |

#### Token Transfers (3 tools)
| Tool | Description |
|------|-------------|
| `token_transfers_list` | List recent token transfers |
| `token_transfer_details` | Get transfer details by event ID |
| `token_transfer_instructions` | Get transfer instructions |

#### Explore / Stats (5 tools)
| Tool | Description |
|------|-------------|
| `explore_stats` | Get network statistics |
| `explore_prices` | Get current token prices |
| `explore_prices_proxy` | Get prices via proxy |
| `explore_supply_stats` | Get supply statistics |
| `explore_transfer_stat_per_day` | Get daily transfer stats |

#### Offers (2 tools)
| Tool | Description |
|------|-------------|
| `offers_search` | Search offers |
| `offers_stat` | Get offer statistics |

#### Featured Apps (1 tool)
| Tool | Description |
|------|-------------|
| `featured_apps_list` | List featured apps |

#### Rewards (2 tools)
| Tool | Description |
|------|-------------|
| `rewards_leaderboard_top` | Get top rewards leaderboard |
| `rewards_leaderboard_stat` | Get leaderboard statistics |

#### General (1 tool)
| Tool | Description |
|------|-------------|
| `general_search` | Universal search |

### ⚠️ Experimental Tools (12)

These tools work but may require specific parameters or return inconsistent results:

| Tool | Notes |
|------|-------|
| `ans_request_status` | Needs valid request reference |
| `super_validators_onboarded` | May need sv_party_id |
| `validator_performance_ranged` | Needs date range |
| `party_balance_changes` | May need cursor format |
| `party_interactions` | May need date range |
| `token_transfers_by_party` | May need cursor format |
| `featured_apps_top5` | Unknown issue |
| `updates_list` | May need datetime params |
| `updates_by_party` | May need datetime params |

### ❌ Deprecated Tools (5)

These tools are included for completeness but return 404 errors. They may have been removed from the API:

| Tool | Notes |
|------|-------|
| `mining_rounds_active` | Mining feature may be deprecated |
| `mining_rounds_list` | Mining feature may be deprecated |
| `rewards_app` | Use rewards_leaderboard instead |
| `rewards_validator` | Use rewards_leaderboard instead |
| `rewards_super_validator` | Use rewards_leaderboard instead |

## Resources

The server also provides these informational resources:

| Resource URI | Description |
|--------------|-------------|
| `ccview://api-status` | Overview of endpoint statuses |
| `ccview://tools-by-category` | Tools organized by category |

## Usage Examples

### List Active Governance Proposals

```
Use the governance_list_active tool to see current proposals
```

### Check ANS Name Availability

```
Use ans_check_availability with name="myname" to check if it's available
```

### Get Network Statistics

```
Use explore_stats to get current network statistics
```

### Search for a Party

```
Use general_search with arg="party_id_here" to find information
```

## Rate Limiting

The ccview.io API has rate limits:
- ~10-15 requests per minute
- The server automatically adds 2-second delays between requests

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

- [ccview.io](https://ccview.io) - Canton Network Explorer
- [ccview.io API Docs](https://docs.ccview.io) - Official API Documentation
- [Canton Network](https://canton.network) - Learn about Canton
