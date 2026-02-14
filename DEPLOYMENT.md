# ExpertAgent — Deployment Guide

## Environments

| Environment | Branch | URL | Database |
|-------------|--------|-----|----------|
| **Production** | `main` | https://expert-agent-production.up.railway.app | pgvector (prod) |
| **Dev** | `main_dev` | https://expert-agent-dev.up.railway.app | pgvector (dev) |

Both environments auto-deploy on push to their respective branches.

## Development Workflow

```
main_dev (develop here)  →  test on dev URL  →  merge to main  →  production
```

1. **Develop** — All changes go to `main_dev` first
2. **Test** — Verify at `https://expert-agent-dev.up.railway.app`
3. **Promote** — When ready:
   ```bash
   git checkout main
   git merge main_dev
   git push origin main
   ```
4. **Production deploys automatically** from `main`

## Branch Overview

| Branch | Purpose | Deploys? |
|--------|---------|----------|
| `main` | Production code | Yes → Railway production |
| `main_dev` | Development/testing | Yes → Railway dev |
| `main_withLocalApp` | Desktop Electron app (local only) | No |
| `main_backup_before_merge` | Safety backup pre-merge (Feb 14, 2026) | No |

## Railway Project

- **Project:** Expert Agent
- **Hosting:** [Railway](https://railway.app)
- **Builder:** Dockerfile (multi-stage: web build → server build → production image)
- **Health check:** `GET /health`
- **Port:** 4000

## Running Locally

```bash
# Server (port 4000 or PORT from .env)
cd server && npm install && npm run dev

# Web admin (port 5173)
cd web && npm install && npm run dev
```

## Environment Variables

Both environments share the same API keys. Key differences:

| Variable | Production | Dev |
|----------|-----------|-----|
| `DATABASE_URL` | Prod pgvector instance | Dev pgvector instance |
| `BASE_URL` | `https://expert-agent-production.up.railway.app` | `https://expert-agent-dev.up.railway.app` |
| `CORS_ORIGINS` | Production + frexplorer domains | Dev + localhost |
| `RAILWAY_ENVIRONMENT_NAME` | `production` | `dev` |

All feature flags are identical across environments:
- `FEATURE_MULTI_AGENT`, `FEATURE_SOUL_MEMORY`, `FEATURE_MCP_HUB`
- `FEATURE_DEEP_TOOLS`, `FEATURE_PROACTIVE`, `FEATURE_MULTIMODAL`
- `FEATURE_MULTI_CHANNEL`, `FEATURE_BACKGROUND_AGENTS`, `FEATURE_CUSTOM_BRANDING`
