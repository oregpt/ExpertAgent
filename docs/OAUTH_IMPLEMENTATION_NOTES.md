# OAuth Implementation Notes for Agent-in-a-Box v2

## Current State (as of credential fixes)

The current implementation asks users to manually enter OAuth tokens (Access Token, Refresh Token, Client ID, Client Secret) for services like Google and QuickBooks. This is a poor user experience and security concern.

## What Needs to be Implemented

### 1. QuickBooks Online OAuth

**Reference:** `agenticledger-prod/server/routes/appentOAuth.ts`

**How it works in production:**
- Platform hosts `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` in environment variables
- User clicks "Connect QuickBooks" button
- Backend generates OAuth URL with HMAC-signed state
- User is redirected to Intuit's OAuth consent screen
- After consent, callback receives authorization code
- Backend exchanges code for tokens using `QBOAuthService`
- Tokens are encrypted and stored with GCP KMS

**Implementation needed for agentinabox_v2:**
1. Create QuickBooks OAuth routes:
   - `GET /api/oauth/qbo/start` - Generate auth URL
   - `GET /api/oauth/qbo/callback` - Handle OAuth callback
2. Create `QBOAuthService` (or copy from prod)
3. Store `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` in platform env (not per-user)
4. Update UI to show "Connect QuickBooks" button instead of token fields

### 2. Google OAuth (Gmail, Calendar, Sheets, Docs)

**Reference:** `agenticledger-prod/server/services/googleOAuth.ts`

**How it works in production:**
- Platform hosts Google Cloud OAuth credentials
- Uses `google-auth-library` for OAuth2 flow
- Scopes requested:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/gmail.labels`
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/calendar.events`
- Automatic token refresh using refresh tokens
- Tokens stored with encryption

**Implementation needed for agentinabox_v2:**
1. Create Google OAuth routes:
   - `GET /api/oauth/google/start` - Generate auth URL with scopes
   - `GET /api/oauth/google/callback` - Handle OAuth callback
2. Create `GoogleOAuthService` (or copy from prod)
3. Store Google OAuth credentials in platform env:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
4. Update UI to show "Connect Google Account" button
5. Handle token refresh automatically in MCP servers

### 3. Plaid (Bank Connections)

**Reference:** `agenticledger-prod/server/routes/appentOAuth.ts`

**How it works in production:**
- Uses Plaid Link widget (embedded JavaScript)
- Platform hosts `PLAID_CLIENT_ID` and `PLAID_SECRET`
- Flow:
  1. Backend creates `link_token` via Plaid API
  2. Frontend opens Plaid Link with the token
  3. User selects their bank and authenticates
  4. Plaid Link returns `public_token`
  5. Backend exchanges `public_token` for `access_token`
  6. Access token stored encrypted

**Implementation needed for agentinabox_v2:**
1. Create Plaid Link routes:
   - `POST /api/plaid/link-token` - Create link token
   - `POST /api/plaid/exchange` - Exchange public token
2. Add Plaid Link SDK to frontend
3. Store Plaid credentials in platform env

## Security Considerations

### State Parameter Signing
Production uses HMAC-signed state to prevent CSRF and cross-tenant token injection:
```typescript
function signOAuthState(data: object): string {
  const secret = process.env.SESSION_SECRET;
  const payload = { ...data, timestamp: Date.now(), nonce: crypto.randomBytes(16).toString('hex') };
  const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}
```

### Token Encryption
Production uses GCP KMS for credential encryption. For agentinabox_v2, the existing AES-256-GCM encryption in `capabilityService.ts` should be sufficient for local deployments.

## Environment Variables Needed

```env
# QuickBooks
QBO_CLIENT_ID=your_qbo_client_id
QBO_CLIENT_SECRET=your_qbo_client_secret

# Google
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Plaid (optional)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENVIRONMENT=sandbox|production

# Session secret for state signing
SESSION_SECRET=random_32_byte_secret
```

## UI Changes Needed

Instead of showing token input fields for OAuth-based services, show:
1. "Connect [Service]" button if not connected
2. "Connected as [email]" with "Disconnect" button if connected
3. Handle OAuth popup flow
4. Listen for `postMessage` events from OAuth callback

## Token Field Mapping Reference

### Wallet Balance (Updated)
- `token1` → `etherscan_v2` (for 34+ EVM chains via unified API)
- `token2` → `blockfrost_cardano` (for Cardano)
- `token3` → `ftmscan` (for Fantom)

### QuickBooks (Current - should become OAuth)
- `token1` → Access Token
- `token2` → Refresh Token
- `token3` → Realm ID (Company ID)
- `token4` → Client ID
- `token5` → Client Secret

### Google Services (Current - should become OAuth)
- `token1` → Access Token
- `token2` → Refresh Token
- `token3` → Client ID
- `token4` → Client Secret

## Priority

1. **High**: Google OAuth - Most commonly used, affects Gmail, Calendar, Sheets, Docs
2. **High**: QuickBooks OAuth - Critical for accounting workflows
3. **Medium**: Plaid - For bank connections, uses embedded widget (easier UX)

## Files to Create/Modify

### New Files:
- `server/src/oauth/googleOAuth.ts` - Google OAuth service
- `server/src/oauth/qboOAuth.ts` - QuickBooks OAuth service
- `server/src/routes/oauth.ts` - OAuth routes

### Modify:
- `server/src/capabilities/capabilityService.ts` - Add OAuth token storage methods
- `client/src/components/CapabilitySettings.tsx` - Add OAuth connect buttons
- `server/src/index.ts` - Register OAuth routes

## Notes

The platform should own the OAuth app credentials (Client ID/Secret), not individual users. Users should only need to click "Connect" and authorize access - they should never see or handle tokens directly.
