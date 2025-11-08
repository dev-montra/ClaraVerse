/**
 * ClaraVerse Agent Runner - Authentication Middleware
 * API key validation for deployed workflows
 */

import { verifyWorkflowApiKey } from '../database.js';

/**
 * Authentication middleware - validates API key from Authorization header
 * Attaches workflow info to req.workflow if valid
 */
export async function authenticateApiKey(req, res, next) {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Missing Authorization header',
        message: 'Please provide an API key in the Authorization header: Bearer clara_sk_...',
        timestamp: new Date().toISOString(),
      });
    }

    // Support both "Bearer token" and raw token formats
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!apiKey || !apiKey.startsWith('clara_sk_')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key format',
        message: 'API key must start with clara_sk_',
        timestamp: new Date().toISOString(),
      });
    }

    // Verify API key and get associated workflow
    const workflow = await verifyWorkflowApiKey(apiKey);

    if (!workflow) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is not valid or the workflow is inactive',
        timestamp: new Date().toISOString(),
      });
    }

    // Attach workflow to request for use in route handlers
    req.workflow = workflow;
    req.apiKey = apiKey;

    next();
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Optional authentication - doesn't fail if no API key, but validates if present
 * Used for endpoints that support both authenticated and unauthenticated access
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No auth header - proceed without authentication
      return next();
    }

    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (apiKey && apiKey.startsWith('clara_sk_')) {
      // Verify API key if provided
      const workflow = await verifyWorkflowApiKey(apiKey);

      if (workflow) {
        req.workflow = workflow;
        req.apiKey = apiKey;
        req.authenticated = true;
      } else {
        req.authenticated = false;
      }
    }

    next();
  } catch (error) {
    console.error('❌ Optional authentication error:', error);
    next(); // Don't block on error for optional auth
  }
}

/**
 * Verify workflow ownership
 * Checks if the authenticated workflow matches the requested workflow slug/ID
 */
export function verifyWorkflowOwnership(req, res, next) {
  const requestedSlug = req.params.slug || req.params.id;

  if (!req.workflow) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.workflow.slug !== requestedSlug && req.workflow.id !== requestedSlug) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      message: 'API key does not have permission to access this workflow',
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

export default {
  authenticateApiKey,
  optionalAuth,
  verifyWorkflowOwnership,
};
