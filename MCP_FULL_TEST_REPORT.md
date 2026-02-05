# MCP Full Test Report

**Generated:** 2026-02-05T19:31:09.820Z  
**Duration:** 2.9s  
**API Endpoint:** `http://localhost:4501/api/admin/mcp/execute`

---

## Summary

| Result | Count |
|--------|-------|
| ✅ PASS | 13 |
| ❌ FAIL | 7 |
| **Total** | 20 |

---

## Detailed Results

### ✅ SEC EDGAR - Search Apple filings

**Server:** `sec-edgar`  
**Tool:** `search_filings`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:09.821Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "sec-edgar",
  "tool": "search_filings",
  "arguments": {
    "cik": "320193",
    "limit": 1
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "company": "Apple Inc.",
    "cik": "0000320193",
    "totalFilings": 1000,
    "filings": [
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001059235-26-000002"
      },
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001216519-26-000002"
      },
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001179864-26-000002"
      },
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001214128-26-000002"
      },
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001051401-26-000002"
      },
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001453149-26-000003"
      },
      {
        "form": "4",
        "filingDate": "2026-02-03",
        "accessionNumber": "0001690882-26-000002"
      },
      {
        "form": "10-Q",
        "filingDate": "2026-01-30",
        "accessionNumber": "0000320193-26-000006"
      },
      {
        "form": "8-K",
        "filingDate": "2026-01-29",
        "accessionNumber": "0000320193-26-000005"
      },
      {
        "form": "PX14A6G",
        "filingDate": "2026-01-22",
        "accessionNumber": "0001096906-26-000136"
      },
      {
        "form": "DEFA14A",
        "filingDate": "2026-01-08",
        "accessionNumber": "0001308179-26-000009"
      },
      {
        "form": "DEF 14A",
        "filingDate": "2026-01-08",
        "accessionNumber": "0001308179-26-000008"
      },
      {
        "form": "3",
        "filingDate": "2026-01-02",
        "accessionNumber": "0002100523-26-000002"
      },
      {
        "form": "8-K",
        "filingDate": "2026-01-02",
        "accessionNumber": "0001140361-26-000199"
      },
      {
        "form": "8-K",
        "filingDate": "2025-12-05",
        "accessionNumber": "0001140361-25-
... (truncated)
```


---

### ✅ Bitwave Price - List supported assets

**Server:** `bitwave-price`  
**Tool:** `list_supported_assets`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:10.059Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "bitwave-price",
  "tool": "list_supported_assets",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "supportedAssets": [
      "BTC",
      "ETH",
      "SOL",
      "USDT",
      "USDC",
      "BNB",
      "XRP",
      "ADA",
      "DOGE",
      "MATIC",
      "DOT",
      "AVAX",
      "LINK",
      "UNI",
      "ATOM",
      "LTC",
      "BCH",
      "FIL",
      "APT",
      "SUI",
      "NEAR",
      "ARB",
      "OP",
      "AAVE",
      "MKR",
      "SNX",
      "CRV",
      "LDO",
      "RUNE",
      "FTM"
    ],
    "service": "cryptocompare",
    "totalAssets": 30
  },
  "metadata": {
    "server": "bitwave-price",
    "tool": "list_supported_assets",
    "executionTime": 0
  }
}
```


---

### ✅ BinanceUS - Get BTC price

**Server:** `binanceus`  
**Tool:** `get_ticker_price`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:10.066Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "binanceus",
  "tool": "get_ticker_price",
  "arguments": {
    "symbol": "BTCUSDT"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "price": 65811.08,
    "timestamp": "2026-02-05T19:31:10.135Z"
  },
  "metadata": {
    "server": "binanceus",
    "tool": "get_ticker_price",
    "executionTime": 66
  }
}
```


---

### ✅ Kraken - Get BTC ticker

**Server:** `kraken`  
**Tool:** `get_ticker`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:10.136Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "kraken",
  "tool": "get_ticker",
  "arguments": {
    "pair": "XBTUSD"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "pair": "XBTUSD",
    "ask": 65618,
    "bid": 65617.9,
    "last": 65652.8,
    "volume24h": 8932.04998559,
    "low24h": 65250.6,
    "high24h": 73975.3
  },
  "metadata": {
    "server": "kraken",
    "tool": "get_ticker",
    "executionTime": 214
  }
}
```


---

### ❌ Kaiko - Get BTC price

**Server:** `kaiko`  
**Tool:** `get_direct_price`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:10.354Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "kaiko",
  "tool": "get_direct_price",
  "arguments": {
    "baseAsset": "btc",
    "quoteAsset": "usd"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "Kaiko API error 400",
  "metadata": {
    "server": "kaiko",
    "tool": "get_direct_price",
    "executionTime": 172
  }
}
```

**Error:** Kaiko API error 400

---

### ✅ Coinbase - Get BTC spot

**Server:** `coinbase`  
**Tool:** `get_spot_price`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:10.532Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "coinbase",
  "tool": "get_spot_price",
  "arguments": {
    "currencyPair": "BTC-USD"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "currencyPair": "BTC-USD",
    "price": 65676.54,
    "currency": "USD"
  },
  "metadata": {
    "server": "coinbase",
    "tool": "get_spot_price",
    "executionTime": 96
  }
}
```


---

### ✅ TheTie Canton - Get metrics

**Server:** `thetie-canton`  
**Tool:** `get_cumulative_metrics`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:10.633Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "thetie-canton",
  "tool": "get_cumulative_metrics",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "status": "success",
    "code": 200,
    "metadata": {
      "timestamp": "2026-02-05T19:31:11.025Z",
      "version": "3.0",
      "pagination": {
        "limit": 100,
        "total": 2945,
        "nextMarker": null,
        "prevMarker": null
      }
    },
    "links": {
      "self": "https://api-thetie.io/v3/integrations/canton/cumulative-metrics",
      "next": "",
      "prev": ""
    },
    "data": [
      {
        "round_date": "2026-02-04",
        "amount": "1983730813.79",
        "data_type": "Burn"
      },
      {
        "round_date": "2026-02-04",
        "amount": "17430576.88",
        "data_type": "Daily Burn"
      },
      {
        "round_date": "2026-02-04",
        "amount": "37794784245.56",
        "data_type": "Minted"
      },
      {
        "round_date": "2026-02-04",
        "amount": "40621736589.00",
        "data_type": "Total Allowed"
      },
      {
        "round_date": "2026-02-04",
        "amount": "37814806694.68",
        "data_type": "Total Balance"
      },
      {
        "round_date": "2026-02-03",
        "amount": "1966300236.91",
        "data_type": "Burn"
      },
      {
        "round_date": "2026-02-03",
        "amount": "14225126.98",
        "data_type": "Daily Burn"
      },
      {
        "round_date": "2026-02-03",
        "amount": "37775327666.47",
        "data_type": "Minted"
      },
      {
        "round_date": "2026-02-03",
        "amount": "40595100469.00",
        "data_type": "Total Allowed"
      },
      {
        "round_date": "2026-02-03",
        "amount": "37807040881.07",
        "data_type": "Total Balance"
      },
      {
        "round_date": "2026-02-02",
        "amount": "1952075109.94",
        "data_type": "Burn"
      },
      {
        "round_date": "2026-02-02",
        "amount": "15630801.57",
        "data_type": "Daily Burn"
      },
      {
        "round_date": "2026-02-02",
        "amount": "37746818656.20",
        "data_typ
... (truncated)
```


---

### ✅ Lighthouse - Get price

**Server:** `lighthouse`  
**Tool:** `price_get`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:11.009Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "lighthouse",
  "tool": "price_get",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "price": 0.16468805608502052
  },
  "metadata": {
    "server": "lighthouse",
    "tool": "price_get",
    "executionTime": 408
  }
}
```


---

### ✅ CCView - Explorer stats

**Server:** `ccview`  
**Tool:** `explore_stats`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:11.422Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "ccview",
  "tool": "explore_stats",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "cc_price": "0.16468805608502052",
    "total_supply": "37677364986.1074195515",
    "market_cap": "6205011997.9678470964615724701",
    "volume": "130674282.6160484201",
    "volume_gain_percentage": 0.20378975149553036,
    "latest_round": 82227,
    "updates_count": 133738959,
    "migration": 4,
    "version": "0.5.9",
    "total_parties": 278849,
    "sv_count": 13,
    "validator_count": 812,
    "featured_apps_count": 112,
    "fee_accumulated": "76417276.9508431753",
    "total_transfer_count": 96603808,
    "total_governance_vote_count": 288,
    "total_rewards": "37833370895.7253344644",
    "total_rewards_missed": "1211657517.1037507292"
  },
  "metadata": {
    "server": "ccview",
    "tool": "explore_stats",
    "executionTime": 411
  }
}
```


---

### ✅ CCExplorer - Overview

**Server:** `ccexplorer`  
**Tool:** `overview_get`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:11.838Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "ccexplorer",
  "tool": "overview_get",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "activeValidators": 733,
    "superValidators": 13,
    "supply": "37677421734.2318606773",
    "consensusHeight": "13573025",
    "version": "0.5.6",
    "featuredApps": 112,
    "openVotes": [
      {
        "status": "in_progress",
        "template_id": "996a3b619d6b65ca7812881978c44c650cac119de78f5317d1f317658943001c:Splice.DsoRules:VoteRequest",
        "contract_id": "005a66bceeffcbe07890f39b05b4449ef794840b7b19a2f7905227f09e7031babbca121220b77d124527c1da0ccd17e26d1585c8dc7d27dcab0ff0b4ed51ea246118a0540d",
        "payload": {
          "dso": "DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc",
          "votes": [
            [
              "C7-Technology-Services-Limited",
              {
                "sv": "C7-Technology-Services-Limited",
                "accept": null
              }
            ],
            [
              "Cumberland-1",
              {
                "sv": "Cumberland-1",
                "accept": null
              }
            ],
            [
              "Cumberland-2",
              {
                "sv": "Cumberland-2",
                "accept": null
              }
            ],
            [
              "Digital-Asset-1",
              {
                "sv": "Digital-Asset-1",
                "accept": null
              }
            ],
            [
              "Digital-Asset-2",
              {
                "sv": "Digital-Asset-2",
                "accept": null
              }
            ],
            [
              "Five-North-1",
              {
                "sv": "Five-North-1::1220520b6d396b91c4b13a1786bd5f317e4240001632d4a628c1c4f53a0b5165ba98",
                "accept": true,
                "reason": {
                  "url": "",
                  "body": ""
                },
                "optCastAt": "2026-02-04T03:13:36.553248Z"
              }
            ],
            [
              "Global-Synchronizer-Foundation",
  
... (truncated)
```


---

### ✅ Wallet Balance - List chains

**Server:** `wallet-balance`  
**Tool:** `list_supported_chains`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:12.174Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "wallet-balance",
  "tool": "list_supported_chains",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "chains": [
      {
        "id": "ethereum",
        "name": "Ethereum",
        "symbol": "ETH"
      },
      {
        "id": "polygon",
        "name": "Polygon",
        "symbol": "MATIC"
      },
      {
        "id": "arbitrum",
        "name": "Arbitrum One",
        "symbol": "ETH"
      },
      {
        "id": "optimism",
        "name": "Optimism",
        "symbol": "ETH"
      },
      {
        "id": "base",
        "name": "Base",
        "symbol": "ETH"
      },
      {
        "id": "avalanche",
        "name": "Avalanche C-Chain",
        "symbol": "AVAX"
      },
      {
        "id": "bsc",
        "name": "BNB Smart Chain",
        "symbol": "BNB"
      },
      {
        "id": "solana",
        "name": "Solana",
        "symbol": "SOL"
      },
      {
        "id": "bitcoin",
        "name": "Bitcoin",
        "symbol": "BTC"
      }
    ],
    "count": 9
  },
  "metadata": {
    "server": "wallet-balance",
    "tool": "list_supported_chains",
    "executionTime": 0
  }
}
```


---

### ✅ Slack - List channels

**Server:** `slack`  
**Tool:** `list_channels`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:12.177Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "slack",
  "tool": "list_channels",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "ok": true,
    "channels": [
      {
        "id": "C09F5HJ6P5Y",
        "created": 1757875524,
        "creator": "U09F5HJ1R50",
        "is_org_shared": false,
        "is_im": false,
        "context_team_id": "T09F5HJ1QKU",
        "updated": 1763294123567,
        "name": "how-to-use-aistaff",
        "name_normalized": "how-to-use-aistaff",
        "is_channel": true,
        "is_group": false,
        "is_mpim": false,
        "is_private": false,
        "is_archived": false,
        "is_general": true,
        "is_shared": false,
        "is_ext_shared": false,
        "unlinked": 0,
        "is_pending_ext_shared": false,
        "pending_shared": [],
        "parent_conversation": null,
        "purpose": {
          "value": "Share announcements and updates about company news, upcoming events, or teammates who deserve some kudos. ⭐",
          "creator": "U09F5HJ1R50",
          "last_set": 1757875524
        },
        "topic": {
          "value": "",
          "creator": "",
          "last_set": 0
        },
        "shared_team_ids": [
          "T09F5HJ1QKU"
        ],
        "pending_connected_team_ids": [],
        "is_member": false,
        "num_members": 1,
        "properties": {
          "meeting_notes": {
            "file_id": "F09FNAX4DGV"
          },
          "tabs": [
            {
              "id": "Ct09G4L56PJM",
              "type": "canvas",
              "data": {
                "file_id": "F09FNAX4DGV",
                "shared_ts": "1758123531.851299"
              },
              "label": ""
            },
            {
              "id": "Ct09FVEVTJTW",
              "type": "canvas",
              "data": {
                "file_id": "F09G4M4B7K3",
                "shared_ts": "1758123815.602679"
              },
              "label": ""
            },
            {
              "id": "Ct09FQV5HHF0",
              "type": "canvas",
              "data": {
                "file_
... (truncated)
```


---

### ✅ Notion - Search

**Server:** `notion`  
**Tool:** `search`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:12.308Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "notion",
  "tool": "search",
  "arguments": {
    "query": "test"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "object": "list",
    "results": [],
    "next_cursor": null,
    "has_more": false,
    "type": "page_or_database",
    "page_or_database": {},
    "request_id": "55f211f5-9608-4ebe-bc18-b2baf966938f"
  },
  "metadata": {
    "server": "notion",
    "tool": "search",
    "executionTime": 310
  }
}
```


---

### ❌ Google Calendar - List calendars

**Server:** `google-calendar`  
**Tool:** `list_calendars`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:12.622Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "google-calendar",
  "tool": "list_calendars",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "Google Calendar not configured. Please add your OAuth tokens (access_token, refresh_token, client_id, client_secret) in Capabilities settings.",
  "metadata": {
    "server": "google-calendar",
    "tool": "list_calendars",
    "executionTime": 0
  }
}
```

**Error:** Google Calendar not configured. Please add your OAuth tokens (access_token, refresh_token, client_id, client_secret) in Capabilities settings.

---

### ❌ Gmail - List labels

**Server:** `gmail`  
**Tool:** `list_labels`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:12.625Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "gmail",
  "tool": "list_labels",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "Gmail not configured. Add OAuth tokens in Capabilities settings.",
  "metadata": {
    "server": "gmail",
    "tool": "list_labels",
    "executionTime": 0
  }
}
```

**Error:** Gmail not configured. Add OAuth tokens in Capabilities settings.

---

### ❌ Google Sheets - List sheets

**Server:** `google-sheets`  
**Tool:** `list_sheets`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:12.629Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "google-sheets",
  "tool": "list_sheets",
  "arguments": {
    "spreadsheetId": "test"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "Google Sheets not configured. Add OAuth tokens in Capabilities settings.",
  "metadata": {
    "server": "google-sheets",
    "tool": "list_sheets",
    "executionTime": 0
  }
}
```

**Error:** Google Sheets not configured. Add OAuth tokens in Capabilities settings.

---

### ❌ Google Docs - Get doc

**Server:** `google-docs`  
**Tool:** `get_document`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:12.633Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "google-docs",
  "tool": "get_document",
  "arguments": {
    "documentId": "test"
  }
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "Google API error 401",
  "metadata": {
    "server": "google-docs",
    "tool": "get_document",
    "executionTime": 97
  }
}
```

**Error:** Google API error 401

---

### ❌ QuickBooks - Company info

**Server:** `quickbooks`  
**Tool:** `get_company_info`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:12.733Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "quickbooks",
  "tool": "get_company_info",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "QuickBooks not configured. Please add your OAuth tokens (access_token, refresh_token, realm_id, client_id, client_secret) in Capabilities settings.",
  "metadata": {
    "server": "quickbooks",
    "tool": "get_company_info",
    "executionTime": 0
  }
}
```

**Error:** QuickBooks not configured. Please add your OAuth tokens (access_token, refresh_token, realm_id, client_id, client_secret) in Capabilities settings.

---

### ❌ Plaid - Get accounts

**Server:** `plaid`  
**Tool:** `get_accounts`  
**Result:** FAIL  
**Timestamp:** 2026-02-05T19:31:12.737Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "plaid",
  "tool": "get_accounts",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": false,
  "error": "Plaid not configured. Add client_id, secret, and access_token in Capabilities settings.",
  "metadata": {
    "server": "plaid",
    "tool": "get_accounts",
    "executionTime": 1
  }
}
```

**Error:** Plaid not configured. Add client_id, secret, and access_token in Capabilities settings.

---

### ✅ AnyAPI - List APIs

**Server:** `anyapi`  
**Tool:** `list_available_apis`  
**Result:** PASS  
**Timestamp:** 2026-02-05T19:31:12.740Z

#### Request Sent
```json
POST http://localhost:4501/api/admin/mcp/execute
{
  "server": "anyapi",
  "tool": "list_available_apis",
  "arguments": {}
}
```

#### Response Received
```json
HTTP 200 OK
{
  "success": true,
  "data": {
    "total": 4,
    "authenticated": 1,
    "public": 3,
    "apis": [
      {
        "id": "coingecko",
        "name": "CoinGecko",
        "description": "Free cryptocurrency data API - prices, market data, exchanges, and more",
        "requiresAuth": false,
        "baseUrl": "https://api.coingecko.com/api/v3",
        "endpointCount": 7,
        "endpoints": [
          {
            "name": "ping",
            "method": "GET",
            "path": "/ping",
            "description": "Check API server status"
          },
          {
            "name": "simple_price",
            "method": "GET",
            "path": "/simple/price",
            "description": "Get current price of any cryptocurrencies in any other supported currencies"
          },
          {
            "name": "coins_list",
            "method": "GET",
            "path": "/coins/list",
            "description": "List all supported coins with id, name, and symbol"
          },
          {
            "name": "coin_data",
            "method": "GET",
            "path": "/coins/{id}",
            "description": "Get detailed data for a specific coin"
          },
          {
            "name": "coin_market_chart",
            "method": "GET",
            "path": "/coins/{id}/market_chart",
            "description": "Get historical market data (price, market cap, volume) for a coin"
          },
          {
            "name": "trending",
            "method": "GET",
            "path": "/search/trending",
            "description": "Get top 7 trending coins based on search volume in the last 24 hours"
          },
          {
            "name": "global",
            "method": "GET",
            "path": "/global",
            "description": "Get cryptocurrency global market data"
          }
        ],
        "rateLimit": {
          "requestsPerMinute": 10
        }
      },
      {
        "id": "openweather",
        "name": "OpenWeatherMap",
        
... (truncated)
```


---

