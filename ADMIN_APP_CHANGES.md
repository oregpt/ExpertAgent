# Admin App v2 Feature Flags — Changes Made

**Date:** 2025-07-11
**Author:** Automated update (subagent)
**Scope:** Add 5 missing v2 feature flags to the Platform Admin app

---

## Summary

Added the following 5 v2 feature flags to **all 7 files** in the admin app:

| Flag | Type | Description |
|------|------|-------------|
| `soulMemory` | boolean | Soul & Memory system — self-evolving agent personality |
| `deepTools` | boolean | Web search, web fetch, real-world tools |
| `proactive` | boolean | Heartbeats, cron jobs, proactive behavior |
| `backgroundAgents` | boolean | Sub-agent spawning for fire-and-forget tasks |
| `multiChannel` | boolean | Slack, Teams, webhooks — beyond widget |

All 5 flags default to `false` (matching v2 `BASE_FEATURES`). Backward compatible with v1 — v1 servers will simply ignore the new fields in the JWT payload.

---

## Files Modified

### 1. `lib/db/schema.ts`
- **LicenseFeatures interface**: Added 5 new boolean fields with `// v2 additions:` comment
- **Table comment**: Updated `tierTemplates` table comment to list all 12 feature flags
- Interface now has 12 fields total (was 7)

### 2. `lib/license.ts`
- **BASE_FEATURES**: Added 5 flags, all `false`
- **FULL_FEATURES**: Added 5 flags, all `true`
- **DEFAULT_TIER_TEMPLATES**: Updated all 4 tiers:
  - **base** (kept for backward compat): All 5 new flags = `false`
  - **starter**: Aligned with v2 TIER_PRESETS — `multimodal: true`, `mcpHub: true`, `allowedCapabilities: ['*']`, all 5 new flags = `false`
  - **pro**: Aligned with v2 — `gitlabKbSync: true`, `allowedCapabilities: ['*']`, `soulMemory: true`, `deepTools: true`, `multiChannel: true`, `proactive: false`, `backgroundAgents: false`
  - **enterprise**: All 5 new flags = `true`
- Updated tier descriptions to match v2

### 3. `components/TierTemplatesManager.tsx`
- **defaultFeatures constant**: Added 5 new flags as `false`
- **FeatureEditor component**: Added 5 new toggle checkboxes (Soul & Memory, Deep Tools, Proactive Engine, Background Agents, Multi-Channel)
- **Template card badges**: Added 5 color-coded display badges:
  - Soul & Memory → purple
  - Deep Tools → teal
  - Proactive Engine → amber
  - Background Agents → indigo
  - Multi-Channel → emerald

### 4. `app/api/tier-templates/route.ts`
- **POST handler**: Added 5 flags to feature construction with `?? false` defaults

### 5. `app/api/tier-templates/[id]/route.ts`
- **PUT handler**: Added 5 flags to feature merge logic with `?? existingFeatures.X ?? false` (double fallback handles pre-v2 templates in DB that lack these fields)

### 6. `app/api/customers/[id]/license/route.ts`
- **POST handler**: Added 5 flags to custom feature construction with `?? false` defaults

### 7. `app/licensing/page.tsx`
- **Feature preview section**: Added 5 color-coded badges matching the TierTemplatesManager color scheme

---

## Tier Preset Alignment with v2

| Flag | base | starter | pro | enterprise | v2 starter | v2 pro | v2 enterprise |
|------|------|---------|-----|------------|------------|--------|---------------|
| multiAgent | false | false | true | true | false | true | true |
| maxAgents | 1 | 1 | 5 | 100 | 1 | 5 | 100 |
| multimodal | false | **true** | true | true | true | true | true |
| mcpHub | false | **true** | true | true | true | true | true |
| allowedCapabilities | [] | **['*']** | **['*']** | ['*'] | ['*'] | ['*'] | ['*'] |
| customBranding | false | false | true | true | false | true | true |
| gitlabKbSync | false | false | **true** | true | false | true | true |
| soulMemory | false | false | **true** | **true** | false | true | true |
| deepTools | false | false | **true** | **true** | false | true | true |
| proactive | false | false | false | **true** | false | false | true |
| backgroundAgents | false | false | false | **true** | false | false | true |
| multiChannel | false | false | **true** | **true** | false | true | true |

✅ starter, pro, and enterprise now match v2 `TIER_PRESETS` exactly.

---

## Backward Compatibility

- **v1 servers**: Will ignore the 5 new fields in the JWT payload (unknown fields are harmless in JSON)
- **Existing DB templates**: The PUT route uses `?? existingFeatures.X ?? false` double fallback, so templates created before this update (missing the 5 fields) will safely default to `false`
- **base tier**: Kept in admin app for existing customers even though v2 only defines starter/pro/enterprise

---

## What's NOT Changed (noted for future)

Per the review document, these items were identified but **not addressed** in this update:
- Customer detail page (`app/customers/[id]/page.tsx`) stale `licenseTierFeatures` mapping (D6)
- Auth cookie security (D10)
- License decode UI (D11)
- License secret DB vs ENV inconsistency (D12)
- Package name rename (D13)
- Temp directory cleanup (D14)
- Component decomposition (D15)
- License validation endpoint (D16)
