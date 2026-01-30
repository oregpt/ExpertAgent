# Lighthouse Explorer MCP Server

An MCP (Model Context Protocol) server for the **5N Lighthouse Explorer API** at [lighthouse.cantonloop.com](https://lighthouse.cantonloop.com).

## Overview

This server provides AI assistants (Claude, etc.) with tools to query the Canton Network via the Lighthouse Explorer. It covers CNS (Canton Name Service), governance, validators, parties, contracts, transfers, prices, and more.

**No API key required** — this is a public API.

## API Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Stable | 32 | Tested and working reliably |

**Total: 32 tools**

## Available Tools

### CNS - Canton Name Service (2 tools)
| Tool | Description |
|------|-------------|
| `cns_list` | List CNS records with pagination (domain name registrations) |
| `cns_get` | Get a CNS record by domain name |

### Contracts (2 tools)
| Tool | Description |
|------|-------------|
| `contracts_list` | List contracts with cursor-based pagination |
| `contract_get` | Get contract details by ID |

### Featured Apps (1 tool)
| Tool | Description |
|------|-------------|
| `featured_apps_get` | Get list of featured applications on the network |

### Governance (3 tools)
| Tool | Description |
|------|-------------|
| `governance_list` | List all governance vote requests with aggregated counts |
| `governance_stats` | Get governance statistics (executed, expired, in-progress, rejected) |
| `governance_get` | Get detailed governance vote request by ID including votes |

### Me (1 tool)
| Tool | Description |
|------|-------------|
| `me_get` | Get URL/participant information |

### Party (8 tools)
| Tool | Description |
|------|-------------|
| `party_balance` | Get CC balance for a party (wallet) |
| `party_burns` | List burns for a party with pagination |
| `party_pnl` | Get profit/loss data for a party |
| `party_rewards` | List rewards earned by a party |
| `party_burn_stats` | Get aggregated burn stats for a party in a time range |
| `party_reward_stats` | Get aggregated reward stats (app + validator rewards) |
| `party_transfers` | List transfers involving a party (sent or received) |
| `party_transactions` | List all transactions for a party |

### Preapprovals (1 tool)
| Tool | Description |
|------|-------------|
| `preapprovals_list` | List preapproval records, optionally filtered by address |

### Prices (2 tools)
| Tool | Description |
|------|-------------|
| `price_get` | Get latest CC price in USD |
| `price_history` | Get 24-hour price history in hourly buckets |

### Rounds (2 tools)
| Tool | Description |
|------|-------------|
| `rounds_list` | List consensus rounds with pagination |
| `round_get` | Get a specific round by number (includes reward rates) |

### Search (1 tool)
| Tool | Description |
|------|-------------|
| `search` | Universal search for validators, parties, transactions, contracts, CNS |

### Stats (2 tools)
| Tool | Description |
|------|-------------|
| `stats_get` | Get general chain statistics |
| `stats_rounds_latest` | Get latest rounds information |

### Super Validators (1 tool)
| Tool | Description |
|------|-------------|
| `super_validators_list` | List all super validators and total count |

### Transactions (2 tools)
| Tool | Description |
|------|-------------|
| `transactions_list` | List transactions with pagination |
| `transaction_get` | Get transaction details by update ID |

### Transfers (2 tools)
| Tool | Description |
|------|-------------|
| `transfers_list` | List all transfers with optional time filtering |
| `transfer_get` | Get transfer details by event ID |

### Validators (2 tools)
| Tool | Description |
|------|-------------|
| `validators_list` | Get all validators |
| `validator_get` | Get validator details by ID including balance and stats |

## Usage Examples

### Get Network Stats

```
Use the stats_get tool to see current chain statistics
```

### Check CC Price

```
Use price_get to get the latest CC price in USD
```

### Search for a Party

```
Use search with q="Cumberland" to find parties by name
```

### Get Party Balance

```
Use party_balance with id="<party_address>" to check CC balance
```

## Project Structure

```
lighthouse/
├── src/
│   ├── api-client.ts    # HTTP client for Lighthouse API
│   └── tools.ts         # MCP tool definitions (32 tools)
├── docs/
│   └── index.html       # Interactive API docs
├── test/
│   └── test-tools.ts    # Automated test suite
├── index.ts             # Server entry point (bundled)
└── README.md
```

## Integration

This server is bundled for Agent-in-a-Box. No separate installation required.

## Links

- [Lighthouse Explorer](https://lighthouse.cantonloop.com) - Canton Network Explorer
- [CantonLoop](https://cantonloop.com) - Provider
- [Canton Network](https://canton.network) - Learn about Canton
- [API Docs](https://lighthouse.cantonloop.com/swagger/index.html) - Swagger/OpenAPI

## Author

Ore Phillips ([@oregpt](https://github.com/oregpt))
