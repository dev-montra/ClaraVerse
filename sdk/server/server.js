/**
 * ClaraVerse Agent Runner - Main Server
 * REST API for deploying and executing agent workflows
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import config, { validateConfig, getConfigSummary } from './config.js';
import * as db from './database.js';
import { generateOpenAPISchema, generateSimpleSchema } from './schema-generator.js';
import { createExecutor } from './workflow-executor.js';
import { authenticateApiKey, optionalAuth } from './middleware/auth.js';
import {
  validateDeployRequest,
  validateExecutionInputs,
  validateBodySize,
  sanitizeInputs,
  validatePagination,
  validateUUID,
  validateSlugFormat,
} from './middleware/validation.js';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate configuration on startup
try {
  validateConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
  process.exit(1);
}

// Initialize Express app
const app = express();

// Trust proxy if configured (for rate limiting behind reverse proxy)
if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

// ====================
// Middleware
// ====================

// CORS
app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting (if enabled)
if (config.rateLimit.enabled) {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: 'Too many requests',
      message: `Rate limit exceeded. Please try again later.`,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/workflows/:slug/execute', limiter);
  console.log(`🚦 Rate limiting enabled: ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs}ms`);
}

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ====================
// Health & Info Endpoints
// ====================

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  const dbStatus = await db.testConnection();

  res.json({
    status: dbStatus.success ? 'healthy' : 'degraded',
    service: 'Clara Agent Runner',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: dbStatus.success ? 'connected' : 'disconnected',
    config: getConfigSummary(),
  });
});

/**
 * Dashboard - Web UI for managing workflows
 */
app.get(['/', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/**
 * Service information endpoint
 */
app.get('/api/info', (req, res) => {
  res.json({
    service: 'Clara Agent Runner API',
    version: '1.0.0',
    description: 'Deploy and execute Clara workflows as REST APIs',
    features: [
      'Workflow deployment with auto-generated schemas',
      'Dynamic API endpoint creation',
      'OpenAPI 3.0 documentation',
      'Input/output validation',
      'Execution tracking and logging',
      'Rate limiting and authentication',
    ],
    endpoints: {
      'POST /api/deploy': 'Deploy a new workflow',
      'GET /api/deployments': 'List all deployed workflows',
      'GET /api/workflows/:slug': 'Get workflow details',
      'GET /api/workflows/:slug/schema': 'Get OpenAPI schema',
      'GET /api/workflows/:slug/docs': 'Interactive API documentation',
      'POST /api/workflows/:slug/execute': 'Execute workflow',
      'GET /api/workflows/:slug/executions': 'Get execution history',
      'DELETE /api/workflows/:id': 'Delete (deactivate) workflow',
      'POST /api/workflows/:id/regenerate-key': 'Regenerate API key',
      'GET /health': 'Health check',
      'GET /api/info': 'Service information',
    },
    documentation: `${config.server.baseUrl}/api/docs`,
  });
});

// ====================
// Deployment Endpoints
// ====================

/**
 * Deploy a new workflow
 * Creates a deployed workflow and returns endpoint URL + API key
 */
app.post('/api/deploy',
  validateBodySize,
  validateDeployRequest,
  async (req, res) => {
    try {
      const { workflow, name, slug, description, userId } = req.body;

      // Generate slug if not provided
      const finalSlug = slug || await db.generateUniqueSlug(name);

      // Check if slug is available
      if (!(await db.isSlugAvailable(finalSlug))) {
        return res.status(400).json({
          success: false,
          error: 'Slug already in use',
          message: `The slug '${finalSlug}' is already taken. Please choose a different name or slug.`,
          timestamp: new Date().toISOString(),
        });
      }

      // Generate schemas
      const simpleSchema = generateSimpleSchema(workflow);
      const openApiSchema = generateOpenAPISchema(workflow, finalSlug, config.server.baseUrl);

      // Create deployed workflow in database
      const deployed = await db.createDeployedWorkflow({
        name,
        slug: finalSlug,
        description,
        workflowJson: workflow,
        schemaJson: {
          ...simpleSchema,
          openapi: openApiSchema,
        },
        userId,
      });

      res.status(201).json({
        success: true,
        deployment: {
          id: deployed.id,
          name: deployed.name,
          slug: deployed.slug,
          description: deployed.description,
          endpoint: `${config.server.baseUrl}/api/workflows/${deployed.slug}/execute`,
          apiKey: deployed.apiKey, // Only shown once!
          schema: simpleSchema,
          docs: `${config.server.baseUrl}/api/workflows/${deployed.slug}/docs`,
          createdAt: deployed.created_at,
        },
        message: 'Workflow deployed successfully. Save the API key - it will not be shown again!',
      });
    } catch (error) {
      console.error('❌ Deployment error:', error);
      res.status(500).json({
        success: false,
        error: 'Deployment failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * List all deployed workflows
 */
app.get('/api/deployments',
  validatePagination,
  async (req, res) => {
    try {
      const { userId } = req.query;
      const limit = req.query.limit || 100;
      const offset = req.query.offset || 0;

      const deployments = await db.getAllDeployedWorkflows(userId, { limit, offset });

      res.json({
        success: true,
        deployments: deployments.map(d => ({
          id: d.id,
          name: d.name,
          slug: d.slug,
          description: d.description,
          endpoint: `${config.server.baseUrl}/api/workflows/${d.slug}/execute`,
          executionCount: d.execution_count,
          lastExecuted: d.last_executed_at,
          createdAt: d.created_at,
          isActive: d.is_active,
        })),
        pagination: {
          limit,
          offset,
          hasMore: deployments.length === limit,
        },
      });
    } catch (error) {
      console.error('❌ List deployments error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list deployments',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ====================
// Workflow Info Endpoints
// ====================

/**
 * Get workflow details by slug
 */
app.get('/api/workflows/:slug',
  validateSlugFormat('slug'),
  async (req, res) => {
    try {
      const { slug } = req.params;
      const workflow = await db.getDeployedWorkflowBySlug(slug);

      if (!workflow) {
        return res.status(404).json({
          success: false,
          error: 'Workflow not found',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          slug: workflow.slug,
          description: workflow.description,
          endpoint: `${config.server.baseUrl}/api/workflows/${workflow.slug}/execute`,
          schema: workflow.schema_json,
          executionCount: workflow.execution_count,
          lastExecuted: workflow.last_executed_at,
          createdAt: workflow.created_at,
          updatedAt: workflow.updated_at,
        },
      });
    } catch (error) {
      console.error('❌ Get workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get workflow',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Get OpenAPI schema for workflow
 */
app.get('/api/workflows/:slug/schema',
  validateSlugFormat('slug'),
  async (req, res) => {
    try {
      const { slug } = req.params;
      const workflow = await db.getDeployedWorkflowBySlug(slug);

      if (!workflow) {
        return res.status(404).json({
          success: false,
          error: 'Workflow not found',
          timestamp: new Date().toISOString(),
        });
      }

      // Return OpenAPI schema
      const openApiSchema = workflow.schema_json?.openapi ||
        generateOpenAPISchema(workflow.workflow_json, workflow.slug, config.server.baseUrl);

      res.json(openApiSchema);
    } catch (error) {
      console.error('❌ Get schema error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get schema',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Interactive API documentation (Swagger UI)
 */
app.get('/api/workflows/:slug/docs',
  validateSlugFormat('slug'),
  async (req, res) => {
    try {
      const { slug } = req.params;
      const workflow = await db.getDeployedWorkflowBySlug(slug);

      if (!workflow) {
        return res.status(404).send('<h1>Workflow not found</h1>');
      }

      const schemaUrl = `${config.server.baseUrl}/api/workflows/${slug}/schema`;

      // Simple Swagger UI HTML
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${workflow.name} - API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '${schemaUrl}',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>
      `;

      res.send(html);
    } catch (error) {
      console.error('❌ Get docs error:', error);
      res.status(500).send('<h1>Error loading documentation</h1>');
    }
  }
);

// ====================
// Execution Endpoints
// ====================

/**
 * Execute workflow
 * Main endpoint for workflow execution with authentication
 */
app.post('/api/workflows/:slug/execute',
  validateSlugFormat('slug'),
  authenticateApiKey,
  validateBodySize,
  sanitizeInputs,
  validateExecutionInputs,
  async (req, res) => {
    const executionId = null;
    const startTime = Date.now();

    try {
      const inputs = req.body;
      const workflow = req.workflow;

      console.log(`📋 Executing workflow: ${workflow.name} (${workflow.slug})`);

      // Create execution record
      const execution = await db.createWorkflowExecution({
        workflowId: workflow.id,
        inputs,
        status: 'running',
      });

      // Execute workflow
      const executor = createExecutor({
        enableLogging: config.execution.enableLogging,
        timeout: config.execution.maxExecutionTime,
      });

      const result = await executor.execute(workflow, inputs);

      const duration = Date.now() - startTime;

      // Update execution record
      await db.updateWorkflowExecution(execution.id, {
        outputs: result.outputs,
        status: result.success ? 'success' : 'error',
        errorMessage: result.error || null,
        durationMs: duration,
      });

      // Increment workflow execution count
      await db.incrementExecutionCount(workflow.id);

      if (result.success) {
        res.json({
          success: true,
          outputs: result.outputs,
          metadata: {
            ...result.metadata,
            executionId: execution.id,
            workflow: {
              id: workflow.id,
              name: workflow.name,
              slug: workflow.slug,
            },
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          logs: result.logs,
          metadata: {
            ...result.metadata,
            executionId: execution.id,
          },
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Execution error:', error);

      // Update execution record if created
      if (executionId) {
        await db.updateWorkflowExecution(executionId, {
          status: 'error',
          errorMessage: error.message,
          durationMs: duration,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Execution failed',
        message: error.message,
        metadata: {
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * Get workflow execution history
 */
app.get('/api/workflows/:slug/executions',
  validateSlugFormat('slug'),
  authenticateApiKey,
  validatePagination,
  async (req, res) => {
    try {
      const workflow = req.workflow;
      const limit = req.query.limit || 50;
      const offset = req.query.offset || 0;
      const status = req.query.status;

      const executions = await db.getWorkflowExecutions(workflow.id, {
        limit,
        offset,
        status,
      });

      res.json({
        success: true,
        executions: executions.map(e => ({
          id: e.id,
          inputs: e.inputs,
          outputs: e.outputs,
          status: e.status,
          error: e.error_message,
          duration: `${e.duration_ms}ms`,
          createdAt: e.created_at,
        })),
        pagination: {
          limit,
          offset,
          hasMore: executions.length === limit,
        },
      });
    } catch (error) {
      console.error('❌ Get executions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get executions',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ====================
// Management Endpoints
// ====================

/**
 * Delete (deactivate) deployed workflow
 */
app.delete('/api/workflows/:id',
  validateUUID('id'),
  authenticateApiKey,
  async (req, res) => {
    try {
      const { id } = req.params;
      const workflow = req.workflow;

      // Verify ownership
      if (workflow.id !== id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to delete this workflow',
          timestamp: new Date().toISOString(),
        });
      }

      const deleted = await db.deleteDeployedWorkflow(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Workflow not found',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: 'Workflow deleted successfully',
        workflow: {
          id: deleted.id,
          slug: deleted.slug,
        },
      });
    } catch (error) {
      console.error('❌ Delete workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete workflow',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Regenerate API key for workflow
 */
app.post('/api/workflows/:id/regenerate-key',
  validateUUID('id'),
  authenticateApiKey,
  async (req, res) => {
    try {
      const { id } = req.params;
      const workflow = req.workflow;

      // Verify ownership
      if (workflow.id !== id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have permission to regenerate the API key for this workflow',
          timestamp: new Date().toISOString(),
        });
      }

      const result = await db.regenerateApiKey(id);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Workflow not found',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: 'API key regenerated successfully. Save it - it will not be shown again!',
        workflow: {
          id: result.id,
          slug: result.slug,
          apiKey: result.apiKey,
        },
      });
    } catch (error) {
      console.error('❌ Regenerate key error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to regenerate API key',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ====================
// Error Handling
// ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.path} does not exist`,
    availableEndpoints: '/api/info',
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: config.server.env === 'development' ? error.message : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
});

// ====================
// Server Startup
// ====================

/**
 * Start server
 */
async function startServer() {
  try {
    // Test database connection
    console.log('🔌 Connecting to database...');
    const dbStatus = await db.testConnection();
    if (!dbStatus.success) {
      throw new Error(`Database connection failed: ${dbStatus.error}`);
    }
    console.log('✅ Database connected successfully');

    // Start HTTP server
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log('');
      console.log('🚀 Clara Agent Runner Server Started');
      console.log('═══════════════════════════════════════════════');
      console.log(`📍 Server URL:    ${config.server.baseUrl}`);
      console.log(`🏥 Health Check:  ${config.server.baseUrl}/health`);
      console.log(`📖 API Info:      ${config.server.baseUrl}/api/info`);
      console.log(`🌍 Environment:   ${config.server.env}`);
      console.log('═══════════════════════════════════════════════');
      console.log('');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('🛑 SIGTERM received, shutting down gracefully...');
      server.close(async () => {
        await db.closePool();
        console.log('✅ Server shut down successfully');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('\n🛑 SIGINT received, shutting down gracefully...');
      server.close(async () => {
        await db.closePool();
        console.log('✅ Server shut down successfully');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;
