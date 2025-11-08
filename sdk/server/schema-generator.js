/**
 * ClaraVerse Agent Runner - Schema Generator
 * Auto-generates OpenAPI 3.0 schemas from workflow input/output nodes
 */

/**
 * Node type to JSON schema type mapping
 */
const NODE_TYPE_MAPPINGS = {
  // Input nodes
  'input': {
    text: { type: 'string', description: 'Text input' },
    number: { type: 'number', description: 'Number input' },
    json: { type: 'object', description: 'JSON object input' },
  },
  'image-input': {
    type: 'string',
    format: 'base64',
    description: 'Base64 encoded image data (supports png, jpg, jpeg, gif, webp)',
    example: 'data:image/png;base64,iVBORw0KG...',
  },
  'pdf-input': {
    type: 'string',
    format: 'binary',
    description: 'PDF file content or base64 encoded PDF',
  },
  'file-upload': {
    type: 'string',
    format: 'binary',
    description: 'File upload content (base64 encoded)',
  },
  // Output nodes
  'output': {
    type: 'string',
    description: 'Workflow output',
  },
};

/**
 * Extract input schema from workflow nodes
 * @param {Object} workflow - Workflow JSON
 * @returns {Object} - Input schema definition
 */
export function extractInputSchema(workflow) {
  const inputs = {};
  const required = [];

  // Find all input-type nodes
  const inputNodes = workflow.nodes.filter(node =>
    ['input', 'image-input', 'pdf-input', 'file-upload'].includes(node.type)
  );

  for (const node of inputNodes) {
    const nodeType = node.type;
    const nodeData = node.data || {};

    // Generate field name from node label or ID
    const fieldName = generateFieldName(nodeData.label || nodeData.inputLabel || node.id);

    // Get schema for this node type
    let schema;
    if (nodeType === 'input') {
      const inputType = nodeData.inputType || 'text';
      schema = NODE_TYPE_MAPPINGS['input'][inputType] || NODE_TYPE_MAPPINGS['input'].text;
    } else {
      schema = NODE_TYPE_MAPPINGS[nodeType];
    }

    // Add to inputs
    inputs[fieldName] = {
      ...schema,
      'x-node-id': node.id,
      'x-node-type': nodeType,
    };

    // Mark as required if node has required flag or default behavior
    const isRequired = nodeData.required !== false; // Default to required
    if (isRequired) {
      required.push(fieldName);
    }

    // Add default value if present
    if (nodeData.value !== undefined && nodeData.value !== null && nodeData.value !== '') {
      inputs[fieldName].default = nodeData.value;
    }

    // Add custom description if present
    if (nodeData.description) {
      inputs[fieldName].description = nodeData.description;
    }
  }

  return {
    type: 'object',
    properties: inputs,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Extract output schema from workflow nodes
 * @param {Object} workflow - Workflow JSON
 * @returns {Object} - Output schema definition
 */
export function extractOutputSchema(workflow) {
  const outputs = {};

  // Find all output-type nodes
  const outputNodes = workflow.nodes.filter(node => node.type === 'output');

  if (outputNodes.length === 0) {
    // Default output if no output nodes
    return {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          description: 'Workflow execution result',
        },
      },
    };
  }

  for (const node of outputNodes) {
    const nodeData = node.data || {};
    const fieldName = generateFieldName(nodeData.outputLabel || node.id);

    outputs[fieldName] = {
      type: 'string',
      description: nodeData.description || 'Output value',
      'x-node-id': node.id,
      'x-node-type': 'output',
    };

    // Detect if output format hints at specific type
    const format = nodeData.format;
    if (format === 'json') {
      outputs[fieldName].type = 'object';
      outputs[fieldName].description += ' (JSON format)';
    }
  }

  return {
    type: 'object',
    properties: outputs,
  };
}

/**
 * Generate OpenAPI 3.0 schema for workflow
 * @param {Object} workflow - Workflow JSON
 * @param {string} slug - Workflow slug for URL
 * @param {string} baseUrl - Base URL of the API
 * @returns {Object} - OpenAPI 3.0 schema
 */
export function generateOpenAPISchema(workflow, slug, baseUrl) {
  const inputSchema = extractInputSchema(workflow);
  const outputSchema = extractOutputSchema(workflow);

  const openApiSchema = {
    openapi: '3.0.0',
    info: {
      title: workflow.name || 'Clara Workflow',
      description: workflow.description || 'Deployed Clara workflow API',
      version: workflow.version || '1.0.0',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Clara Agent Runner API',
      },
    ],
    paths: {
      [`/api/workflows/${slug}/execute`]: {
        post: {
          summary: `Execute ${workflow.name || 'workflow'}`,
          description: workflow.description || 'Execute the deployed workflow with provided inputs',
          operationId: `execute_${slug}`,
          tags: ['Workflow Execution'],
          security: [
            {
              ApiKeyAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: inputSchema,
                examples: {
                  default: {
                    summary: 'Example input',
                    value: generateExampleInputs(inputSchema),
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful execution',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: true,
                      },
                      outputs: outputSchema,
                      metadata: {
                        type: 'object',
                        properties: {
                          executionId: {
                            type: 'string',
                            format: 'uuid',
                          },
                          duration: {
                            type: 'string',
                            example: '1234ms',
                          },
                          timestamp: {
                            type: 'string',
                            format: 'date-time',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Invalid input',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            '401': {
              description: 'Invalid or missing API key',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            '500': {
              description: 'Execution error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'API key in format: Bearer clara_sk_...',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              description: 'Error message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
  };

  return openApiSchema;
}

/**
 * Generate a simple JSON schema for input validation (lighter than OpenAPI)
 * @param {Object} workflow - Workflow JSON
 * @returns {Object} - JSON schema
 */
export function generateSimpleSchema(workflow) {
  const inputSchema = extractInputSchema(workflow);
  const outputSchema = extractOutputSchema(workflow);

  return {
    input: inputSchema,
    output: outputSchema,
    metadata: {
      nodeCount: workflow.nodes.length,
      connectionCount: workflow.connections?.length || 0,
      hasCustomNodes: workflow.customNodes && workflow.customNodes.length > 0,
    },
  };
}

/**
 * Map workflow inputs to node IDs for execution
 * Creates a mapping from API field names to internal node IDs
 * @param {Object} workflow - Workflow JSON
 * @returns {Object} - Map of fieldName -> nodeId
 */
export function generateInputMapping(workflow) {
  const mapping = {};

  const inputNodes = workflow.nodes.filter(node =>
    ['input', 'image-input', 'pdf-input', 'file-upload'].includes(node.type)
  );

  for (const node of inputNodes) {
    const nodeData = node.data || {};
    const fieldName = generateFieldName(nodeData.label || nodeData.inputLabel || node.id);
    mapping[fieldName] = node.id;
  }

  return mapping;
}

/**
 * Map node IDs to output field names for response formatting
 * @param {Object} workflow - Workflow JSON
 * @returns {Object} - Map of nodeId -> fieldName
 */
export function generateOutputMapping(workflow) {
  const mapping = {};

  const outputNodes = workflow.nodes.filter(node => node.type === 'output');

  for (const node of outputNodes) {
    const nodeData = node.data || {};
    const fieldName = generateFieldName(nodeData.outputLabel || node.id);
    mapping[node.id] = fieldName;
  }

  return mapping;
}

/**
 * Generate example inputs from schema
 * @param {Object} schema - Input schema
 * @returns {Object} - Example input values
 */
function generateExampleInputs(schema) {
  const example = {};

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.example !== undefined) {
        example[key] = prop.example;
      } else if (prop.default !== undefined) {
        example[key] = prop.default;
      } else {
        // Generate example based on type
        switch (prop.type) {
          case 'string':
            if (prop.format === 'base64') {
              example[key] = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            } else {
              example[key] = 'Example text';
            }
            break;
          case 'number':
            example[key] = 42;
            break;
          case 'boolean':
            example[key] = true;
            break;
          case 'object':
            example[key] = { key: 'value' };
            break;
          case 'array':
            example[key] = ['item1', 'item2'];
            break;
          default:
            example[key] = null;
        }
      }
    }
  }

  return example;
}

/**
 * Generate API-friendly field name from node label
 * Converts to camelCase and removes special characters
 * @param {string} label - Node label or ID
 * @returns {string} - Sanitized field name
 */
function generateFieldName(label) {
  return label
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except word chars, spaces, hyphens
    .replace(/\s+(.)/g, (_, char) => char.toUpperCase()) // Convert to camelCase
    .replace(/^[A-Z]/, char => char.toLowerCase()) // Ensure first char is lowercase
    .replace(/[^a-zA-Z0-9]/g, '') // Remove any remaining special chars
    || 'input';
}

/**
 * Validate inputs against schema
 * @param {Object} inputs - User-provided inputs
 * @param {Object} schema - Input schema
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateInputs(inputs, schema) {
  const errors = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (inputs[field] === undefined || inputs[field] === null || inputs[field] === '') {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check field types
  if (schema.properties) {
    for (const [field, value] of Object.entries(inputs)) {
      const fieldSchema = schema.properties[field];

      if (!fieldSchema) {
        errors.push(`Unknown field: ${field}`);
        continue;
      }

      // Type validation
      const actualType = typeof value;
      const expectedType = fieldSchema.type;

      if (expectedType === 'number' && actualType !== 'number') {
        errors.push(`Field '${field}' must be a number`);
      } else if (expectedType === 'string' && actualType !== 'string') {
        errors.push(`Field '${field}' must be a string`);
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        errors.push(`Field '${field}' must be a boolean`);
      } else if (expectedType === 'object' && (actualType !== 'object' || value === null)) {
        errors.push(`Field '${field}' must be an object`);
      } else if (expectedType === 'array' && !Array.isArray(value)) {
        errors.push(`Field '${field}' must be an array`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  extractInputSchema,
  extractOutputSchema,
  generateOpenAPISchema,
  generateSimpleSchema,
  generateInputMapping,
  generateOutputMapping,
  validateInputs,
};
