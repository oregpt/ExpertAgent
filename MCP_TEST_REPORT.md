# MCP Capability Test Report

**Generated:** 2026-02-05T19:03:16Z  
**Total MCP Servers:** 24 active  
**Total Tools Available:** 224

---

## Summary

| Status | Count | % |
|--------|-------|---|
| ✅ **Working** | 10 | 42% |
| ⚙️ **Needs Config** | 8 | 33% |
| ❌ **API/Server Error** | 6 | 25% |

---

## ✅ Working MCPs (10/24)

| MCP Server | Test Tool | Test Message | Result |
|------------|-----------|--------------|--------|
| **SEC EDGAR** | `search_filings` | Search Apple (CIK 320193) filings | ✅ PASS |
| **BinanceUS** | `get_ticker_price` | Get BTCUSDT price | ✅ PASS |
| **Kraken** | `get_ticker` | Get XBTUSD ticker | ✅ PASS |
| **Coinbase** | `get_spot_price` | Get BTC-USD spot price | ✅ PASS |
| **Lighthouse** | `price_get` | Get Canton Network price | ✅ PASS |
| **CCView** | `explore_stats` | Get Canton explorer stats | ✅ PASS |
| **CCExplorer** | `overview_get` | Get Canton overview | ✅ PASS |
| **Wallet Balance** | `list_supported_chains` | List supported blockchains | ✅ PASS |
| **Slack** | `list_channels` | List Slack channels | ✅ PASS |
| **AnyAPI** | `list_available_apis` | List configured APIs | ✅ PASS |

---

## ⚙️ Needs Configuration (8)

### OAuth Required

| MCP Server | Error | Action Required |
|------------|-------|-----------------|
| **Google Calendar** | OAuth tokens missing | Connect via OAuth button |
| **Gmail** | OAuth tokens missing | Connect via OAuth button |
| **Google Sheets** | OAuth tokens missing | Connect via OAuth button |
| **Google Docs** | OAuth 401 error | Re-auth needed (token expired) |
| **QuickBooks** | OAuth tokens missing | Connect via OAuth button |

### API Key/Credentials Required

| MCP Server | Error | Action Required |
|------------|-------|-----------------|
| **Plaid** | Credentials missing | Add client_id, secret, access_token |
| **Notion** | Integration token missing | Add Notion integration token |

---

## ❌ API/Server Errors (6)

| MCP Server | Error | Potential Cause | Action |
|------------|-------|-----------------|--------|
| **Bitwave Price** | 404 Not Found | API endpoint changed | Check Bitwave API docs |
| **Kaiko** | 400 Bad Request | Invalid params or key | Check API key validity |
| **TheTie Canton** | 403 Forbidden | Auth failed | Check API key permissions |
| **Gamma** | 404 Not Found | Wrong endpoint | Check Gamma API docs |
| **ChatScraper** | fetch failed | Server not running | Start ChatScraper service |
| **FAAM Tracker** | fetch failed | Server not running | Start FAAM Tracker service |
| **Trader** | fetch failed | Server not running | Start Trader service |

---

## API Keys Configured

Keys saved in `API_KEYS.local.md` (gitignored):

| Service | Status |
|---------|--------|
| Kaiko | ✅ Configured (API 400 error - check key) |
| BinanceUS | ✅ Working |
| CCView | ✅ Working |
| CCExplorer | ✅ Working |
| Gamma | ✅ Configured (API 404 error) |
| Trader | ✅ Configured (server not responding) |

---

## Next Steps

### High Priority
1. **Google OAuth** - Tokens exist for default-agent but not being loaded for google-calendar, gmail, sheets
2. **Kaiko** - Key configured but getting 400 error - may need different API endpoint
3. **TheTie Canton** - 403 error - API key may be invalid or permissions issue

### Medium Priority  
1. Start local services: ChatScraper, FAAM Tracker, Trader
2. Check Bitwave and Gamma API documentation for endpoint changes
3. Configure Notion, Plaid credentials

---

## Test Details

**Test Method:** Direct MCP tool execution via `/api/admin/mcp/execute`  
**Test Date:** 2026-02-05  
**Server Port:** 4501

Each test calls the actual MCP server's tool and records:
- Tool name and arguments
- Pass/Fail result
- Error message if failed
