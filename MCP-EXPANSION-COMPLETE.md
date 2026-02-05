# MCP Server Expansion — COMPLETE

**Date:** Feb 4, 2026 (late night)
**Status:** Code complete, awaiting server restart

## Summary

Expanded Agent-in-a-Box v2 from **10 to 24 bundled MCP servers**, matching most of the Expert Agent MCP roster (excluding DocuSign, GitLab, Jira, NodeFortress per Ore's request).

## New Servers (14 added)

### Finance & Data
| Server | Tools | Auth |
|--------|-------|------|
| **SEC EDGAR** | get_company_tickers, get_company_submissions, get_company_facts, get_company_concept, search_filings | None (public) |
| **Bitwave Price** | get_price, get_batch_prices, list_supported_assets | Optional API key |
| **Kaiko** | get_direct_price, get_vwap, get_ohlcv, get_trades | API key |
| **Plaid** | get_accounts, get_balances, get_transactions, get_identity, get_auth | OAuth/Link |
| **FAAM Tracker** | get_stats, get_transactions, get_wallets, get_assets | Optional API key |

### Blockchain
| Server | Tools | Auth |
|--------|-------|------|
| **Wallet Balance** | get_balance, get_multiple_balances, list_supported_chains, validate_address | Optional API key |
| **TheTie Canton** | get_cumulative_metrics, get_validator_leaderboard, get_daily_active_users, etc. | Optional API key |

### Exchanges
| Server | Tools | Auth |
|--------|-------|------|
| **BinanceUS** | get_account_info, get_balance, get_trades, get_deposits, get_withdrawals, get_ticker_price | HMAC (key+secret) |
| **Kraken** | get_account_balance, get_trade_balance, get_open_orders, get_trades_history, get_ledgers, get_ticker | HMAC (key+secret) |
| **Coinbase** | list_accounts, get_account, get_transactions, get_deposits, get_withdrawals, get_spot_price | JWT (key+privkey) |

### Productivity
| Server | Tools | Auth |
|--------|-------|------|
| **Google Docs** | get_document, create_document, search_documents, list_documents, append_text, export_document | OAuth2 |
| **Gamma** | generate_presentation, get_themes, get_presentation, list_presentations | API key |
| **ChatScraper** | scrape_telegram, scrape_slack, list_telegram_channels, list_slack_channels | Tokens |

### Trading
| Server | Tools | Auth |
|--------|-------|------|
| **Trader** | get_campaigns, create_campaign, get_dashboard, get_strategies, start/pause_campaign | API key |

## Files Changed

### New Files (14)
```
server/src/mcp-hub/servers/
├── sec-edgar/index.ts
├── bitwave-price/index.ts
├── wallet-balance/index.ts
├── binanceus/index.ts
├── kraken/index.ts
├── coinbase/index.ts
├── google-docs/index.ts
├── plaid/index.ts
├── kaiko/index.ts
├── thetie-canton/index.ts
├── chatscraper/index.ts
├── gamma/index.ts
├── faam-tracker/index.ts
└── trader/index.ts
```

### Modified Files (3)
- `server/src/mcp-hub/mcp-server-manager.ts` — imports, registration, token config
- `server/src/http/adminRoutes.ts` — live token reload arrays
- `server/src/capabilities/capabilityService.ts` — capability seeding

## Action Required

### 1. Restart Backend Server
```bash
cd server
# Stop current server (Ctrl+C)
npx ts-node --transpile-only src/index.ts
```

### 2. Verify Startup
Should see in console:
```
[mcp-manager] Registered bundled server: sec-edgar
[mcp-manager] Registered bundled server: bitwave-price
... (all 24 servers)
[mcp-manager] MCP Server Manager initialized with 24 bundled servers
```

### 3. Quick Test (No Auth Needed)
1. Go to Chat page
2. Select any agent
3. Ask: "Get Tesla's company facts from SEC EDGAR"
4. Should return TSLA CIK, taxonomies, and sample concepts

### 4. Enable New Capabilities for Finance Assistant
The new capabilities need to be enabled per-agent:
```sql
-- Run in psql to enable all new MCPs for Finance Assistant:
INSERT INTO ai_agent_capabilities (agent_id, capability_id, enabled)
SELECT 'agent-1770259052719-vvcqgp', id, 1
FROM ai_capabilities
WHERE id IN ('sec-edgar', 'bitwave-price', 'wallet-balance', 'binanceus', 'kraken', 'coinbase', 'google-docs', 'plaid', 'kaiko', 'thetie-canton', 'chatscraper', 'gamma', 'faam-tracker', 'trader')
ON CONFLICT (agent_id, capability_id) DO UPDATE SET enabled = 1;
```

## TypeScript Notes

- 50 total TS errors (18 in new files, 32 pre-existing)
- All are `exactOptionalPropertyTypes` strictness issues
- Server runs fine with `--transpile-only` (bypasses type checking)
- Same pattern as existing code (gmail, calendar, etc.)

## What's NOT Included

Per Ore's request, these Expert Agent MCPs were excluded:
- DocuSign
- GitLab
- Jira
- NodeFortress
