# ClaraCore Complete API Reference

## Overview

ClaraCore provides a comprehensive HTTP API for managing AI models, system configuration, and OpenAI-compatible endpoints. The API is designed for both programmatic access and integration with the React UI.

**Base URLs:**
- Local UI: `http://localhost:5800/ui/`
- API Base: `http://localhost:5800/api`
- OpenAI Base: `http://localhost:5800/v1`
- Health Check: `http://localhost:5800/health`

**Default Port:** 5800 (configurable via `config.yaml`)

---

## Table of Contents

1. [Authentication](#authentication)
2. [OpenAI-Compatible Endpoints](#openai-compatible-endpoints)
3. [System Management](#system-management)
4. [Model Management](#model-management)
5. [Configuration Management](#configuration-management)
6. [Download Management](#download-management)
7. [Monitoring & Events](#monitoring--events)
8. [Binary Management](#binary-management)
9. [Error Handling](#error-handling)
10. [Examples & Use Cases](#examples--use-cases)

---

## Authentication

ClaraCore supports optional API key authentication for all endpoints except system settings configuration.

### Headers
```http
Authorization: Bearer <your-api-key>
# OR
X-API-Key: <your-api-key>
# OR (for EventSource/limited clients)
?api_key=<your-api-key>
```

### Configure API Key
```bash
curl -X POST http://localhost:5800/api/settings/system \
  -H 'Content-Type: application/json' \
  -d '{
    "requireApiKey": true,
    "apiKey": "your-secret-key-here"
  }'
```

---

## OpenAI-Compatible Endpoints

ClaraCore provides full OpenAI API compatibility for seamless integration with existing tools and applications.

### Chat Completions

**Endpoint:** `POST /v1/chat/completions`

**Request:**
```bash
curl -X POST http://localhost:5800/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "model": "llama-3.2-3b-instruct",
    "messages": [
      {
        "role": "user",
        "content": "Explain quantum computing in simple terms"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 150,
    "stream": false
  }'
```

**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699999999,
  "model": "llama-3.2-3b-instruct",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing is like having a super-powered calculator..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 45,
    "total_tokens": 60
  }
}
```

### Streaming Chat Completions

**Request:**
```bash
curl -X POST http://localhost:5800/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "model": "llama-3.2-3b-instruct",
    "messages": [
      {
        "role": "user",
        "content": "Write a haiku about programming"
      }
    ],
    "stream": true
  }'
```

**Response:** (Server-Sent Events)
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1699999999,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1699999999,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{"content":"Code"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1699999999,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{"content":" flows"},"finish_reason":null}]}

data: [DONE]
```

### Text Completions

**Endpoint:** `POST /v1/completions`

**Request:**
```bash
curl -X POST http://localhost:5800/v1/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "model": "codellama-7b",
    "prompt": "def fibonacci(n):",
    "max_tokens": 100,
    "temperature": 0.2
  }'
```

### Embeddings

**Endpoint:** `POST /v1/embeddings`

**Request:**
```bash
curl -X POST http://localhost:5800/v1/embeddings \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "model": "nomic-embed-text-v1.5",
    "input": ["Hello world", "How are you?"]
  }'
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.1234, -0.5678, ...],
      "index": 0
    },
    {
      "object": "embedding", 
      "embedding": [0.9876, -0.1234, ...],
      "index": 1
    }
  ],
  "model": "nomic-embed-text-v1.5",
  "usage": {
    "prompt_tokens": 4,
    "total_tokens": 4
  }
}
```

### List Models

**Endpoint:** `GET /v1/models`

**Request:**
```bash
curl -X GET http://localhost:5800/v1/models \
  -H 'Authorization: Bearer your-api-key'
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "llama-3.2-3b-instruct",
      "object": "model",
      "created": 1699999999,
      "owned_by": "claracore",
      "permission": [],
      "root": "llama-3.2-3b-instruct",
      "parent": null
    },
    {
      "id": "nomic-embed-text-v1.5",
      "object": "model",
      "created": 1699999999,
      "owned_by": "claracore",
      "permission": [],
      "root": "nomic-embed-text-v1.5",
      "parent": null
    }
  ]
}
```

### Audio Endpoints

#### Text-to-Speech
**Endpoint:** `POST /v1/audio/speech`

```bash
curl -X POST http://localhost:5800/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "model": "tts-model",
    "input": "Hello, this is a test.",
    "voice": "alloy"
  }' \
  --output speech.mp3
```

#### Speech-to-Text
**Endpoint:** `POST /v1/audio/transcriptions`

```bash
curl -X POST http://localhost:5800/v1/audio/transcriptions \
  -H 'Authorization: Bearer your-api-key' \
  -F file=@audio.wav \
  -F model=whisper-1
```

**Response:**
```json
{
  "text": "Hello, this is a test transcription."
}
```

### Reranking

**Endpoints:** `POST /v1/rerank`, `POST /v1/reranking`

```bash
curl -X POST http://localhost:5800/v1/rerank \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "model": "rerank-model",
    "query": "What is machine learning?",
    "documents": [
      "Machine learning is a subset of AI",
      "Cooking recipes for beginners",
      "Deep learning uses neural networks"
    ]
  }'
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "index": 0,
      "relevance_score": 0.95,
      "document": "Machine learning is a subset of AI"
    },
    {
      "index": 2,
      "relevance_score": 0.78,
      "document": "Deep learning uses neural networks"
    },
    {
      "index": 1,
      "relevance_score": 0.05,
      "document": "Cooking recipes for beginners"
    }
  ],
  "model": "rerank-model",
  "usage": {
    "total_tokens": 25
  }
}
```

### Additional Endpoints

**Code Infilling:** `POST /infill`
**Completion:** `POST /completion`

---

## System Management

### System Specifications

**Endpoint:** `GET /api/system/specs`

**Request:**
```bash
curl -X GET http://localhost:5800/api/system/specs
```

**Response:**
```json
{
  "totalRAM": 34359738368,
  "availableRAM": 25769803776,
  "totalVRAM": 12884901888,
  "availableVRAM": 10737418240,
  "cpuCores": 16,
  "gpuName": "NVIDIA RTX 4070",
  "diskSpace": 500000000000
}
```

### System Detection (Comprehensive)

**Endpoint:** `GET /api/system/detection`

**Request:**
```bash
curl -X GET http://localhost:5800/api/system/detection
```

**Response:**
```json
{
  "detectionQuality": "excellent",
  "platform": "windows",
  "arch": "amd64",
  "gpuDetected": true,
  "gpuTypes": ["NVIDIA (RTX, GTX)", "CPU Only"],
  "primaryGPU": {
    "name": "NVIDIA GeForce RTX 4070",
    "brand": "nvidia",
    "vramGB": 12.0
  },
  "totalRAMGB": 32.0,
  "availableRAMGB": 24.0,
  "recommendedBackends": ["cuda", "vulkan", "cpu"],
  "supportedBackends": ["cuda", "vulkan", "cpu"],
  "recommendedContextSizes": [8192, 16384, 32768, 65536, 131072],
  "maxRecommendedContextSize": 131072,
  "recommendations": {
    "primaryBackend": "cuda",
    "fallbackBackend": "cpu",
    "suggestedContextSize": 65536,
    "suggestedVRAMAllocation": 9,
    "suggestedRAMAllocation": 16,
    "throughputFirst": true,
    "notes": [
      "Detected cuda with 12.0GB VRAM",
      "Recommended context size: 65536 tokens",
      "Performance priority: Speed (Higher throughput)"
    ]
  },
  "detectionTimestamp": "2024-01-01T12:00:00Z"
}
```

### System Settings

#### Get Settings
**Endpoint:** `GET /api/settings/system`

```bash
curl -X GET http://localhost:5800/api/settings/system
```

**Response:**
```json
{
  "settings": {
    "gpuType": "nvidia",
    "backend": "cuda",
    "vramGB": 12.0,
    "ramGB": 32.0,
    "preferredContext": 65536,
    "throughputFirst": true,
    "enableJinja": true,
    "requireApiKey": false
  }
}
```

#### Save Settings
**Endpoint:** `POST /api/settings/system`

```bash
curl -X POST http://localhost:5800/api/settings/system \
  -H 'Content-Type: application/json' \
  -d '{
    "gpuType": "nvidia",
    "backend": "cuda",
    "vramGB": 12.0,
    "ramGB": 32.0,
    "preferredContext": 65536,
    "throughputFirst": true,
    "enableJinja": true,
    "requireApiKey": true,
    "apiKey": "your-secret-key"
  }'
```

### Server Management

#### Soft Restart
**Endpoint:** `POST /api/server/restart`

Reloads configuration and restarts model processes without killing the main server.

```bash
curl -X POST http://localhost:5800/api/server/restart
```

**Response:**
```json
{
  "message": "Soft restart initiated - reloading config and restarting models",
  "status": "restarting"
}
```

#### Hard Restart
**Endpoint:** `POST /api/server/restart/hard`

Spawns a new server process and exits the current one.

```bash
curl -X POST http://localhost:5800/api/server/restart/hard
```

**Response:**
```json
{
  "message": "Hard restart initiated - spawning new process",
  "status": "restarting"
}
```

---

## Model Management

### Model Status

Access real-time model status through the events endpoint. Models can be in various states:

**States:** `ready`, `starting`, `stopping`, `shutdown`, `stopped`, `unknown`

**Example Model Status:**
```json
[
  {
    "id": "llama-3.2-3b-instruct",
    "name": "Llama 3.2 3B Instruct",
    "description": "Meta's Llama 3.2 3B instruction-tuned model",
    "state": "ready",
    "unlisted": false,
    "proxyUrl": "http://127.0.0.1:8200"
  },
  {
    "id": "nomic-embed-text-v1.5",
    "name": "Nomic Embed Text v1.5",
    "description": "Nomic's embedding model",
    "state": "starting",
    "unlisted": false,
    "proxyUrl": "http://127.0.0.1:8201"
  }
]
```

### Unload All Models

**Endpoint:** `POST /api/models/unload`

```bash
curl -X POST http://localhost:5800/api/models/unload
```

**Response:**
```json
{
  "msg": "ok"
}
```

---

## Download Management

### Model Downloads

#### Start Download
**Endpoint:** `POST /api/models/download`

```bash
curl -X POST http://localhost:5800/api/models/download \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://huggingface.co/microsoft/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    "modelId": "phi-3.5-mini-instruct",
    "filename": "phi-3.5-mini-instruct-q4-k-m.gguf",
    "hfApiKey": "hf_your_token_here"
  }'
```

**Response:**
```json
{
  "downloadId": "download_abc123",
  "status": "download started",
  "modelId": "phi-3.5-mini-instruct",
  "filename": "phi-3.5-mini-instruct-q4-k-m.gguf"
}
```

#### List Downloads
**Endpoint:** `GET /api/models/downloads`

```bash
curl -X GET http://localhost:5800/api/models/downloads
```

**Response:**
```json
{
  "download_abc123": {
    "id": "download_abc123",
    "modelId": "phi-3.5-mini-instruct",
    "filename": "phi-3.5-mini-instruct-q4-k-m.gguf",
    "url": "https://huggingface.co/...",
    "status": "downloading",
    "progress": 45.2,
    "downloadedBytes": 1234567890,
    "totalBytes": 2730000000,
    "speed": "15.2 MB/s",
    "eta": "2m 15s"
  }
}
```

#### Get Download Status
**Endpoint:** `GET /api/models/downloads/:id`

```bash
curl -X GET http://localhost:5800/api/models/downloads/download_abc123
```

#### Pause Download
**Endpoint:** `POST /api/models/downloads/:id/pause`

```bash
curl -X POST http://localhost:5800/api/models/downloads/download_abc123/pause
```

#### Resume Download
**Endpoint:** `POST /api/models/downloads/:id/resume`

```bash
curl -X POST http://localhost:5800/api/models/downloads/download_abc123/resume
```

#### Cancel Download
**Endpoint:** `POST /api/models/download/cancel`

```bash
curl -X POST http://localhost:5800/api/models/download/cancel \
  -H 'Content-Type: application/json' \
  -d '{
    "downloadId": "download_abc123"
  }'
```

### HuggingFace API Key Management

#### Get HF API Key Status
**Endpoint:** `GET /api/settings/hf-api-key`

```bash
curl -X GET http://localhost:5800/api/settings/hf-api-key
```

#### Set HF API Key
**Endpoint:** `POST /api/settings/hf-api-key`

```bash
curl -X POST http://localhost:5800/api/settings/hf-api-key \
  -H 'Content-Type: application/json' \
  -d '{
    "apiKey": "hf_your_token_here"
  }'
```

---

## Configuration Management

### Get Current Configuration

**Endpoint:** `GET /api/config`

```bash
curl -X GET http://localhost:5800/api/config
```

**Response:**
```json
{
  "yaml": "healthCheckTimeout: 300\nlogLevel: info\n...",
  "config": {
    "healthCheckTimeout": 300,
    "logLevel": "info",
    "startPort": 8100,
    "downloadDir": "./downloads",
    "models": {
      "llama-3.2-3b": {
        "name": "Llama 3.2 3B",
        "cmd": "...",
        "proxy": "http://127.0.0.1:${PORT}"
      }
    },
    "groups": {
      "large-models": {
        "exclusive": true,
        "members": ["llama-3.2-3b"],
        "startPort": 8200
      }
    }
  }
}
```

### Update Configuration

**Endpoint:** `POST /api/config`

```bash
curl -X POST http://localhost:5800/api/config \
  -H 'Content-Type: application/json' \
  -d '{
    "yaml": "healthCheckTimeout: 300\nlogLevel: debug\n..."
  }'
```

### Scan Model Folders

**Endpoint:** `POST /api/config/scan-folder`

Scan folders for GGUF models with intelligent detection.

```bash
curl -X POST http://localhost:5800/api/config/scan-folder \
  -H 'Content-Type: application/json' \
  -d '{
    "folderPaths": [
      "C:\\AI\\Models\\Llama",
      "D:\\HuggingFace\\Models"
    ],
    "recursive": true,
    "addToDatabase": true
  }'
```

**Response:**
```json
{
  "models": [
    {
      "modelId": "llama-3.2-3b-instruct",
      "filename": "llama-3.2-3b-instruct-q4-k-m.gguf",
      "name": "Llama 3.2 3B Instruct",
      "size": 2100000000,
      "sizeFormatted": "2.1GB",
      "path": "C:\\AI\\Models\\Llama\\llama-3.2-3b-instruct-q4-k-m.gguf",
      "relativePath": "llama-3.2-3b-instruct-q4-k-m.gguf",
      "quantization": "Q4_K_M",
      "isInstruct": true,
      "isDraft": false,
      "isEmbedding": false,
      "contextLength": 131072,
      "numLayers": 28,
      "isMoE": false
    }
  ],
  "scanSummary": [
    {
      "folder": "C:\\AI\\Models\\Llama",
      "status": "success",
      "models": 5
    }
  ],
  "totalModels": 5,
  "foldersScanned": 1
}
```

### Add Single Model

**Endpoint:** `POST /api/config/append-model`

Add a single model to existing configuration with smart parameter detection.

```bash
curl -X POST http://localhost:5800/api/config/append-model \
  -H 'Content-Type: application/json' \
  -d '{
    "filePath": "C:\\AI\\Models\\phi-3.5-mini-instruct-q4-k-m.gguf",
    "options": {
      "enableJinja": true,
      "throughputFirst": true,
      "minContext": 16384,
      "preferredContext": 32768
    }
  }'
```

**Response:**
```json
{
  "status": "Model successfully appended to config.yaml",
  "modelId": "phi-3.5-mini-instruct",
  "modelInfo": {
    "name": "Phi 3.5 Mini Instruct",
    "size": "2.4GB",
    "quantization": "Q4_K_M",
    "isInstruct": true,
    "isEmbedding": false,
    "contextLength": 131072
  },
  "requiresRestart": true,
  "restartMessage": "New model has been added to configuration. Would you like to restart the server to apply changes?"
}
```

### Update Model Parameters

**Endpoint:** `POST /api/config/model/:id`

Update specific parameters for a model without destroying the configuration structure.

```bash
curl -X POST http://localhost:5800/api/config/model/llama-3.2-3b \
  -H 'Content-Type: application/json' \
  -d '{
    "contextSize": 65536,
    "layers": 999,
    "cacheType": "q4_0",
    "batchSize": 2048
  }'
```

**Response:**
```json
{
  "status": "Model parameters updated successfully",
  "model": "llama-3.2-3b",
  "backup": "config.yaml.backup.1699999999",
  "updated": {
    "contextSize": 65536,
    "layers": 999,
    "cacheType": "q4_0",
    "batchSize": 2048
  },
  "requiresRestart": true,
  "restartMessage": "Model configuration has been updated. Would you like to restart the server to apply changes?"
}
```

### Model Folders Database

#### Get Tracked Folders
**Endpoint:** `GET /api/config/folders`

```bash
curl -X GET http://localhost:5800/api/config/folders
```

**Response:**
```json
{
  "folders": [
    {
      "path": "C:\\AI\\Models",
      "addedAt": "2024-01-01T12:00:00Z",
      "lastScanned": "2024-01-01T13:00:00Z",
      "modelCount": 12,
      "recursive": true,
      "enabled": true
    }
  ],
  "lastScan": "2024-01-01T13:00:00Z",
  "version": "1.0",
  "totalCount": 1
}
```

#### Add Folders to Database
**Endpoint:** `POST /api/config/folders`

```bash
curl -X POST http://localhost:5800/api/config/folders \
  -H 'Content-Type: application/json' \
  -d '{
    "folderPaths": [
      "C:\\AI\\Models\\New",
      "D:\\External\\Models"
    ],
    "recursive": true
  }'
```

#### Remove Folders from Database
**Endpoint:** `DELETE /api/config/folders`

```bash
curl -X DELETE http://localhost:5800/api/config/folders \
  -H 'Content-Type: application/json' \
  -d '{
    "folderPaths": [
      "C:\\AI\\Models\\Old"
    ]
  }'
```

### Regenerate Configuration from Database

**Endpoint:** `POST /api/config/regenerate-from-db`

Regenerate entire configuration using the same logic as CLI autosetup.

```bash
curl -X POST http://localhost:5800/api/config/regenerate-from-db \
  -H 'Content-Type: application/json' \
  -d '{
    "options": {
      "enableJinja": true,
      "throughputFirst": true,
      "minContext": 16384,
      "preferredContext": 65536,
      "forceBackend": "cuda",
      "forceVRAM": 10.0,
      "forceRAM": 24.0
    }
  }'
```

**Response:**
```json
{
  "status": "Configuration regenerated using CLI autosetup function",
  "totalModels": 15,
  "foldersScanned": 3,
  "scanSummary": [
    {
      "folder": "C:\\AI\\Models",
      "status": "success",
      "models": 10
    }
  ],
  "config": "healthCheckTimeout: 300\n...",
  "source": "autosetup.AutoSetupWithOptions() - identical to CLI",
  "primaryFolder": "C:\\AI\\Models",
  "note": "Using same function as CLI for guaranteed consistency",
  "autoRestart": "Soft restart triggered automatically"
}
```

### Smart Generation

**Endpoint:** `POST /api/config/generate-all`

Intelligently generate configuration for all models in tracked folders with system optimization.

```bash
curl -X POST http://localhost:5800/api/config/generate-all \
  -H 'Content-Type: application/json' \
  -d '{
    "folderPath": "C:\\AI\\Models",
    "options": {
      "enableJinja": true,
      "throughputFirst": true,
      "minContext": 16384,
      "preferredContext": 32768,
      "forceBackend": "cuda",
      "forceVRAM": 10.0,
      "forceRAM": 24.0
    }
  }'
```

### Configuration Utilities

#### Validate Configuration
**Endpoint:** `GET /api/config/validate`

```bash
curl -X POST http://localhost:5800/api/config/validate \
  -H 'Content-Type: application/json' \
  -d '{
    "yaml": "healthCheckTimeout: 300\n..."
  }'
```

**Response:**
```json
{
  "valid": true,
  "modelCount": 5,
  "groupCount": 2,
  "macroCount": 2,
  "startPort": 8100,
  "downloadDir": "./downloads"
}
```

#### Validate Models on Disk
**Endpoint:** `POST /api/config/validate-models`

Remove models from configuration if their files no longer exist.

```bash
curl -X POST http://localhost:5800/api/config/validate-models
```

**Response:**
```json
{
  "status": "Config validation completed",
  "removedModels": [
    "missing-model-1 (C:\\Path\\To\\missing.gguf)",
    "missing-model-2 (D:\\Path\\To\\deleted.gguf)"
  ],
  "message": "Removed 2 missing models from config"
}
```

#### Cleanup Duplicates
**Endpoint:** `POST /api/config/cleanup-duplicates`

Remove duplicate models that point to the same file.

```bash
curl -X POST http://localhost:5800/api/config/cleanup-duplicates
```

**Response:**
```json
{
  "message": "Cleanup completed. Removed 3 duplicate models.",
  "duplicatesRemoved": 3,
  "removedModels": ["duplicate-1", "duplicate-2", "duplicate-3"],
  "keptModels": ["original-model"]
}
```

---

## Monitoring & Events

### Real-time Events (Server-Sent Events)

**Endpoint:** `GET /api/events`

Subscribe to real-time server events including model status, logs, metrics, and download progress.

```javascript
const eventSource = new EventSource('/api/events');

eventSource.onmessage = function(event) {
  const envelope = JSON.parse(event.data);
  
  switch(envelope.type) {
    case 'modelStatus':
      const models = JSON.parse(envelope.data);
      console.log('Models:', models);
      break;
      
    case 'logData':
      const logInfo = JSON.parse(envelope.data);
      console.log(`[${logInfo.source}]:`, logInfo.data);
      break;
      
    case 'metrics':
      const metrics = JSON.parse(envelope.data);
      console.log('Metrics:', metrics);
      break;
      
    case 'downloadProgress':
      const downloadInfo = JSON.parse(envelope.data);
      console.log('Download progress:', downloadInfo);
      break;
      
    case 'configProgress':
      const configInfo = JSON.parse(envelope.data);
      console.log('Config generation:', configInfo);
      break;
  }
};
```

### Metrics

**Endpoint:** `GET /api/metrics`

Get current performance metrics in JSON format.

```bash
curl -X GET http://localhost:5800/api/metrics
```

**Response:**
```json
[
  {
    "modelId": "llama-3.2-3b",
    "requestCount": 42,
    "avgResponseTime": 1250,
    "tokensPerSecond": 35.2,
    "lastActivity": "2024-01-01T13:30:00Z",
    "memoryUsage": 2100000000
  }
]
```

### Setup Progress

**Endpoint:** `GET /api/setup/progress`

Monitor configuration generation progress during model setup.

```bash
curl -X GET http://localhost:5800/api/setup/progress
```

**Response:**
```json
{
  "status": "processing",
  "current_step": "Analyzing models",
  "progress": 65.5,
  "total_models": 10,
  "processed_models": 6,
  "current_model": "llama-3.2-3b-instruct",
  "error": null,
  "completed": false,
  "started_at": "2024-01-01T13:00:00Z",
  "updated_at": "2024-01-01T13:02:30Z"
}
```

---

## Binary Management

### Get Binary Status

**Endpoint:** `GET /api/binary/status`

Check the status of the llama-server binary.

```bash
curl -X GET http://localhost:5800/api/binary/status
```

**Response:**
```json
{
  "exists": true,
  "path": "binaries/llama-server/build/bin/llama-server.exe",
  "hasMetadata": true,
  "currentVersion": "b3990",
  "currentType": "cuda",
  "latestVersion": "b4000",
  "optimalType": "cuda",
  "isOptimal": true,
  "isUpToDate": false,
  "updateAvailable": true
}
```

### Update Binary

**Endpoint:** `POST /api/binary/update`

Update the llama-server binary to the latest version.

```bash
curl -X POST http://localhost:5800/api/binary/update
```

**Response:**
```json
{
  "status": "updated",
  "message": "Binary updated successfully",
  "version": "b4000",
  "type": "cuda",
  "path": "binaries/llama-server/build/bin/llama-server.exe",
  "wasForced": false
}
```

### Force Update Binary

**Endpoint:** `POST /api/binary/update/force`

Force update the binary even if it's already up-to-date.

```bash
curl -X POST http://localhost:5800/api/binary/update/force
```

---

## Error Handling

### Standard Error Response

All API endpoints return consistent error responses:

```json
{
  "error": "Descriptive error message",
  "details": "Additional context if available",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

- **200 OK** - Success
- **400 Bad Request** - Invalid request parameters
- **401 Unauthorized** - API key required or invalid
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource already exists
- **500 Internal Server Error** - Server error

### Error Examples

```bash
# Missing required parameter
{
  "error": "folderPath is required"
}

# Authentication required
{
  "error": "API key required or invalid"
}

# Model already exists
{
  "error": "Model already exists in config with ID: llama-3.2-3b",
  "existingModelId": "llama-3.2-3b",
  "filePath": "C:\\Models\\llama.gguf"
}

# File not found
{
  "error": "Model file not found: C:\\Models\\missing.gguf"
}
```

---

## Examples & Use Cases

### Complete Model Setup Workflow

```bash
# 1. Detect system capabilities
curl -X GET http://localhost:5800/api/system/detection

# 2. Configure system settings (one-time)
curl -X POST http://localhost:5800/api/settings/system \
  -H 'Content-Type: application/json' \
  -d '{
    "gpuType": "nvidia",
    "backend": "cuda",
    "vramGB": 12.0,
    "ramGB": 32.0,
    "preferredContext": 65536,
    "throughputFirst": true,
    "enableJinja": true
  }'

# 3. Add model folders to database
curl -X POST http://localhost:5800/api/config/folders \
  -H 'Content-Type: application/json' \
  -d '{
    "folderPaths": ["C:\\AI\\Models"],
    "recursive": true
  }'

# 4. Generate configuration from all tracked folders
curl -X POST http://localhost:5800/api/config/regenerate-from-db \
  -H 'Content-Type: application/json' \
  -d '{
    "options": {
      "enableJinja": true,
      "throughputFirst": true,
      "preferredContext": 65536
    }
  }'

# 5. Monitor setup progress via SSE
# (Server automatically restarts when configuration is complete)

# 6. Use OpenAI-compatible endpoints
curl -X POST http://localhost:5800/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "llama-3.2-3b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Download and Auto-Configure Workflow

```bash
# 1. Start model download
curl -X POST http://localhost:5800/api/models/download \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://huggingface.co/microsoft/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    "modelId": "phi-3.5-mini",
    "filename": "phi-3.5-mini-q4-k-m.gguf"
  }'

# 2. Monitor download progress via SSE
# (Backend automatically adds folder to database and regenerates config when complete)

# 3. Model is automatically available for use
curl -X POST http://localhost:5800/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "phi-3.5-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Configuration Management

```bash
# Add a single model to existing setup
curl -X POST http://localhost:5800/api/config/append-model \
  -H 'Content-Type: application/json' \
  -d '{
    "filePath": "C:\\Models\\new-model.gguf",
    "options": {"enableJinja": true}
  }'

# Update model parameters
curl -X POST http://localhost:5800/api/config/model/new-model \
  -H 'Content-Type: application/json' \
  -d '{
    "contextSize": 32768,
    "layers": 999,
    "batchSize": 1024
  }'

# Soft restart to apply changes
curl -X POST http://localhost:5800/api/server/restart
```

### Monitoring and Maintenance

```bash
# Check system status
curl -X GET http://localhost:5800/api/system/specs
curl -X GET http://localhost:5800/api/metrics

# Validate configuration
curl -X POST http://localhost:5800/api/config/validate-models
curl -X POST http://localhost:5800/api/config/cleanup-duplicates

# Update binary
curl -X POST http://localhost:5800/api/binary/update
```

---

## Integration Examples

### Python Client Example

```python
import requests
import json
from sseclient import SSEClient

class ClaraCoreClient:
    def __init__(self, base_url="http://localhost:5800", api_key=None):
        self.base_url = base_url
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
    
    def chat_completion(self, model, messages, **kwargs):
        """OpenAI-compatible chat completion"""
        data = {
            "model": model,
            "messages": messages,
            **kwargs
        }
        response = requests.post(
            f"{self.base_url}/v1/chat/completions",
            headers=self.headers,
            json=data
        )
        return response.json()
    
    def download_model(self, url, model_id, filename):
        """Start model download"""
        data = {
            "url": url,
            "modelId": model_id,
            "filename": filename
        }
        response = requests.post(
            f"{self.base_url}/api/models/download",
            headers=self.headers,
            json=data
        )
        return response.json()
    
    def monitor_events(self):
        """Monitor real-time events"""
        url = f"{self.base_url}/api/events"
        if "Authorization" in self.headers:
            # Add API key as query param for SSE
            api_key = self.headers["Authorization"].replace("Bearer ", "")
            url += f"?api_key={api_key}"
        
        for event in SSEClient(url):
            if event.data:
                yield json.loads(event.data)

# Usage
client = ClaraCoreClient(api_key="your-api-key")

# Chat with model
response = client.chat_completion(
    model="llama-3.2-3b-instruct",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0.7
)
print(response["choices"][0]["message"]["content"])

# Monitor events
for event in client.monitor_events():
    if event["type"] == "modelStatus":
        models = json.loads(event["data"])
        print(f"Active models: {[m['id'] for m in models if m['state'] == 'ready']}")
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');
const EventSource = require('eventsource');

class ClaraCoreClient {
    constructor(baseUrl = 'http://localhost:5800', apiKey = null) {
        this.baseUrl = baseUrl;
        this.headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            this.headers['Authorization'] = `Bearer ${apiKey}`;
        }
    }

    async chatCompletion(model, messages, options = {}) {
        const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, {
            model,
            messages,
            ...options
        }, { headers: this.headers });
        
        return response.data;
    }

    async downloadModel(url, modelId, filename) {
        const response = await axios.post(`${this.baseUrl}/api/models/download`, {
            url,
            modelId,
            filename
        }, { headers: this.headers });
        
        return response.data;
    }

    monitorEvents(callback) {
        let url = `${this.baseUrl}/api/events`;
        if (this.headers['Authorization']) {
            const apiKey = this.headers['Authorization'].replace('Bearer ', '');
            url += `?api_key=${apiKey}`;
        }

        const eventSource = new EventSource(url);
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            callback(data);
        };
        
        return eventSource;
    }
}

// Usage
const client = new ClaraCoreClient('http://localhost:5800', 'your-api-key');

// Chat completion
client.chatCompletion('llama-3.2-3b-instruct', [
    { role: 'user', content: 'Explain quantum computing' }
], { temperature: 0.7 }).then(response => {
    console.log(response.choices[0].message.content);
});

// Monitor events
const eventSource = client.monitorEvents((event) => {
    if (event.type === 'downloadProgress') {
        const progress = JSON.parse(event.data);
        console.log(`Download progress: ${progress.info.progress}%`);
    }
});
```

---

## Rate Limiting and Best Practices

### API Rate Limiting
- No built-in rate limiting (designed for local use)
- If exposing publicly, use a reverse proxy with rate limiting

### Best Practices

1. **Use System Detection** before first-time setup
2. **Save System Settings** to persist preferences across regenerations
3. **Monitor Events** for real-time status updates
4. **Validate Configurations** after manual edits
5. **Use Folder Database** for automatic model management
6. **Implement Proper Error Handling** in your applications

### Performance Tips

1. **Enable Jinja** for better prompt processing
2. **Use Throughput First** for speed over quality when appropriate
3. **Set Optimal Context Size** based on your use case and available VRAM
4. **Monitor Metrics** to optimize performance
5. **Use Model Groups** to manage resource allocation

---

This comprehensive API documentation covers all available endpoints in ClaraCore. The API provides both OpenAI compatibility for easy integration and powerful configuration management for advanced users.