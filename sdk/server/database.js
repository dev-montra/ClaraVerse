/**
 * ClaraVerse Agent Runner - Database Module
 * PostgreSQL database operations for workflow deployment and execution tracking
 */

import pkg from 'pg';
const { Pool } = pkg;
import crypto from 'crypto';
import config from './config.js';

// Create connection pool
const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.pool.min,
  max: config.database.pool.max,
  ssl: config.database.ssl,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('🚨 Unexpected database error:', err);
});

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return { success: true, time: result.rows[0].now };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate API key
 */
export function generateApiKey() {
  const randomBytes = crypto.randomBytes(config.security.apiKeyLength);
  return config.security.apiKeyPrefix + randomBytes.toString('hex');
}

/**
 * Hash API key for storage
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify API key against hash
 */
export function verifyApiKey(apiKey, hash) {
  return hashApiKey(apiKey) === hash;
}

// ====================
// Deployed Workflows
// ====================

/**
 * Create a new deployed workflow
 */
export async function createDeployedWorkflow({
  name,
  slug,
  description = null,
  workflowJson,
  schemaJson,
  userId = null,
  apiKey = null,
}) {
  const client = await pool.connect();
  try {
    // Generate API key if not provided
    const generatedApiKey = apiKey || generateApiKey();
    const apiKeyHash = hashApiKey(generatedApiKey);

    const query = `
      INSERT INTO deployed_workflows
        (name, slug, description, workflow_json, schema_json, user_id, api_key_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, slug, description, schema_json, created_at, updated_at
    `;

    const values = [
      name,
      slug,
      description,
      JSON.stringify(workflowJson),
      JSON.stringify(schemaJson),
      userId,
      apiKeyHash,
    ];

    const result = await client.query(query, values);
    const workflow = result.rows[0];

    // Return workflow with API key (only time it's visible)
    return {
      ...workflow,
      apiKey: generatedApiKey,
      workflow_json: workflowJson,
      schema_json: schemaJson,
    };
  } finally {
    client.release();
  }
}

/**
 * Get deployed workflow by slug
 */
export async function getDeployedWorkflowBySlug(slug) {
  const query = `
    SELECT id, name, slug, description, workflow_json, schema_json,
           user_id, api_key_hash, is_active, execution_count,
           last_executed_at, created_at, updated_at
    FROM deployed_workflows
    WHERE slug = $1 AND is_active = true
  `;

  const result = await pool.query(query, [slug]);
  if (result.rows.length === 0) {
    return null;
  }

  const workflow = result.rows[0];
  return {
    ...workflow,
    workflow_json: workflow.workflow_json,
    schema_json: workflow.schema_json,
  };
}

/**
 * Get deployed workflow by ID
 */
export async function getDeployedWorkflowById(id) {
  const query = `
    SELECT id, name, slug, description, workflow_json, schema_json,
           user_id, api_key_hash, is_active, execution_count,
           last_executed_at, created_at, updated_at
    FROM deployed_workflows
    WHERE id = $1 AND is_active = true
  `;

  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) {
    return null;
  }

  const workflow = result.rows[0];
  return {
    ...workflow,
    workflow_json: workflow.workflow_json,
    schema_json: workflow.schema_json,
  };
}

/**
 * Get all deployed workflows (optionally filtered by user)
 */
export async function getAllDeployedWorkflows(userId = null, options = {}) {
  const { limit = 100, offset = 0, includeInactive = false } = options;

  let query = `
    SELECT id, name, slug, description, schema_json, user_id,
           is_active, execution_count, last_executed_at, created_at, updated_at
    FROM deployed_workflows
    WHERE 1=1
  `;

  const values = [];
  let paramCounter = 1;

  if (userId) {
    query += ` AND user_id = $${paramCounter}`;
    values.push(userId);
    paramCounter++;
  }

  if (!includeInactive) {
    query += ` AND is_active = true`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  return result.rows.map(row => ({
    ...row,
    schema_json: row.schema_json,
  }));
}

/**
 * Update deployed workflow
 */
export async function updateDeployedWorkflow(id, updates) {
  const allowedFields = ['name', 'description', 'workflow_json', 'schema_json', 'is_active'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClause = fields.map((field, idx) => {
    const value = updates[field];
    if (field === 'workflow_json' || field === 'schema_json') {
      return `${field} = $${idx + 2}`;
    }
    return `${field} = $${idx + 2}`;
  }).join(', ');

  const values = [id, ...fields.map(f => {
    const value = updates[f];
    if (f === 'workflow_json' || f === 'schema_json') {
      return JSON.stringify(value);
    }
    return value;
  })];

  const query = `
    UPDATE deployed_workflows
    SET ${setClause}
    WHERE id = $1
    RETURNING id, name, slug, description, schema_json, is_active, updated_at
  `;

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * Delete (deactivate) deployed workflow
 */
export async function deleteDeployedWorkflow(id) {
  const query = `
    UPDATE deployed_workflows
    SET is_active = false
    WHERE id = $1
    RETURNING id, slug
  `;

  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/**
 * Increment execution count
 */
export async function incrementExecutionCount(workflowId) {
  const query = `
    UPDATE deployed_workflows
    SET execution_count = execution_count + 1,
        last_executed_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `;

  await pool.query(query, [workflowId]);
}

// ====================
// Workflow Executions
// ====================

/**
 * Create workflow execution record
 */
export async function createWorkflowExecution({
  workflowId,
  inputs,
  outputs = null,
  status = 'running',
  errorMessage = null,
  durationMs = null,
}) {
  const query = `
    INSERT INTO workflow_executions
      (workflow_id, inputs, outputs, status, error_message, duration_ms)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, workflow_id, status, created_at
  `;

  const values = [
    workflowId,
    JSON.stringify(inputs),
    outputs ? JSON.stringify(outputs) : null,
    status,
    errorMessage,
    durationMs,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Update workflow execution
 */
export async function updateWorkflowExecution(id, updates) {
  const { outputs, status, errorMessage, durationMs } = updates;

  const query = `
    UPDATE workflow_executions
    SET
      outputs = COALESCE($2, outputs),
      status = COALESCE($3, status),
      error_message = COALESCE($4, error_message),
      duration_ms = COALESCE($5, duration_ms)
    WHERE id = $1
    RETURNING id, workflow_id, status, duration_ms
  `;

  const values = [
    id,
    outputs ? JSON.stringify(outputs) : null,
    status,
    errorMessage,
    durationMs,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Get workflow execution history
 */
export async function getWorkflowExecutions(workflowId, options = {}) {
  const { limit = 50, offset = 0, status = null } = options;

  let query = `
    SELECT id, workflow_id, inputs, outputs, status, error_message,
           duration_ms, created_at
    FROM workflow_executions
    WHERE workflow_id = $1
  `;

  const values = [workflowId];
  let paramCounter = 2;

  if (status) {
    query += ` AND status = $${paramCounter}`;
    values.push(status);
    paramCounter++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  return result.rows.map(row => ({
    ...row,
    inputs: row.inputs,
    outputs: row.outputs,
  }));
}

/**
 * Get deployment statistics
 */
export async function getDeploymentStats(workflowId = null) {
  let query = `
    SELECT * FROM deployment_stats
  `;

  if (workflowId) {
    query += ` WHERE id = $1`;
    const result = await pool.query(query, [workflowId]);
    return result.rows[0] || null;
  }

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Cleanup old executions
 */
export async function cleanupOldExecutions(daysToKeep = 30) {
  const query = `SELECT cleanup_old_executions($1)`;
  const result = await pool.query(query, [daysToKeep]);
  return result.rows[0].cleanup_old_executions;
}

// ====================
// API Key Management
// ====================

/**
 * Verify API key and get associated workflow
 */
export async function verifyWorkflowApiKey(apiKey) {
  const hash = hashApiKey(apiKey);

  const query = `
    SELECT id, name, slug, workflow_json, schema_json, is_active
    FROM deployed_workflows
    WHERE api_key_hash = $1 AND is_active = true
  `;

  const result = await pool.query(query, [hash]);
  if (result.rows.length === 0) {
    return null;
  }

  const workflow = result.rows[0];
  return {
    ...workflow,
    workflow_json: workflow.workflow_json,
    schema_json: workflow.schema_json,
  };
}

/**
 * Regenerate API key for workflow
 */
export async function regenerateApiKey(workflowId) {
  const newApiKey = generateApiKey();
  const apiKeyHash = hashApiKey(newApiKey);

  const query = `
    UPDATE deployed_workflows
    SET api_key_hash = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND is_active = true
    RETURNING id, slug
  `;

  const result = await pool.query(query, [apiKeyHash, workflowId]);
  if (result.rows.length === 0) {
    return null;
  }

  return {
    ...result.rows[0],
    apiKey: newApiKey,
  };
}

// ====================
// Utilities
// ====================

/**
 * Check if slug is available
 */
export async function isSlugAvailable(slug) {
  const query = `
    SELECT COUNT(*) as count
    FROM deployed_workflows
    WHERE slug = $1
  `;

  const result = await pool.query(query, [slug]);
  return parseInt(result.rows[0].count) === 0;
}

/**
 * Generate unique slug from name
 */
export async function generateUniqueSlug(name) {
  // Convert to slug format
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Check if available
  if (await isSlugAvailable(slug)) {
    return slug;
  }

  // Add number suffix if taken
  let counter = 1;
  let uniqueSlug = `${slug}-${counter}`;
  while (!(await isSlugAvailable(uniqueSlug))) {
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }

  return uniqueSlug;
}

/**
 * Close database pool (for graceful shutdown)
 */
export async function closePool() {
  await pool.end();
}

export default {
  testConnection,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  createDeployedWorkflow,
  getDeployedWorkflowBySlug,
  getDeployedWorkflowById,
  getAllDeployedWorkflows,
  updateDeployedWorkflow,
  deleteDeployedWorkflow,
  incrementExecutionCount,
  createWorkflowExecution,
  updateWorkflowExecution,
  getWorkflowExecutions,
  getDeploymentStats,
  cleanupOldExecutions,
  verifyWorkflowApiKey,
  regenerateApiKey,
  isSlugAvailable,
  generateUniqueSlug,
  closePool,
};
