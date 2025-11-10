/**
 * ClaraVerse Agent Runner - Validation Middleware
 * Request validation and input sanitization
 */

import { validateInputs } from '../schema-generator.js';
import config from '../config.js';

/**
 * Validate workflow execution inputs
 * Checks inputs against the workflow's generated schema
 */
export function validateExecutionInputs(req, res, next) {
  try {
    const inputs = req.body;
    const workflow = req.workflow;

    if (!workflow) {
      return res.status(500).json({
        success: false,
        error: 'Workflow not found in request context',
        timestamp: new Date().toISOString(),
      });
    }

    // Get schema from workflow
    const schema = workflow.schema_json?.input || workflow.schema_json;

    if (!schema) {
      // No schema defined, allow any inputs
      return next();
    }

    // Validate inputs
    const validation = validateInputs(inputs, schema);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Input validation failed',
        validationErrors: validation.errors,
        schema: schema.properties || schema,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (error) {
    console.error('❌ Validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Validation failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Validate request body size
 */
export function validateBodySize(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSize = config.execution.maxInputSize;

  if (contentLength > maxSize) {
    return res.status(413).json({
      success: false,
      error: 'Request body too large',
      message: `Maximum allowed size is ${maxSize} bytes (${(maxSize / 1024 / 1024).toFixed(2)}MB)`,
      receivedSize: contentLength,
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

/**
 * Validate deploy request
 */
export function validateDeployRequest(req, res, next) {
  const { workflow, name, slug, description } = req.body;
  const errors = [];

  // Validate workflow
  if (!workflow) {
    errors.push('workflow is required');
  } else {
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push('workflow.nodes must be an array');
    }
    if (!workflow.connections && !workflow.edges) {
      errors.push('workflow must have connections or edges');
    }
  }

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  } else if (name.length > 255) {
    errors.push('name must be 255 characters or less');
  }

  // Validate slug if provided
  if (slug !== undefined) {
    if (typeof slug !== 'string') {
      errors.push('slug must be a string');
    } else if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      errors.push('slug must contain only lowercase letters, numbers, and hyphens');
    } else if (slug.length > 255) {
      errors.push('slug must be 255 characters or less');
    }
  }

  // Validate description if provided
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('description must be a string');
    } else if (description.length > 5000) {
      errors.push('description must be 5000 characters or less');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      validationErrors: errors,
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

/**
 * Sanitize inputs
 * Remove potentially dangerous content from string inputs
 */
export function sanitizeInputs(req, res, next) {
  const inputs = req.body;

  if (typeof inputs === 'object' && inputs !== null) {
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string') {
        // Remove null bytes
        inputs[key] = value.replace(/\0/g, '');

        // Trim excessive whitespace (but preserve intentional formatting)
        if (inputs[key].length > 1000000) {
          // For very large strings (>1MB), check if it's mostly whitespace
          const nonWhitespaceRatio = (inputs[key].replace(/\s/g, '').length / inputs[key].length);
          if (nonWhitespaceRatio < 0.1) {
            // More than 90% whitespace - probably an attack
            return res.status(400).json({
              success: false,
              error: 'Input validation failed',
              message: `Field '${key}' contains excessive whitespace`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  next();
}

/**
 * Validate pagination parameters
 */
export function validatePagination(req, res, next) {
  const { limit, offset } = req.query;
  const errors = [];

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1) {
      errors.push('limit must be a positive integer');
    } else if (limitNum > 1000) {
      errors.push('limit must be 1000 or less');
    }
    req.query.limit = limitNum;
  }

  if (offset !== undefined) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      errors.push('offset must be a non-negative integer');
    }
    req.query.offset = offsetNum;
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      validationErrors: errors,
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

/**
 * Validate UUID format
 */
export function validateUUID(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(value)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid UUID format',
        message: `Parameter '${paramName}' must be a valid UUID`,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
}

/**
 * Validate slug format
 */
export function validateSlugFormat(paramName = 'slug') {
  return (req, res, next) => {
    const value = req.params[paramName];
    const slugRegex = /^[a-z0-9-]+$/;

    if (!slugRegex.test(value)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid slug format',
        message: `Parameter '${paramName}' must contain only lowercase letters, numbers, and hyphens`,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
}

export default {
  validateExecutionInputs,
  validateBodySize,
  validateDeployRequest,
  sanitizeInputs,
  validatePagination,
  validateUUID,
  validateSlugFormat,
};
