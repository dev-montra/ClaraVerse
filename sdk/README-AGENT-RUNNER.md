# Clara Agent Runner - Deployment System

## 🎉 What We Built

A complete **Workflow-as-API** platform that allows users to:

1. **Create workflows** in Agent Studio using drag-and-drop
2. **Test locally** with instant feedback
3. **Click "Deploy"** to turn it into a REST API
4. **Get an endpoint** with auto-generated request/response schema
5. **Call the API** from external applications

## 🏗️ Architecture

```
┌────────────────────────────────────┐
│   Agent Studio (Frontend)          │
│   - Drag & drop workflow builder   │
│   - Local testing                  │
│   - Deploy button (coming soon)    │
└──────────────┬─────────────────────┘
               │
               │ POST /api/deploy
               ▼
┌────────────────────────────────────┐
│   Agent Runner API Server (:3000)  │
│   ✅ FULLY IMPLEMENTED              │
│                                    │
│   - Workflow deployment            │
│   - Auto-generate API schemas      │
│   - Execute with ClaraFlowRunner   │
│   - API key authentication         │
│   - Rate limiting                  │
│   - Swagger UI docs                │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│   PostgreSQL Database (:5432)      │
│   ✅ FULLY IMPLEMENTED              │
│                                    │
│   - Deployed workflows             │
│   - Execution history              │
│   - API keys                       │
└────────────────────────────────────┘
```

---

## ✅ What's Complete (Backend)

### 1. Database Layer
- [sdk/migrations/001_initial_schema.sql](./migrations/001_initial_schema.sql) - PostgreSQL schema
  - `deployed_workflows` table
  - `workflow_executions` table
  - `api_rate_limits` table
  - Views and functions for statistics

### 2. Core Modules
- [sdk/server/config.js](./server/config.js) - Environment configuration
- [sdk/server/database.js](./server/database.js) - Database operations
- [sdk/server/schema-generator.js](./server/schema-generator.js) - OpenAPI schema generation
- [sdk/server/workflow-executor.js](./server/workflow-executor.js) - Workflow execution engine

### 3. Middleware
- [sdk/server/middleware/auth.js](./server/middleware/auth.js) - API key authentication
- [sdk/server/middleware/validation.js](./server/middleware/validation.js) - Request validation

### 4. API Server
- [sdk/server/server.js](./server/server.js) - Express.js REST API with all endpoints

### 5. Infrastructure
- [sdk/Dockerfile](./Dockerfile) - Container configuration
- [sdk/.dockerignore](./dockerignore) - Build optimization
- [ClaraVerseBackendServer/docker-compose.yml](../ClaraVerseBackendServer/docker-compose.yml) - Full stack deployment
- [sdk/.env.example](./env.example) - Environment template

### 6. Documentation
- [sdk/DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide (comprehensive!)
- [sdk/API.md](./API.md) - API reference (complete!)

---

## 🚀 Quick Start

### 1. Start the Services

```bash
cd ClaraVerseBackendServer
docker-compose up -d
```

This starts:
- ✅ PostgreSQL (port 5432)
- ✅ Agent Runner API (port 3000)
- ✅ ComfyUI (port 8188)
- ✅ Python Backend (port 5001)
- ✅ n8n (port 5678)

### 2. Verify It's Running

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "Clara Agent Runner",
  "database": "connected"
}
```

### 3. Deploy a Workflow (via API)

```bash
curl -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hello World",
    "workflow": {
      "nodes": [
        {
          "id": "input-1",
          "type": "input",
          "data": { "label": "Name" }
        },
        {
          "id": "output-1",
          "type": "output",
          "data": { "outputLabel": "Greeting" }
        }
      ],
      "connections": [
        {
          "source": "input-1",
          "target": "output-1",
          "sourceHandle": "output",
          "targetHandle": "input"
        }
      ]
    }
  }'
```

**Response includes:**
- ✅ API endpoint URL
- ✅ API key (save it!)
- ✅ Request/response schema
- ✅ Interactive docs URL

### 4. Execute the Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/hello-world/execute \
  -H "Authorization: Bearer clara_sk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Alice" }'
```

**Response:**
```json
{
  "success": true,
  "outputs": {
    "greeting": "Alice"
  },
  "metadata": {
    "duration": "45ms",
    "executionId": "uuid"
  }
}
```

---

## 📚 API Endpoints

### Deployment
- `POST /api/deploy` - Deploy a workflow
- `GET /api/deployments` - List all deployments

### Workflow Info
- `GET /api/workflows/:slug` - Get workflow details
- `GET /api/workflows/:slug/schema` - Get OpenAPI schema
- `GET /api/workflows/:slug/docs` - Interactive Swagger UI

### Execution
- `POST /api/workflows/:slug/execute` - Execute workflow (requires API key)
- `GET /api/workflows/:slug/executions` - Get execution history (requires API key)

### Management
- `DELETE /api/workflows/:id` - Delete workflow (requires API key)
- `POST /api/workflows/:id/regenerate-key` - Regenerate API key (requires API key)

### Utilities
- `GET /health` - Health check
- `GET /api/info` - Service information

---

## 🎯 Key Features Implemented

### 1. Auto-Generated Schemas

The system automatically analyzes workflow nodes and generates:

- **OpenAPI 3.0 specs** - Full API documentation
- **JSON schemas** - For input/output validation
- **Example payloads** - Based on node types

**Example:**

Workflow with `ImageInput` + `TextInput` → generates:

```json
{
  "input": {
    "type": "object",
    "properties": {
      "image": { "type": "string", "format": "base64" },
      "text": { "type": "string" }
    },
    "required": ["image", "text"]
  }
}
```

### 2. Smart Input Mapping

- API field names are auto-generated from node labels
- Converts to camelCase (e.g., "User Name" → "userName")
- Maps to internal node IDs during execution

### 3. Environment Injection

The executor automatically injects:
- Service URLs (ComfyUI, Python backend, etc.)
- API keys (OpenAI, Anthropic, etc.)
- Configuration from environment variables

**Nodes that use injection:**
- LLM Chat → `apiKey`, `apiBaseUrl`
- ComfyUI → `comfyUIBaseUrl`
- Whisper → `apiKey`, `baseUrl`
- Agent Executor → `provider`, `apiKey`

### 4. Execution Tracking

Every execution is logged with:
- Inputs and outputs
- Status (success/error/timeout)
- Duration in milliseconds
- Error messages (if failed)
- Timestamp

### 5. Interactive Documentation

Each deployed workflow gets:
- **Swagger UI** at `/api/workflows/{slug}/docs`
- Try-it-out functionality
- Code examples in multiple languages

### 6. Security

- **API key authentication** per workflow
- **Rate limiting** (100 requests/hour by default)
- **Input validation** against schemas
- **Input sanitization** (null bytes, excessive whitespace)
- **Request size limits** (10MB default)

---

## 📋 What's Next (Frontend Integration)

To complete the end-to-end flow, we need to add UI components in Agent Studio:

### 1. Deploy Button
- Location: [src/components/AgentStudio.tsx](../src/components/AgentStudio.tsx)
- Add "Deploy" button in toolbar (next to Save/Export)

### 2. Deployment Modal
- Create: [src/components/DeploymentModal.tsx](../src/components/DeploymentModal.tsx)
- Features:
  - Input workflow name
  - Optional description
  - Preview endpoint URL
  - Show detected input/output nodes
  - Display generated schema preview

### 3. Deployment Manager
- Create: [src/components/DeploymentManager.tsx](../src/components/DeploymentManager.tsx)
- Features:
  - List user's deployed workflows
  - Show endpoint URLs and API keys
  - View execution statistics
  - Test endpoints directly
  - Undeploy workflows
  - Regenerate API keys

### 4. Deployment Service
- Create: [src/services/agentDeploymentService.ts](../src/services/agentDeploymentService.ts)
- API client methods:
  - `deployWorkflow(workflow, options)`
  - `getDeployments()`
  - `getDeploymentDetails(slug)`
  - `executeWorkflow(slug, inputs, apiKey)`
  - `undeployWorkflow(id, apiKey)`
  - `regenerateApiKey(id, oldKey)`

---

## 🧪 Testing the System

### 1. Test Deployment

```bash
cd sdk
node << 'EOF'
import fetch from 'node-fetch';

const workflow = {
  name: 'Test Workflow',
  workflow: {
    nodes: [
      { id: 'in1', type: 'input', data: { label: 'Message' } },
      { id: 'out1', type: 'output', data: { outputLabel: 'Result' } }
    ],
    connections: [
      { source: 'in1', target: 'out1', sourceHandle: 'output', targetHandle: 'input' }
    ]
  }
};

const res = await fetch('http://localhost:3000/api/deploy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(workflow)
});

console.log(await res.json());
EOF
```

### 2. Test Execution

Use the API key from deployment response:

```bash
curl -X POST http://localhost:3000/api/workflows/test-workflow/execute \
  -H "Authorization: Bearer clara_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World"}'
```

### 3. View Documentation

Open in browser:
```
http://localhost:3000/api/workflows/test-workflow/docs
```

---

## 🔧 Configuration

### Environment Variables

All configuration is in [sdk/.env](./env.example):

```env
# Server
PORT=3000
BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://clara:clara123@localhost:5432/clara_workflows

# External Services
COMFYUI_URL=http://localhost:8188
PYTHON_BACKEND_URL=http://localhost:5001

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Limits
MAX_EXECUTION_TIME=300000
MAX_CONCURRENT_EXECUTIONS=10

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
```

### Docker Services

In [docker-compose.yml](../ClaraVerseBackendServer/docker-compose.yml):

- `clara_postgres` - Database
- `clara_agent_runner` - API server
- `clara_comfyui` - Image generation
- `clara_python` - Audio/speech processing
- `clara_n8n` - Workflow automation

---

## 📖 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
  - Quick start
  - Docker setup
  - Environment configuration
  - Database setup
  - Troubleshooting
  - Security best practices
  - Cloud deployment examples

- **[API.md](./API.md)** - Complete API reference
  - All endpoints documented
  - Request/response examples
  - Error handling
  - Code examples (JavaScript, Python, cURL)
  - Rate limiting details

---

## 🎨 Example Workflows

### Image Analyzer

```json
{
  "name": "Image Analyzer",
  "nodes": [
    {
      "id": "img-1",
      "type": "image-input",
      "data": { "label": "Image" }
    },
    {
      "id": "llm-1",
      "type": "llm-chat",
      "data": {
        "model": "gpt-4-vision-preview",
        "systemPrompt": "Describe images in detail"
      }
    },
    {
      "id": "out-1",
      "type": "output",
      "data": { "outputLabel": "Description" }
    }
  ],
  "connections": [...]
}
```

**Generated API:**
```bash
POST /api/workflows/image-analyzer/execute
Body: { "image": "data:image/png;base64..." }
```

### PDF Summarizer

```json
{
  "name": "PDF Summarizer",
  "nodes": [
    {
      "id": "pdf-1",
      "type": "pdf-input",
      "data": { "label": "Document" }
    },
    {
      "id": "llm-1",
      "type": "structured-llm",
      "data": {
        "outputSchema": {
          "summary": "string",
          "keyPoints": "array"
        }
      }
    },
    {
      "id": "out-1",
      "type": "output",
      "data": { "outputLabel": "Summary" }
    }
  ],
  "connections": [...]
}
```

**Generated API:**
```bash
POST /api/workflows/pdf-summarizer/execute
Body: { "document": "base64_pdf_content" }
```

---

## 🐛 Troubleshooting

### Database connection fails

```bash
# Check if PostgreSQL is running
docker ps | grep clara_postgres

# View logs
docker logs clara_postgres

# Restart if needed
docker-compose restart clara_postgres
```

### API server won't start

```bash
# Check logs
docker logs clara_agent_runner

# Verify environment variables
docker exec clara_agent_runner env | grep DATABASE_URL
```

### Workflow execution timeout

- Increase `MAX_EXECUTION_TIME` in `.env`
- Check if external services (ComfyUI, Python backend) are running
- Review workflow complexity

See [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting) for more details.

---

## 🚀 Next Steps

1. **Deploy the backend** (✅ Ready now!)
   ```bash
   cd ClaraVerseBackendServer
   docker-compose up -d
   ```

2. **Test the API** (✅ Works now!)
   - Deploy a workflow via API
   - Execute it
   - View Swagger docs

3. **Add frontend integration** (Next task)
   - DeploymentModal component
   - Deploy button in AgentStudio
   - Deployment management UI

4. **Production deployment** (When ready)
   - Deploy to cloud (AWS, GCP, Azure)
   - Configure SSL/HTTPS
   - Set up monitoring
   - Enable backups

---

## 📞 Support

- **Documentation:** [DEPLOYMENT.md](./DEPLOYMENT.md) | [API.md](./API.md)
- **GitHub Issues:** https://github.com/badboysm890/ClaraVerse/issues
- **Project:** https://github.com/badboysm890/ClaraVerse

---

## 📝 Summary

**What you can do RIGHT NOW:**

1. ✅ Deploy workflows via REST API
2. ✅ Execute deployed workflows with API keys
3. ✅ Get auto-generated OpenAPI schemas
4. ✅ View interactive Swagger UI docs
5. ✅ Track execution history
6. ✅ Run in Docker with all dependencies

**What's coming next:**

- Frontend integration in Agent Studio
- One-click deployment from the UI
- Visual deployment management
- Workflow templates marketplace

The backend infrastructure is **production-ready** and fully functional! 🎉
