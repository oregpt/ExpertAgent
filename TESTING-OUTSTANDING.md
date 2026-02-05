# Testing Outstanding — Feb 4, 2026

## What's Done ✅
- 24 MCP servers registered and initializing
- BinanceUS tested and working (balance query)
- Kraken tested and working (balance query)
- SEC EDGAR tested and working (Tesla company data)
- Gmail tested and working (recent emails)
- Dynamic credential UI implemented (reads from `config.tokenFields`)
- Code pushed to https://github.com/oregpt/ExpertAgent

## What's Outstanding 🔲

### 1. UI Credential Configuration Testing
For each MCP, verify the Capabilities UI shows the **correct fields**:

| MCP | Expected Fields | Status |
|-----|-----------------|--------|
| Kraken | API Key, Secret Key | ✅ Works |
| BinanceUS | API Key, Secret Key | ✅ Works |
| Coinbase | API Key Name, Private Key (PEM) | 🔲 Test |
| Plaid | Client ID, Secret, Access Token | 🔲 Test |
| Kaiko | API Key | 🔲 Test |
| TheTie Canton | API Key (x-api-key) (optional) | 🔲 Test |
| Gamma | API Key | 🔲 Test |
| Google Docs | Access Token, Refresh Token, Client ID, Client Secret | 🔲 Test |
| Google Sheets | Access Token, Refresh Token, Client ID, Client Secret | 🔲 Test |
| Google Calendar | Access Token, Refresh Token, Client ID, Client Secret | ✅ Works |
| Gmail | Access Token, Refresh Token, Client ID, Client Secret | ✅ Works |
| QuickBooks | Access Token, Refresh Token, Realm ID, Client ID, Client Secret | 🔲 Test |
| Slack | Bot Token (xoxb-...) | 🔲 Test UI |
| Notion | API Key | 🔲 Test |
| Wallet Balance | API Key (optional) | 🔲 Test UI |
| Bitwave Price | API Key (optional) | 🔲 Test |
| SEC EDGAR | (no auth required) | ✅ Works |
| ChatScraper | Telegram Token, Slack Token | 🔲 Test |
| FAAM Tracker | API Key (optional) | 🔲 Test |
| Trader | API Key | 🔲 Test |
| CCView | API Key | 🔲 Test |
| CC Explorer Pro | API Key | 🔲 Test |
| Lighthouse | (no auth required) | ✅ Works |

### 2. Chat Functionality Testing
For each configured MCP, test via Chat to verify results come back:

| MCP | Test Query | Status |
|-----|------------|--------|
| Kraken | "What's my Kraken balance?" | ✅ Works |
| BinanceUS | "What's my BinanceUS balance?" | ✅ Works |
| SEC EDGAR | "Get Tesla's company facts" | ✅ Works |
| Gmail | "Show my recent emails" | ✅ Works |
| Coinbase | "List my Coinbase accounts" | 🔲 Need private key |
| Plaid | "Get my bank account balances" | 🔲 Need access token |
| Kaiko | "Get BTC/USD price from Kaiko" | 🔲 Test |
| TheTie Canton | "Get Canton validator stats" | 🔲 Test |
| Gamma | "List Gamma presentation themes" | 🔲 Test |
| Google Calendar | "Show my calendar events" | 🔲 Test |
| Google Docs | "List my Google documents" | 🔲 Test |
| Wallet Balance | "Get balance for 0x... on ethereum" | 🔲 Test |
| Bitwave Price | "Get BTC price from Bitwave" | 🔲 Test |

## Known Issues
1. **Toggle button navigation bug** — Clicking capability toggle sometimes navigates to /config (UI bug)
2. **Capability seeding** — New tokenFields only apply to NEW capabilities; existing ones in DB need manual update via API

## How to Test

### UI Credential Test:
1. Go to Capabilities page
2. Select Finance Assistant
3. Click "+ Add Credential" on a capability
4. Verify correct field labels appear
5. Enter test values and save
6. Verify "✓ Credentials configured" appears

### Chat Test:
1. Go to Chat page
2. Select Finance Assistant
3. Ask a query that uses the MCP
4. Verify the agent calls the tool and returns data
5. Check server logs for `[tool-executor]` messages
