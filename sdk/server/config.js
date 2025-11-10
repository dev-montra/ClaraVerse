/**
 * ClaraVerse Agent Runner - Configuration
 * Centralized configuration management with environment variables
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0',
    baseUrl: process.env.BASE_URL || `http://localhost:${parseInt(process.env.PORT) || 3000}`,
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://clara:clara123@localhost:5432/clara_workflows',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      max: parseInt(process.env.DB_POOL_MAX) || 10,
    },
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false,
  },

  // External Services (for workflow nodes)
  services: {
    comfyui: {
      url: process.env.COMFYUI_URL || 'http://localhost:8188',
      enabled: process.env.COMFYUI_ENABLED !== 'false',
    },
    pythonBackend: {
      url: process.env.PYTHON_BACKEND_URL || 'http://localhost:5001',
      enabled: process.env.PYTHON_BACKEND_ENABLED !== 'false',
    },
    claraAssistant: {
      url: process.env.CLARA_ASSISTANT_URL || 'http://localhost:8069',
      enabled: process.env.CLARA_ASSISTANT_ENABLED !== 'false',
    },
    ollama: {
      url: process.env.OLLAMA_URL || 'http://localhost:11434',
      enabled: process.env.OLLAMA_ENABLED !== 'false',
    },
  },

  // API Keys (for AI services)
  apiKeys: {
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    openrouter: process.env.OPENROUTER_API_KEY || '',
  },

  // Workflow Execution Limits
  execution: {
    maxExecutionTime: parseInt(process.env.MAX_EXECUTION_TIME) || 300000, // 5 minutes
    maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS) || 10,
    maxInputSize: parseInt(process.env.MAX_INPUT_SIZE) || 10485760, // 10MB
    maxOutputSize: parseInt(process.env.MAX_OUTPUT_SIZE) || 10485760, // 10MB
    enableLogging: process.env.ENABLE_EXECUTION_LOGGING !== 'false',
  },

  // Rate Limiting
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000, // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // Security
  security: {
    apiKeyPrefix: 'clara_sk_',
    apiKeyLength: 32,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
    trustProxy: process.env.TRUST_PROXY === 'true',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY === 'true',
  },

  // Cleanup and Maintenance
  maintenance: {
    cleanupOldExecutions: process.env.CLEANUP_OLD_EXECUTIONS === 'true',
    executionRetentionDays: parseInt(process.env.EXECUTION_RETENTION_DAYS) || 30,
  },
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const errors = [];

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (config.execution.maxExecutionTime < 1000) {
    errors.push('MAX_EXECUTION_TIME must be at least 1000ms');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

/**
 * Get configuration summary (safe for logging)
 */
export function getConfigSummary() {
  return {
    server: {
      port: config.server.port,
      env: config.server.env,
      baseUrl: config.server.baseUrl,
    },
    database: {
      host: config.database.url.split('@')[1]?.split('/')[0] || 'configured',
      ssl: !!config.database.ssl,
    },
    services: Object.keys(config.services).reduce((acc, key) => {
      acc[key] = config.services[key].enabled ? 'enabled' : 'disabled';
      return acc;
    }, {}),
    apiKeys: Object.keys(config.apiKeys).reduce((acc, key) => {
      acc[key] = config.apiKeys[key] ? 'configured' : 'not set';
      return acc;
    }, {}),
    execution: {
      maxExecutionTime: `${config.execution.maxExecutionTime}ms`,
      maxConcurrentExecutions: config.execution.maxConcurrentExecutions,
    },
    rateLimit: {
      enabled: config.rateLimit.enabled,
      maxRequests: config.rateLimit.maxRequests,
    },
  };
}

export default config;
