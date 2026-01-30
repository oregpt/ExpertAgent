# Agent-in-a-Box Helm Chart

This Helm chart deploys Agent-in-a-Box, an AI Agent Platform with Knowledge Base and Chat Widget capabilities.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PostgreSQL 15+ with pgvector extension (external or subchart)
- PV provisioner support in the underlying infrastructure (for uploads persistence)

## Installing the Chart

### 1. Build and Push Docker Image

First, build your Docker image and push to a registry accessible by your cluster:

```bash
# Build the image
docker build -t your-registry/agentinabox:1.0.0 .

# Push to registry
docker push your-registry/agentinabox:1.0.0
```

### 2. Create a values file

Create a `my-values.yaml` file with your configuration:

```yaml
image:
  repository: your-registry/agentinabox
  tag: "1.0.0"

secrets:
  databaseUrl: "postgresql://user:password@your-db-host:5432/agentinabox?sslmode=require"
  anthropicApiKey: "sk-ant-api03-..."
  openaiApiKey: "sk-proj-..."
  licenseSecret: "your-license-secret"
  licenseKey: "your-jwt-license-key"

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

### 3. Install the chart

```bash
# Add to your cluster
helm install agentinabox ./helm/agentinabox -f my-values.yaml

# Or with inline values
helm install agentinabox ./helm/agentinabox \
  --set image.repository=your-registry/agentinabox \
  --set image.tag=1.0.0 \
  --set secrets.databaseUrl="postgresql://..." \
  --set secrets.anthropicApiKey="sk-ant-..." \
  --set secrets.openaiApiKey="sk-proj-..." \
  --set secrets.licenseSecret="your-secret" \
  --set secrets.licenseKey="your-jwt-token"
```

## Upgrading the Chart

```bash
helm upgrade agentinabox ./helm/agentinabox -f my-values.yaml
```

## Uninstalling the Chart

```bash
helm uninstall agentinabox
```

**Note:** This will not delete the PersistentVolumeClaim for uploads. To delete it:

```bash
kubectl delete pvc agentinabox-uploads
```

## Configuration

### Required Values

| Parameter | Description |
|-----------|-------------|
| `secrets.databaseUrl` | PostgreSQL connection string with pgvector |
| `secrets.anthropicApiKey` | Anthropic API key for Claude |
| `secrets.openaiApiKey` | OpenAI API key for embeddings |
| `secrets.licenseSecret` | License validation secret |
| `secrets.licenseKey` | JWT license key |

### Key Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `1` |
| `image.repository` | Docker image repository | `agentinabox` |
| `image.tag` | Docker image tag | `""` (uses appVersion) |
| `service.type` | Kubernetes service type | `ClusterIP` |
| `service.port` | Service port | `4000` |
| `ingress.enabled` | Enable ingress | `false` |
| `persistence.enabled` | Enable uploads PVC | `true` |
| `persistence.size` | PVC size | `5Gi` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `config.defaultModel` | Default LLM model | `claude-sonnet-4-20250514` |

### Feature Flags

| Parameter | Description | Default |
|-----------|-------------|---------|
| `config.features.multiAgent` | Enable multiple agents | `false` |
| `config.features.multimodal` | Enable file attachments | `true` |
| `config.features.mcpHub` | Enable MCP capabilities | `true` |
| `config.features.customBranding` | Enable custom branding | `true` |

### Using External Secrets

For production, use external secret management (like External Secrets Operator, Sealed Secrets, or Vault):

```yaml
# Create secret manually or via external-secrets
existingSecret: "my-agentinabox-secrets"

# Then in my-values.yaml
existingSecret: "my-agentinabox-secrets"
```

The secret should contain these keys:
- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `LICENSE_SECRET`
- `AGENTICLEDGER_LICENSE_KEY`

## Database Setup

Agent-in-a-Box requires PostgreSQL with the pgvector extension.

### Option 1: External Database (Recommended for Production)

Use a managed PostgreSQL service:
- **Neon** (recommended) - pgvector enabled by default
- **Supabase** - pgvector enabled by default
- **AWS RDS** - install pgvector extension manually
- **Google Cloud SQL** - install pgvector extension manually

### Option 2: PostgreSQL Subchart

Enable the included PostgreSQL subchart:

```yaml
postgresql:
  enabled: true
  auth:
    postgresPassword: "your-secure-password"
    database: agentinabox
  primary:
    persistence:
      enabled: true
      size: 10Gi
```

**Note:** You may need to manually install pgvector on the PostgreSQL instance.

## Health Checks

The application exposes a health endpoint at `/health`. The chart configures:
- **Liveness probe**: Restarts pod if health check fails
- **Readiness probe**: Removes pod from service if not ready

## Scaling

### Manual Scaling

```bash
kubectl scale deployment agentinabox --replicas=3
```

### Horizontal Pod Autoscaler

Enable autoscaling in values:

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

## Troubleshooting

### Check pod logs

```bash
kubectl logs -l app.kubernetes.io/name=agentinabox
```

### Check pod status

```bash
kubectl describe pod -l app.kubernetes.io/name=agentinabox
```

### Verify secrets

```bash
kubectl get secret agentinabox-secrets -o yaml
```

### Test database connection

```bash
kubectl exec -it deploy/agentinabox -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(() => console.log('DB OK')).catch(console.error);
"
```
