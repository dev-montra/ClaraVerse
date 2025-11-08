# Clara Agent Runner - API Reference

Complete API documentation for the Clara Agent Runner service.

**Base URL:** `http://localhost:3000`

**Version:** 1.0.0

---

## Table of Contents

- [Authentication](#authentication)
- [Deployment Endpoints](#deployment-endpoints)
- [Workflow Endpoints](#workflow-endpoints)
- [Execution Endpoints](#execution-endpoints)
- [Management Endpoints](#management-endpoints)
- [Utility Endpoints](#utility-endpoints)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)

---

## Authentication

The API uses **API key authentication** for deployed workflows.

### API Key Format

```
clara_sk_<random_string>
```

### Authentication Header

```http
Authorization: Bearer clara_sk_abc123...
```

**Note:** API keys are generated when deploying a workflow and are shown only once. Store them securely!

---

## Deployment Endpoints

### Deploy a Workflow

Deploy an Agent Studio workflow as a REST API endpoint.

**Endpoint:** `POST /api/deploy`

**Authentication:** None (for now)

**Request Body:**

```json
{
  "name": "string",                  // Required: Workflow name
  "slug": "string",                  // Optional: URL-friendly name (auto-generated if not provided)
  "description": "string",           // Optional: Workflow description
  "userId": "string",                // Optional: User identifier
  "workflow": {                      // Required: Workflow JSON from Agent Studio
    "nodes": [...],
    "connections": [...],
    "customNodes": [...]
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "deployment": {
    "id": "uuid",
    "name": "Image Analyzer",
    "slug": "image-analyzer",
    "description": "Analyzes images using AI",
    "endpoint": "http://localhost:3000/api/workflows/image-analyzer/execute",
    "apiKey": "clara_sk_abc123...",     // ⚠️ Save this - shown only once!
    "schema": {
      "input": {...},
      "output": {...}
    },
    "docs": "http://localhost:3000/api/workflows/image-analyzer/docs",
    "createdAt": "2025-01-07T..."
  },
  "message": "Workflow deployed successfully. Save the API key - it will not be shown again!"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Image Analyzer",
    "description": "Analyzes images using GPT-4 Vision",
    "workflow": {
      "nodes": [
        {
          "id": "img-input-1",
          "type": "image-input",
          "data": { "label": "Image" }
        },
        {
          "id": "llm-1",
          "type": "llm-chat",
          "data": { "model": "gpt-4-vision-preview" }
        },
        {
          "id": "output-1",
          "type": "output",
          "data": { "outputLabel": "Analysis" }
        }
      ],
      "connections": [...]
    }
  }'
```

---

### List All Deployments

Get a list of all deployed workflows.

**Endpoint:** `GET /api/deployments`

**Authentication:** None (for now)

**Query Parameters:**

- `userId` (optional): Filter by user ID
- `limit` (optional): Number of results (default: 100, max: 1000)
- `offset` (optional): Pagination offset (default: 0)

**Response:** `200 OK`

```json
{
  "success": true,
  "deployments": [
    {
      "id": "uuid",
      "name": "Image Analyzer",
      "slug": "image-analyzer",
      "description": "Analyzes images using AI",
      "endpoint": "http://localhost:3000/api/workflows/image-analyzer/execute",
      "executionCount": 42,
      "lastExecuted": "2025-01-07T...",
      "createdAt": "2025-01-07T...",
      "isActive": true
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}
```

**Example:**

```bash
curl http://localhost:3000/api/deployments?limit=10
```

---

## Workflow Endpoints

### Get Workflow Details

Get details about a deployed workflow.

**Endpoint:** `GET /api/workflows/:slug`

**Authentication:** None

**Path Parameters:**

- `slug`: Workflow slug (e.g., "image-analyzer")

**Response:** `200 OK`

```json
{
  "success": true,
  "workflow": {
    "id": "uuid",
    "name": "Image Analyzer",
    "slug": "image-analyzer",
    "description": "Analyzes images using AI",
    "endpoint": "http://localhost:3000/api/workflows/image-analyzer/execute",
    "schema": {
      "input": {
        "type": "object",
        "properties": {
          "image": {
            "type": "string",
            "format": "base64",
            "description": "Base64 encoded image"
          }
        },
        "required": ["image"]
      },
      "output": {
        "type": "object",
        "properties": {
          "analysis": {
            "type": "string"
          }
        }
      }
    },
    "executionCount": 42,
    "lastExecuted": "2025-01-07T...",
    "createdAt": "2025-01-07T...",
    "updatedAt": "2025-01-07T..."
  }
}
```

**Example:**

```bash
curl http://localhost:3000/api/workflows/image-analyzer
```

---

### Get OpenAPI Schema

Get the OpenAPI 3.0 schema for a workflow.

**Endpoint:** `GET /api/workflows/:slug/schema`

**Authentication:** None

**Response:** `200 OK`

Returns a complete OpenAPI 3.0 specification.

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Image Analyzer",
    "description": "Deployed Clara workflow API",
    "version": "1.0.0"
  },
  "paths": {
    "/api/workflows/image-analyzer/execute": {
      "post": {
        "summary": "Execute Image Analyzer",
        "requestBody": {...},
        "responses": {...}
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {...}
    }
  }
}
```

**Example:**

```bash
curl http://localhost:3000/api/workflows/image-analyzer/schema
```

---

### Get Interactive Documentation

View interactive Swagger UI documentation.

**Endpoint:** `GET /api/workflows/:slug/docs`

**Authentication:** None

**Response:** `200 OK` (HTML)

Opens an interactive Swagger UI with:
- Request/response schemas
- Example inputs
- Try-it-out functionality

**Example:**

```
http://localhost:3000/api/workflows/image-analyzer/docs
```

---

## Execution Endpoints

### Execute Workflow

Execute a deployed workflow with inputs.

**Endpoint:** `POST /api/workflows/:slug/execute`

**Authentication:** Required (API Key)

**Headers:**

```http
Authorization: Bearer clara_sk_abc123...
Content-Type: application/json
```

**Path Parameters:**

- `slug`: Workflow slug

**Request Body:**

Inputs based on workflow schema. Example for Image Analyzer:

```json
{
  "image": "data:image/png;base64,iVBORw0KG...",
  "prompt": "What is in this image?"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "outputs": {
    "analysis": "The image shows a cat sitting on a table..."
  },
  "metadata": {
    "executionId": "uuid",
    "duration": "2341ms",
    "durationMs": 2341,
    "nodesExecuted": 5,
    "timestamp": "2025-01-07T...",
    "workflow": {
      "id": "uuid",
      "name": "Image Analyzer",
      "slug": "image-analyzer"
    }
  }
}
```

**Error Response:** `500 Internal Server Error`

```json
{
  "success": false,
  "error": "Execution failed",
  "logs": [...]
  "metadata": {
    "executionId": "uuid",
    "duration": "1234ms",
    "timestamp": "2025-01-07T..."
  }
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/workflows/image-analyzer/execute \
  -H "Authorization: Bearer clara_sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,iVBORw0KG...",
    "prompt": "Describe this image in detail"
  }'
```

---

### Get Execution History

Get execution history for a workflow.

**Endpoint:** `GET /api/workflows/:slug/executions`

**Authentication:** Required (API Key)

**Query Parameters:**

- `limit` (optional): Number of results (default: 50, max: 1000)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status ("success", "error", "timeout")

**Response:** `200 OK`

```json
{
  "success": true,
  "executions": [
    {
      "id": "uuid",
      "inputs": {
        "image": "data:image/png;base64...",
        "prompt": "..."
      },
      "outputs": {
        "analysis": "..."
      },
      "status": "success",
      "error": null,
      "duration": "2341ms",
      "createdAt": "2025-01-07T..."
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Example:**

```bash
curl -X GET "http://localhost:3000/api/workflows/image-analyzer/executions?limit=10&status=success" \
  -H "Authorization: Bearer clara_sk_abc123..."
```

---

## Management Endpoints

### Delete Workflow

Delete (deactivate) a deployed workflow.

**Endpoint:** `DELETE /api/workflows/:id`

**Authentication:** Required (API Key)

**Path Parameters:**

- `id`: Workflow UUID (not slug)

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Workflow deleted successfully",
  "workflow": {
    "id": "uuid",
    "slug": "image-analyzer"
  }
}
```

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/workflows/uuid-here \
  -H "Authorization: Bearer clara_sk_abc123..."
```

---

### Regenerate API Key

Regenerate the API key for a workflow.

**Endpoint:** `POST /api/workflows/:id/regenerate-key`

**Authentication:** Required (Current API Key)

**Path Parameters:**

- `id`: Workflow UUID

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "API key regenerated successfully. Save it - it will not be shown again!",
  "workflow": {
    "id": "uuid",
    "slug": "image-analyzer",
    "apiKey": "clara_sk_new_key_here..."
  }
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/workflows/uuid-here/regenerate-key \
  -H "Authorization: Bearer clara_sk_old_key..."
```

---

## Utility Endpoints

### Health Check

Check service health and status.

**Endpoint:** `GET /health`

**Authentication:** None

**Response:** `200 OK`

```json
{
  "status": "healthy",
  "service": "Clara Agent Runner",
  "version": "1.0.0",
  "timestamp": "2025-01-07T...",
  "uptime": "3600s",
  "database": "connected",
  "config": {
    "server": {
      "port": 3000,
      "env": "production"
    },
    "services": {
      "comfyui": "enabled",
      "pythonBackend": "enabled"
    }
  }
}
```

**Example:**

```bash
curl http://localhost:3000/health
```

---

### Service Information

Get service information and available endpoints.

**Endpoint:** `GET /api/info`

**Authentication:** None

**Response:** `200 OK`

```json
{
  "service": "Clara Agent Runner API",
  "version": "1.0.0",
  "description": "Deploy and execute Clara workflows as REST APIs",
  "features": [
    "Workflow deployment with auto-generated schemas",
    "Dynamic API endpoint creation",
    "OpenAPI 3.0 documentation",
    "Input/output validation",
    "Execution tracking and logging",
    "Rate limiting and authentication"
  ],
  "endpoints": {
    "POST /api/deploy": "Deploy a new workflow",
    "GET /api/deployments": "List all deployed workflows",
    ...
  }
}
```

**Example:**

```bash
curl http://localhost:3000/api/info
```

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message",
  "timestamp": "2025-01-07T..."
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | API key doesn't have permission |
| 404 | Not Found | Resource not found |
| 413 | Payload Too Large | Request body exceeds size limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error during execution |

### Common Errors

**401 Unauthorized - Missing API Key**

```json
{
  "success": false,
  "error": "Missing Authorization header",
  "message": "Please provide an API key in the Authorization header: Bearer clara_sk_...",
  "timestamp": "2025-01-07T..."
}
```

**400 Bad Request - Validation Error**

```json
{
  "success": false,
  "error": "Input validation failed",
  "validationErrors": [
    "Missing required field: image",
    "Field 'prompt' must be a string"
  ],
  "schema": {...},
  "timestamp": "2025-01-07T..."
}
```

**500 Internal Server Error - Execution Failed**

```json
{
  "success": false,
  "error": "Execution failed",
  "message": "LLM API key not configured",
  "metadata": {
    "executionId": "uuid",
    "duration": "123ms",
    "timestamp": "2025-01-07T..."
  }
}
```

---

## Rate Limiting

Rate limiting is enforced per API key on execution endpoints.

**Default Limits:**
- 100 requests per hour
- Configurable via `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`

**Headers:**

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704672000
```

**Rate Limit Exceeded:**

```json
{
  "success": false,
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

---

## Code Examples

### JavaScript (Node.js)

```javascript
import fetch from 'node-fetch';

// Deploy workflow
const deployResponse = await fetch('http://localhost:3000/api/deploy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Image Analyzer',
    workflow: { nodes: [...], connections: [...] }
  })
});

const deployment = await deployResponse.json();
const apiKey = deployment.deployment.apiKey;
const endpoint = deployment.deployment.endpoint;

// Execute workflow
const executeResponse = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    image: 'data:image/png;base64,...',
    prompt: 'What is this?'
  })
});

const result = await executeResponse.json();
console.log(result.outputs);
```

### Python

```python
import requests

# Deploy workflow
deploy_response = requests.post(
    'http://localhost:3000/api/deploy',
    json={
        'name': 'Image Analyzer',
        'workflow': {'nodes': [...], 'connections': [...]}
    }
)

deployment = deploy_response.json()
api_key = deployment['deployment']['apiKey']
endpoint = deployment['deployment']['endpoint']

# Execute workflow
execute_response = requests.post(
    endpoint,
    headers={'Authorization': f'Bearer {api_key}'},
    json={
        'image': 'data:image/png;base64,...',
        'prompt': 'What is this?'
    }
)

result = execute_response.json()
print(result['outputs'])
```

### cURL

```bash
# Deploy workflow
curl -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -d @workflow.json

# Execute workflow
curl -X POST http://localhost:3000/api/workflows/image-analyzer/execute \
  -H "Authorization: Bearer clara_sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,...",
    "prompt": "What is this?"
  }'
```

---

## Webhooks (Coming Soon)

Future support for webhook notifications on:
- Workflow execution completion
- Execution failures
- Rate limit warnings

---

## Support

For API support:
- Documentation: [DEPLOYMENT.md](./DEPLOYMENT.md)
- GitHub Issues: https://github.com/badboysm890/ClaraVerse/issues

---

## Changelog

### v1.0.0 (2025-01-07)
- Initial release
- Workflow deployment API
- Dynamic schema generation
- OpenAPI 3.0 support
- Interactive Swagger UI docs
- Execution tracking
- Rate limiting
- API key authentication
