# Agent-in-a-Box Self-Hosted Deployment Guide

Welcome! You've received access to Agent-in-a-Box. This guide walks you through deploying it on your infrastructure and embedding the chat widget on your website.

---

## What You've Received

From AgenticLedger:
- **Repository access**: https://github.com/oregpt/agenticledger_agentinabox
- **License key**: Sent separately
- **License secret**: Sent separately

---

## Tech Stack

Agent-in-a-Box is built with:

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js 20+, Express, TypeScript |
| **Frontend** | React 18, Vite, TypeScript |
| **Database** | PostgreSQL 15+ with pgvector extension |
| **Embeddings** | OpenAI text-embedding-3-small |
| **LLM** | Claude (Anthropic), GPT (OpenAI), Grok (xAI), Gemini (Google) |
| **Build** | Docker (production), npm (development) |

---

## Prerequisites

You'll need:
- [ ] A server or hosting platform (VPS, cloud instance, container platform, etc.)
- [ ] PostgreSQL 15+ database with **pgvector extension** installed
- [ ] Node.js 20+ (if not using Docker)
- [ ] An Anthropic API key (https://console.anthropic.com)
- [ ] An OpenAI API key (https://platform.openai.com) - required for embeddings

### Database Options

Your PostgreSQL database must have the **pgvector** extension. Options include:

| Provider | pgvector Included | Notes |
|----------|-------------------|-------|
| Neon | ✓ Yes | Free tier available, recommended for getting started |
| Supabase | ✓ Yes | Free tier available |
| AWS RDS | Manual install | Requires enabling extension |
| Self-hosted Postgres | Manual install | `CREATE EXTENSION vector;` |
| Railway Postgres | ✗ No | Not supported |

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/oregpt/agenticledger_agentinabox.git
cd agenticledger_agentinabox
```

---

## Step 2: Set Up Your Database

You need a PostgreSQL database with pgvector enabled.

### Option A: Managed Database (Recommended)

1. Create an account at https://neon.tech or https://supabase.com
2. Create a new project/database
3. Copy your connection string:
   ```
   postgresql://user:password@host:5432/database?sslmode=require
   ```

### Option B: Self-Hosted PostgreSQL

1. Install PostgreSQL 15+
2. Install pgvector extension:
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql-15-pgvector

   # Or compile from source
   git clone https://github.com/pgvector/pgvector.git
   cd pgvector && make && sudo make install
   ```
3. Enable in your database:
   ```sql
   CREATE EXTENSION vector;
   ```

---

## Step 3: Configure Environment Variables

Create your environment configuration. These variables are required:

### Required Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `PORT` | Server port (default: 4000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `OPENAI_API_KEY` | Your OpenAI API key (for embeddings) |
| `LICENSE_SECRET` | Provided by AgenticLedger |
| `AGENTICLEDGER_LICENSE_KEY` | Provided by AgenticLedger |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `XAI_API_KEY` | For Grok models |
| `GEMINI_API_KEY` | For Gemini models |
| `DEFAULT_MODEL` | Default LLM (default: `claude-sonnet-4-20250514`) |

---

## Step 4: Deploy the Application

### Option A: Docker (Recommended for Production)

```bash
# Build the image
docker build -t agentinabox .

# Run the container
docker run -d \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="your-connection-string" \
  -e ANTHROPIC_API_KEY="your-key" \
  -e OPENAI_API_KEY="your-key" \
  -e LICENSE_SECRET="provided-by-agenticledger" \
  -e AGENTICLEDGER_LICENSE_KEY="provided-by-agenticledger" \
  agentinabox
```

### Option B: Node.js Direct

```bash
# Install dependencies
cd server && npm ci --production
cd ../web && npm ci && npm run build

# Copy built frontend to server
cp -r web/dist server/public

# Start the server
cd server
NODE_ENV=production node dist/index.js
```

### Option C: Container Platforms

The included `Dockerfile` works with:
- Docker Compose
- Kubernetes
- AWS ECS/Fargate
- Google Cloud Run
- Azure Container Apps
- Railway, Render, Fly.io, etc.

### Option D: Kubernetes with Helm (Enterprise)

For Kubernetes deployments, we provide a Helm chart in the `helm/agentinabox/` directory.

#### Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- kubectl configured for your cluster
- PostgreSQL database with pgvector (external or managed)

#### Quick Start

**1. Build and push your Docker image:**

```bash
# Build the image
docker build -t your-registry.com/agentinabox:1.0.0 .

# Push to your container registry
docker push your-registry.com/agentinabox:1.0.0
```

**2. Create a values file (`my-values.yaml`):**

```yaml
image:
  repository: your-registry.com/agentinabox
  tag: "1.0.0"

secrets:
  databaseUrl: "postgresql://user:password@your-db-host:5432/agentinabox?sslmode=require"
  anthropicApiKey: "sk-ant-api03-..."
  openaiApiKey: "sk-proj-..."
  licenseSecret: "provided-by-agenticledger"
  licenseKey: "provided-by-agenticledger"

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: agentinabox.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: agentinabox-tls
      hosts:
        - agentinabox.yourdomain.com
```

**3. Install the Helm chart:**

```bash
# Install
helm install agentinabox ./helm/agentinabox -f my-values.yaml

# Or with inline values (for testing)
helm install agentinabox ./helm/agentinabox \
  --set image.repository=your-registry.com/agentinabox \
  --set image.tag=1.0.0 \
  --set secrets.databaseUrl="postgresql://..." \
  --set secrets.anthropicApiKey="sk-ant-..." \
  --set secrets.openaiApiKey="sk-proj-..." \
  --set secrets.licenseSecret="your-secret" \
  --set secrets.licenseKey="your-jwt-token"
```

**4. Verify deployment:**

```bash
# Check pods
kubectl get pods -l app.kubernetes.io/name=agentinabox

# Check service
kubectl get svc agentinabox

# View logs
kubectl logs -l app.kubernetes.io/name=agentinabox
```

#### Helm Chart Features

| Feature | Description |
|---------|-------------|
| **ConfigMap** | Non-sensitive config (NODE_ENV, PORT, feature flags) |
| **Secret** | API keys and credentials (or use `existingSecret`) |
| **Deployment** | Main application with health checks |
| **Service** | ClusterIP service on port 4000 |
| **Ingress** | Optional ingress with TLS support |
| **PVC** | Persistent storage for uploads (5Gi default) |
| **HPA** | Optional horizontal pod autoscaler |

#### Production Configuration

For production, use the included `values-production.yaml` as a starting point:

```bash
# Copy and customize
cp helm/agentinabox/values-production.yaml my-production-values.yaml
# Edit my-production-values.yaml with your values

# Deploy
helm install agentinabox ./helm/agentinabox -f my-production-values.yaml
```

Production defaults include:
- 2 replicas with pod anti-affinity
- Autoscaling enabled (2-10 pods)
- Higher resource limits
- Ingress with TLS

#### Using External Secret Management

For production, we recommend using external secret management:

```yaml
# Create secret manually or via External Secrets Operator
kubectl create secret generic agentinabox-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..." \
  --from-literal=OPENAI_API_KEY="sk-proj-..." \
  --from-literal=LICENSE_SECRET="..." \
  --from-literal=AGENTICLEDGER_LICENSE_KEY="..."

# Reference in values.yaml
existingSecret: "agentinabox-secrets"
```

#### Upgrading

```bash
helm upgrade agentinabox ./helm/agentinabox -f my-values.yaml
```

#### Uninstalling

```bash
helm uninstall agentinabox

# Optional: delete PVC (WARNING: deletes uploaded files)
kubectl delete pvc agentinabox-uploads
```

See `helm/agentinabox/README.md` for full documentation.

---

## Step 5: Verify Deployment

Once running, verify your deployment:

1. **Health check**:
   ```bash
   curl https://your-server.com/health
   # Should return: {"status":"ok","service":"agentinabox-server"}
   ```

2. **Admin dashboard**: Visit `https://your-server.com` in your browser

---

## Step 6: Create Your Agent

1. Open the admin dashboard
2. Click **Create Agent** (or configure the default agent)
3. Configure:
   - **Name**: What users see (e.g., "Support Assistant")
   - **Instructions**: System prompt for the AI
   - **Model**: Choose your LLM
4. Click **Save**
5. **Copy your Agent ID** - you'll need this for the embed code

---

## Step 7: Upload Knowledge Base (Optional)

Give your agent context about your business:

1. Go to **Knowledge Base**
2. Click **Upload**
3. Add documents (PDF, TXT, MD, DOCX supported)
4. Documents are automatically chunked and embedded for retrieval

---

## Step 8: Customize Branding

1. Go to **Agent Settings → Branding**
2. Upload your logo
3. Set your brand color (hex code like `#3b82f6`)
4. Customize the welcome message
5. Save

---

## Step 9: Embed the Widget

Add this code to your website, just before the closing `</body>` tag:

```html
<!-- Agent-in-a-Box Widget -->
<script src="https://YOUR-SERVER-URL/widget.js"></script>
<script>
  AgentWidget.init({
    agentId: 'YOUR-AGENT-ID',
    apiBaseUrl: 'https://YOUR-SERVER-URL'
  });
</script>
```

Replace:
- `YOUR-SERVER-URL` with your deployed server URL
- `YOUR-AGENT-ID` with the Agent ID from Step 6

### Widget Customization Options

```javascript
AgentWidget.init({
  // Required
  agentId: 'your-agent-id',
  apiBaseUrl: 'https://your-server.com',

  // Optional customization
  position: 'bottom-right',        // or 'bottom-left'
  primaryColor: '#3b82f6',         // hex color for button/header
  title: 'Chat with us',           // header text
  placeholder: 'Type your message...',
  welcomeMessage: 'Hello! How can I help you today?'
});
```

### Widget API

The widget exposes methods for programmatic control:

```javascript
// Open the chat panel
AgentWidget.open();

// Close the chat panel
AgentWidget.close();

// Remove the widget entirely
AgentWidget.destroy();
```

---

## Step 10: Test Everything

1. Visit your website
2. You should see a chat bubble in the bottom-right corner
3. Click it and send a test message
4. Verify the agent responds correctly
5. If you uploaded a knowledge base, ask a question about that content

---

## Project Structure

```
agenticledger_agentinabox/
├── server/                 # Backend (Node.js/Express)
│   ├── src/
│   │   ├── http/           # API routes
│   │   ├── db/             # Database schema (Drizzle ORM)
│   │   ├── kb/             # Knowledge base & embeddings
│   │   ├── chat/           # Chat & streaming
│   │   ├── licensing/      # License validation
│   │   └── mcp-hub/        # MCP capabilities
│   └── package.json
├── web/                    # Frontend (React/Vite)
│   ├── src/
│   │   ├── AgentChatWidget.tsx   # Embeddable widget
│   │   ├── App.tsx               # Admin dashboard
│   │   └── ...
│   └── package.json
├── helm/                   # Kubernetes Helm chart
│   └── agentinabox/
│       ├── Chart.yaml      # Chart metadata
│       ├── values.yaml     # Default values
│       ├── values-production.yaml  # Production example
│       └── templates/      # K8s manifests
├── Dockerfile              # Production build
└── docker-compose.yml      # Local development
```

---

## Local Development

```bash
# Terminal 1: Backend
cd server
npm install
npm run dev
# → http://localhost:4000

# Terminal 2: Frontend
cd web
npm install
npm run dev
# → http://localhost:5173
```

Create `server/.env` for local development:
```env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...

# Feature flags work in dev mode only
FEATURE_MULTI_AGENT=true
FEATURE_MULTIMODAL=true
FEATURE_MCP_HUB=true
FEATURE_CUSTOM_BRANDING=true
```

---

## Troubleshooting

### "pgvector extension not available"
- Your PostgreSQL needs pgvector installed
- Use Neon or Supabase (includes pgvector)
- Or install pgvector manually on self-hosted Postgres

### "License not valid" error
- Verify `LICENSE_SECRET` and `AGENTICLEDGER_LICENSE_KEY` are set correctly
- Check for extra whitespace or newlines
- Contact AgenticLedger if your key has expired

### Widget doesn't appear
- Check browser console (F12) for JavaScript errors
- Verify the script URL is accessible
- Ensure the embed code is before `</body>`

### Agent doesn't respond
- Check server logs for errors
- Verify your Anthropic API key is valid and has credits
- Test the `/health` endpoint

### CORS errors
- Server allows all origins by default
- If behind a proxy, ensure headers are forwarded correctly

---

## Security Considerations

- **API Keys**: Never expose API keys in client-side code
- **License Key**: Keep your license key secure
- **Database**: Use SSL connections (`sslmode=require`)
- **HTTPS**: Always deploy behind HTTPS in production
- **Firewall**: Restrict database access to your server only

---

## Support

Need help?
- Email: support@agenticledger.com

---

## License Tiers

| Feature | Starter | Pro | Enterprise |
|---------|---------|-----|------------|
| Agents | 1 | 5 | 100 |
| Multimodal (attachments) | ✓ | ✓ | ✓ |
| Knowledge Base | ✓ | ✓ | ✓ |
| Custom Branding | - | ✓ | ✓ |
| MCP Capabilities | - | ✓ | ✓ |
| Priority Support | - | - | ✓ |

Contact AgenticLedger to upgrade your license.
