# Clara Agent Runner - Deployment Guide

## Overview

The Clara Agent Runner is a deployment service that allows you to turn Agent Studio workflows into production-ready REST APIs. Users can create workflows visually, test them locally, and deploy them with auto-generated API schemas and interactive documentation.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Docker Deployment](#docker-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [API Usage](#api-usage)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Using Docker Compose (Recommended)

1. **Navigate to the backend server directory:**
   ```bash
   cd ClaraVerseBackendServer
   ```

2. **Configure environment variables:**
   ```bash
   cp ../sdk/.env.example ../sdk/.env
   # Edit ../sdk/.env with your API keys
   ```

3. **Start all services:**
   ```bash
   docker-compose up -d
   ```

4. **Wait for services to be healthy:**
   ```bash
   docker-compose ps
   ```

5. **Access the Agent Runner:**
   - API: http://localhost:3000
   - Health Check: http://localhost:3000/health
   - API Info: http://localhost:3000/api/info

---

## Architecture

```
┌────────────────────────────────────────┐
│   ClaraVerse Desktop App (Electron)    │
│   ┌──────────────────────────────────┐ │
│   │     Agent Studio (UI)            │ │
│   │  - Create workflows visually     │ │
│   │  - Test locally                  │ │
│   │  - Click "Deploy" button         │ │
│   └──────────────┬───────────────────┘ │
└──────────────────┼─────────────────────┘
                   │
                   │ POST /api/deploy
                   ▼
┌────────────────────────────────────────┐
│   Docker Compose Environment           │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Clara Agent Runner (:3000)      │ │
│  │  - Deploy workflow                │ │
│  │  - Generate API schema            │ │
│  │  - Return endpoint + API key      │ │
│  └──────────┬────────────────────────┘ │
│             │                           │
│  ┌──────────▼────────────────────────┐ │
│  │   PostgreSQL (:5432)              │ │
│  │  - Store deployed workflows       │ │
│  │  - Track executions               │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │   External Services                │ │
│  │  - ComfyUI (:8188)                 │ │
│  │  - Python Backend (:5001)          │ │
│  │  - n8n (:5678)                     │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                   │
                   ▼
           External API Consumers
         (Call deployed endpoints)
```

---

## Prerequisites

### Required

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **Node.js** 20+ (for local development)
- **PostgreSQL** 16+ (if not using Docker)

### Optional

- **API Keys** (for AI features):
  - OpenAI API Key (for LLM, Whisper nodes)
  - Anthropic API Key (for Claude models)
  - OpenRouter API Key (for multi-model access)

---

## Local Development Setup

### 1. Install Dependencies

```bash
cd sdk
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Setup Database

**Start PostgreSQL locally or use Docker:**

```bash
docker run -d \
  --name clara_postgres \
  -e POSTGRES_DB=clara_workflows \
  -e POSTGRES_USER=clara \
  -e POSTGRES_PASSWORD=clara123 \
  -p 5432:5432 \
  postgres:16-alpine
```

**Run migrations:**

```bash
psql -h localhost -U clara -d clara_workflows -f migrations/001_initial_schema.sql
```

### 4. Start Server

```bash
npm run server:dev
```

The server will start on http://localhost:3000

---

## Docker Deployment

### Full Stack Deployment

Deploy the entire ClaraVerse stack including Agent Runner:

```bash
cd ClaraVerseBackendServer
docker-compose up -d
```

This starts:
- **clara_postgres** - PostgreSQL database (:5432)
- **clara_agent_runner** - Agent Runner API (:3000)
- **clara_comfyui** - ComfyUI for image generation (:8188)
- **clara_python** - Python backend for audio/speech (:5001)
- **clara_n8n** - n8n workflow automation (:5678)

### Agent Runner Only

To deploy just the Agent Runner service:

```bash
cd sdk

# Build image
docker build -t clara-agent-runner .

# Run container
docker run -d \
  --name clara_agent_runner \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://clara:clara123@host.docker.internal:5432/clara_workflows \
  -e OPENAI_API_KEY=your_key_here \
  clara-agent-runner
```

### Verify Deployment

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "Clara Agent Runner",
  "timestamp": "2025-01-07T...",
  "database": "connected"
}
```

---

## Environment Configuration

### Required Variables

```env
# Server
PORT=3000
BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://clara:clara123@localhost:5432/clara_workflows
```

### External Services (for workflow nodes)

```env
COMFYUI_URL=http://localhost:8188
PYTHON_BACKEND_URL=http://localhost:5001
OLLAMA_URL=http://localhost:11434
```

### API Keys (for AI nodes)

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Execution Limits

```env
MAX_EXECUTION_TIME=300000       # 5 minutes
MAX_CONCURRENT_EXECUTIONS=10
MAX_INPUT_SIZE=10485760         # 10MB
```

### Security

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGINS=*
```

See [.env.example](./env.example) for complete configuration options.

---

## Database Setup

### Automatic (Docker)

When using docker-compose, the database is automatically initialized with migrations from `/sdk/migrations`.

### Manual Setup

1. **Create database:**
   ```sql
   CREATE DATABASE clara_workflows;
   ```

2. **Run migrations:**
   ```bash
   psql -h localhost -U clara -d clara_workflows -f migrations/001_initial_schema.sql
   ```

3. **Verify tables:**
   ```sql
   \dt
   ```

   Should show:
   - `deployed_workflows`
   - `workflow_executions`
   - `api_rate_limits`

---

## API Usage

### 1. Deploy a Workflow

From Agent Studio, click "Deploy" or use the API directly:

```bash
curl -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Image Analyzer",
    "description": "Analyzes images using AI",
    "workflow": {
      "nodes": [...],
      "connections": [...]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "deployment": {
    "id": "uuid",
    "name": "Image Analyzer",
    "slug": "image-analyzer",
    "endpoint": "http://localhost:3000/api/workflows/image-analyzer/execute",
    "apiKey": "clara_sk_abc123...",
    "schema": {...},
    "docs": "http://localhost:3000/api/workflows/image-analyzer/docs"
  },
  "message": "Workflow deployed successfully. Save the API key - it will not be shown again!"
}
```

**⚠️ IMPORTANT:** Save the API key immediately - it's only shown once!

### 2. Execute Deployed Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/image-analyzer/execute \
  -H "Authorization: Bearer clara_sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,iVBORw0KG...",
    "prompt": "What is in this image?"
  }'
```

**Response:**
```json
{
  "success": true,
  "outputs": {
    "result": "The image shows a cat sitting on a table..."
  },
  "metadata": {
    "executionId": "uuid",
    "duration": "2341ms",
    "timestamp": "2025-01-07T..."
  }
}
```

### 3. View API Documentation

Open in browser:
```
http://localhost:3000/api/workflows/image-analyzer/docs
```

This provides interactive Swagger UI documentation with:
- Request/response schemas
- Example inputs
- Try-it-out functionality

### 4. Get OpenAPI Schema

```bash
curl http://localhost:3000/api/workflows/image-analyzer/schema
```

Returns full OpenAPI 3.0 specification.

### 5. List Deployments

```bash
curl http://localhost:3000/api/deployments
```

### 6. View Execution History

```bash
curl -X GET http://localhost:3000/api/workflows/image-analyzer/executions \
  -H "Authorization: Bearer clara_sk_abc123..."
```

---

## Workflow Requirements

For a workflow to be deployable, it must have:

1. **At least one input node:**
   - Input (text/number/JSON)
   - Image Input (base64 image)
   - PDF Input (file content)
   - File Upload (any file)

2. **At least one output node:**
   - Output (displays result)

3. **No circular dependencies**

### Supported Node Types

**Input Nodes:**
- Input, Image Input, PDF Input, File Upload

**Processing Nodes:**
- LLM Chat, Structured LLM, Agent Executor
- JSON Parser, Combine Text, If/Else
- API Request

**AI Services:**
- ComfyUI Image Generator
- Whisper Transcription, Speech to Text, Text to Speech
- Notebook Writer, Notebook Chat

**Output Nodes:**
- Output

### Example Workflow Structure

```json
{
  "name": "Simple Greeting",
  "nodes": [
    {
      "id": "input-1",
      "type": "input",
      "data": { "label": "User Name" }
    },
    {
      "id": "llm-1",
      "type": "llm-chat",
      "data": { "systemPrompt": "You are a friendly assistant" }
    },
    {
      "id": "output-1",
      "type": "output",
      "data": { "outputLabel": "Greeting" }
    }
  ],
  "connections": [
    { "source": "input-1", "target": "llm-1", "sourceHandle": "output", "targetHandle": "User Message" },
    { "source": "llm-1", "target": "output-1", "sourceHandle": "response", "targetHandle": "input" }
  ]
}
```

---

## Monitoring & Maintenance

### Health Checks

```bash
# Overall health
curl http://localhost:3000/health

# Database connectivity
docker exec clara_postgres pg_isready -U clara
```

### Logs

**Docker logs:**
```bash
docker logs -f clara_agent_runner
docker logs -f clara_postgres
```

**Application logs:**
Stored in `/app/logs` inside container (mounted to `agent_runner_logs` volume)

### Database Maintenance

**Clean up old executions (older than 30 days):**

```sql
SELECT cleanup_old_executions(30);
```

**View deployment statistics:**

```sql
SELECT * FROM deployment_stats;
```

### Backup

**Backup database:**
```bash
docker exec clara_postgres pg_dump -U clara clara_workflows > backup.sql
```

**Restore database:**
```bash
cat backup.sql | docker exec -i clara_postgres psql -U clara clara_workflows
```

---

## Troubleshooting

### Issue: Database connection fails

**Symptoms:**
```
❌ Database connection failed: connection refused
```

**Solutions:**
1. Check if PostgreSQL is running:
   ```bash
   docker ps | grep clara_postgres
   ```

2. Verify DATABASE_URL is correct:
   ```bash
   echo $DATABASE_URL
   ```

3. Test connection manually:
   ```bash
   psql -h localhost -U clara -d clara_workflows
   ```

### Issue: Workflow execution timeout

**Symptoms:**
```json
{
  "success": false,
  "error": "Workflow execution timeout after 300000ms"
}
```

**Solutions:**
1. Increase timeout in `.env`:
   ```env
   MAX_EXECUTION_TIME=600000  # 10 minutes
   ```

2. Optimize workflow (reduce node count, simplify logic)

3. Check if external services are responsive:
   ```bash
   curl http://localhost:8188  # ComfyUI
   curl http://localhost:5001/health  # Python backend
   ```

### Issue: Rate limit exceeded

**Symptoms:**
```json
{
  "success": false,
  "error": "Too many requests"
}
```

**Solutions:**
1. Wait for rate limit window to reset
2. Increase rate limit in `.env`:
   ```env
   RATE_LIMIT_MAX_REQUESTS=500
   ```
3. Or disable rate limiting (not recommended for production):
   ```env
   RATE_LIMIT_ENABLED=false
   ```

### Issue: API key not working

**Symptoms:**
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

**Solutions:**
1. Verify API key format starts with `clara_sk_`
2. Use `Bearer` prefix in Authorization header:
   ```
   Authorization: Bearer clara_sk_abc123...
   ```
3. Regenerate API key if lost:
   ```bash
   curl -X POST http://localhost:3000/api/workflows/{id}/regenerate-key \
     -H "Authorization: Bearer clara_sk_old_key..."
   ```

### Issue: Nodes requiring external services fail

**Symptoms:**
```json
{
  "success": false,
  "error": "ComfyUI connection failed"
}
```

**Solutions:**
1. Verify external services are running:
   ```bash
   docker ps
   ```

2. Check service URLs in `.env`:
   ```env
   COMFYUI_URL=http://clara_comfyui:8188
   ```

3. Test service directly:
   ```bash
   curl http://localhost:8188
   ```

---

## Security Best Practices

### Production Deployment

1. **Change default passwords:**
   - PostgreSQL: `POSTGRES_PASSWORD`
   - n8n: `N8N_BASIC_AUTH_PASSWORD`

2. **Use environment variables for secrets:**
   - Never commit `.env` files
   - Use secret management (AWS Secrets Manager, etc.)

3. **Enable HTTPS:**
   - Use reverse proxy (nginx, Traefik)
   - Configure SSL certificates

4. **Restrict CORS origins:**
   ```env
   CORS_ORIGINS=https://your-domain.com
   ```

5. **Enable authentication:**
   - All deployed workflows require API keys
   - Rotate keys periodically

6. **Monitor and log:**
   - Enable execution logging
   - Set up alerts for errors
   - Review execution history regularly

---

## Cloud Deployment

### AWS (Example)

1. **Deploy PostgreSQL:**
   - Use RDS PostgreSQL
   - Configure security groups

2. **Deploy Agent Runner:**
   - Use ECS/Fargate or EC2
   - Set environment variables
   - Configure load balancer

3. **Set up monitoring:**
   - CloudWatch for logs
   - CloudWatch Alarms for errors

### GCP (Example)

1. **Deploy PostgreSQL:**
   - Use Cloud SQL
   - Configure VPC

2. **Deploy Agent Runner:**
   - Use Cloud Run or GKE
   - Set environment variables
   - Configure Cloud Load Balancer

3. **Set up monitoring:**
   - Cloud Logging
   - Cloud Monitoring

---

## Support

For issues, feature requests, or questions:
- GitHub Issues: https://github.com/badboysm890/ClaraVerse/issues
- Documentation: https://docs.claraverse.com

---

## License

MIT License - see LICENSE file for details.
