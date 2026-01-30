# CC Explorer MCP Server - Test Results

**Test Date:** 2026-01-26  
**API Key:** ebc7db027c... (redacted)  
**Test Environment:** Node.js v22.17.1, Windows 10

---

## Summary

| Metric | Value |
|--------|-------|
| **Tools Tested** | 14 |
| **Passed** | 14 ✅ |
| **Failed** | 0 ❌ |
| **Pass Rate** | 100.0% |
| **Average Response Time** | 132ms |

---

## Test Results by Tool

### ✅ Network Overview (3/3 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `consensus_get` | ✅ Pass | 94ms | Consensus block returned |
| `round_current` | ✅ Pass | 116ms | Round 80824 |
| `overview_get` | ✅ Pass | 91ms | Network stats returned |

### ✅ Governance (2/2 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `governance_list` | ✅ Pass | 176ms | 11 open votes returned |
| `governance_get` | ✅ Pass | 96ms | Vote details returned |

### ✅ Validators (2/2 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `super_validators_list` | ✅ Pass | 100ms | 13 super validators |
| `validators_list` | ✅ Pass | 232ms | Validator list returned |

### ✅ Parties (2/2 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `party_get` | ✅ Pass | 97ms | Cumberland-1 details |
| `party_updates_list` | ✅ Pass | 122ms | 2 updates returned |

### ✅ Contracts (2/2 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `contract_get` | ✅ Pass | 115ms | Contract details |
| `contract_updates_list` | ✅ Pass | 133ms | 1 update returned |

### ✅ Ledger Updates (2/2 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `updates_list` | ✅ Pass | 104ms | 2 updates returned |
| `update_get` | ✅ Pass | 182ms | Update details |

### ✅ Search (1/1 passed)

| Tool | Status | Time | Response |
|------|--------|------|----------|
| `search` | ✅ Pass | 196ms | Cumberland results |

---

## Super Validators (from API)

| Super Validator | Reward Weight | Joined Round |
|-----------------|---------------|--------------|
| C7-Technology-Services-Limited | 105,750 | 28,175 |
| Cumberland-1 | 136,125 | 0 |
| Cumberland-2 | 136,125 | 0 |
| Digital-Asset-1 | 159,250 | 68,076 |
| Digital-Asset-2 | 159,250 | 0 |
| Five-North-1 | 30,500 | 41,105 |
| Global-Synchronizer-Foundation | 1,655,000 | 0 |
| Liberty-City-Ventures-1 | 100,000 | 41,109 |
| MPC-Holding-Inc | 100,000 | 9,932 |
| Orb-1-LP-1 | 100,000 | 17,614 |
| Proof-Group-1 | 12,500 | 41,105 |
| SV-Nodeops-Limited | 102,500 | 0 |
| Tradeweb-Markets-1 | 100,000 | 21,394 |

---

## Running the Tests

```bash
# Install dependencies
npm install

# Set API key
export CCEXPLORER_API_KEY=your_key_here

# Run test suite
npm test
```

---

## Sample Test IDs Used

| Type | Sample ID |
|------|-----------|
| Party ID | `Cumberland-1::12201aa8a23046d5740c9edd58f7e820c83e7f5c58f25551f955f3252d3a04240860` |
| Update ID | `1220d52754854617c264f20ceccef23a8cb14ce9...` |
| Contract ID | `004b15e89417024ccaeec798e7625fdea4b802bd...` |
| Tracking CID | `0046ac9a6cba4d5091b412d8dc2619da264f6e83...` |

---

## Conclusion

✅ **ALL 14 MCP TOOLS TESTED AND WORKING**

The CC Explorer MCP Server has been tested against the live pro.ccexplorer.io API with a **100% pass rate**. All tools return valid data and are ready for production use.

Average response time is excellent at 132ms.
