/**
 * ClaraVerse Agent Runner - Workflow Executor
 * Handles workflow execution with ClaraFlowRunner and input/output mapping
 */

import { ClaraFlowRunner } from '../dist/index.js';
import { generateInputMapping, generateOutputMapping } from './schema-generator.js';
import config from './config.js';

/**
 * Workflow Executor Class
 * Manages workflow execution with proper input mapping and error handling
 */
export class WorkflowExecutor {
  constructor(options = {}) {
    this.runner = new ClaraFlowRunner({
      enableLogging: options.enableLogging !== false,
      timeout: options.timeout || config.execution.maxExecutionTime,
    });

    this.maxExecutionTime = options.timeout || config.execution.maxExecutionTime;
  }

  /**
   * Execute a deployed workflow
   * @param {Object} workflow - Deployed workflow from database
   * @param {Object} apiInputs - User-provided inputs (field names from API)
   * @returns {Promise<Object>} - Execution result with outputs and metadata
   */
  async execute(workflow, apiInputs) {
    const startTime = Date.now();

    try {
      // Get the workflow JSON
      const workflowJson = typeof workflow.workflow_json === 'string'
        ? JSON.parse(workflow.workflow_json)
        : workflow.workflow_json;

      // Generate input mapping (API field names -> node IDs)
      const inputMapping = generateInputMapping(workflowJson);
      const outputMapping = generateOutputMapping(workflowJson);

      // Map API inputs to node IDs
      const nodeInputs = this.mapInputsToNodes(apiInputs, inputMapping);

      // Inject environment configuration for nodes that need external services
      this.injectEnvironmentConfig(workflowJson);

      // Execute workflow with ClaraFlowRunner
      const result = await Promise.race([
        this.runner.execute(workflowJson, nodeInputs),
        this.createTimeoutPromise(this.maxExecutionTime),
      ]);

      const duration = Date.now() - startTime;

      // Map outputs from node IDs to field names
      // Note: SDK returns outputs directly, not wrapped in result.outputs
      const outputs = this.mapOutputsToFields(result, outputMapping);

      return {
        success: true,
        outputs,
        logs: [],
        metadata: {
          duration: `${duration}ms`,
          durationMs: duration,
          nodesExecuted: Object.keys(result || {}).length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        error: error.message,
        logs: this.runner.getLogs ? this.runner.getLogs() : [],
        metadata: {
          duration: `${duration}ms`,
          durationMs: duration,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Map API inputs (with field names) to node IDs
   * @param {Object} apiInputs - User-provided inputs
   * @param {Object} inputMapping - Map of fieldName -> nodeId
   * @returns {Object} - Inputs keyed by node ID
   */
  mapInputsToNodes(apiInputs, inputMapping) {
    const nodeInputs = {};

    for (const [fieldName, value] of Object.entries(apiInputs)) {
      const nodeId = inputMapping[fieldName];
      if (nodeId) {
        nodeInputs[nodeId] = value;
      }
    }

    return nodeInputs;
  }

  /**
   * Map outputs from node IDs to field names
   * @param {Object} nodeOutputs - Outputs from ClaraFlowRunner (keyed by node ID)
   * @param {Object} outputMapping - Map of nodeId -> fieldName
   * @returns {Object} - Outputs with friendly field names
   */
  mapOutputsToFields(nodeOutputs, outputMapping) {
    const outputs = {};

    if (!nodeOutputs || typeof nodeOutputs !== 'object') {
      return outputs;
    }

    // Map output nodes
    for (const [nodeId, value] of Object.entries(nodeOutputs)) {
      const fieldName = outputMapping[nodeId];
      if (fieldName) {
        // Extract actual output value from output node structure
        outputs[fieldName] = this.extractOutputValue(value);
      }
    }

    // If no mapped outputs, try to find any output nodes
    if (Object.keys(outputs).length === 0 && Object.keys(nodeOutputs).length > 0) {
      // Fallback: return first output found
      const firstOutput = Object.values(nodeOutputs)[0];
      outputs.result = this.extractOutputValue(firstOutput);
    }

    return outputs;
  }

  /**
   * Extract the actual value from output node result
   * Output nodes typically have structure like { input: actualValue }
   * @param {any} value - Output node value
   * @returns {any} - Extracted value
   */
  extractOutputValue(value) {
    if (value && typeof value === 'object') {
      // Check for common output node structures
      if (value.input !== undefined) {
        return value.input;
      }
      if (value.value !== undefined) {
        return value.value;
      }
      if (value.output !== undefined) {
        return value.output;
      }
      if (value.result !== undefined) {
        return value.result;
      }
    }

    return value;
  }

  /**
   * Inject environment configuration into workflow nodes
   * This allows nodes to access API keys and service URLs without exposing them in the workflow
   * @param {Object} workflow - Workflow JSON (modified in place)
   */
  injectEnvironmentConfig(workflow) {
    for (const node of workflow.nodes) {
      const nodeType = node.type;
      const nodeData = node.data || {};

      // Inject ComfyUI URL
      if (nodeType === 'comfyui-image-generator' || nodeType === 'comfyui') {
        if (!nodeData.comfyUIBaseUrl && config.services.comfyui.enabled) {
          node.data.comfyUIBaseUrl = config.services.comfyui.url;
        }
      }

      // Inject LLM API keys and endpoints
      if (nodeType === 'llm-chat' || nodeType === 'structured-llm' || nodeType === 'llm') {
        // Use OpenAI key if not provided
        if (!nodeData.apiKey && config.apiKeys.openai) {
          node.data.apiKey = config.apiKeys.openai;
        }
        // Default to OpenAI endpoint if not provided
        if (!nodeData.apiBaseUrl) {
          node.data.apiBaseUrl = 'https://api.openai.com/v1';
        }
      }

      // Inject Whisper API key
      if (nodeType === 'whisper-transcription' || nodeType === 'speech-to-text') {
        if (!nodeData.apiKey && config.apiKeys.openai) {
          node.data.apiKey = config.apiKeys.openai;
        }
        if (!nodeData.baseUrl && config.services.pythonBackend.enabled) {
          node.data.baseUrl = config.services.pythonBackend.url;
        }
      }

      // Inject Python backend URL for TTS
      if (nodeType === 'text-to-speech' || nodeType === 'tts') {
        if (!nodeData.baseUrl && config.services.pythonBackend.enabled) {
          node.data.baseUrl = config.services.pythonBackend.url;
        }
      }

      // Inject Agent Executor configuration
      if (nodeType === 'agent-executor' || nodeType === 'agent') {
        if (!nodeData.provider && config.services.ollama.enabled) {
          node.data.provider = 'ollama';
          node.data.baseUrl = config.services.ollama.url;
        }
        // Inject API keys based on provider
        if (nodeData.provider === 'openai' && !nodeData.apiKey && config.apiKeys.openai) {
          node.data.apiKey = config.apiKeys.openai;
        }
        if (nodeData.provider === 'anthropic' && !nodeData.apiKey && config.apiKeys.anthropic) {
          node.data.apiKey = config.apiKeys.anthropic;
        }
        if (nodeData.provider === 'openrouter' && !nodeData.apiKey && config.apiKeys.openrouter) {
          node.data.apiKey = config.apiKeys.openrouter;
        }
      }
    }
  }

  /**
   * Create a timeout promise
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} - Promise that rejects after timeout
   */
  createTimeoutPromise(timeoutMs) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Validate workflow before execution
   * @param {Object} workflow - Workflow JSON
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validateWorkflow(workflow) {
    const errors = [];

    try {
      // Check workflow structure
      if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
        errors.push('Workflow must have a nodes array');
      }

      if (!workflow.connections && !workflow.edges) {
        errors.push('Workflow must have connections or edges');
      }

      // Check for input nodes
      const hasInputNodes = workflow.nodes?.some(node =>
        ['input', 'image-input', 'pdf-input', 'file-upload'].includes(node.type)
      );

      if (!hasInputNodes) {
        errors.push('Workflow must have at least one input node');
      }

      // Check for output nodes
      const hasOutputNodes = workflow.nodes?.some(node => node.type === 'output');

      if (!hasOutputNodes) {
        errors.push('Workflow must have at least one output node');
      }

      // Check for circular dependencies (basic check)
      if (workflow.connections) {
        const nodeMap = new Map();
        workflow.nodes.forEach(node => nodeMap.set(node.id, new Set()));

        workflow.connections.forEach(conn => {
          nodeMap.get(conn.source)?.add(conn.target);
        });

        // Simple cycle detection using DFS
        const visited = new Set();
        const recStack = new Set();

        const hasCycle = (nodeId) => {
          if (recStack.has(nodeId)) return true;
          if (visited.has(nodeId)) return false;

          visited.add(nodeId);
          recStack.add(nodeId);

          const neighbors = nodeMap.get(nodeId) || new Set();
          for (const neighbor of neighbors) {
            if (hasCycle(neighbor)) return true;
          }

          recStack.delete(nodeId);
          return false;
        };

        for (const nodeId of nodeMap.keys()) {
          if (hasCycle(nodeId)) {
            errors.push('Workflow contains circular dependencies');
            break;
          }
        }
      }
    } catch (error) {
      errors.push(`Workflow validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get execution logs
   * @returns {Array} - Execution logs
   */
  getLogs() {
    return this.runner.getLogs ? this.runner.getLogs() : [];
  }

  /**
   * Clear execution logs
   */
  clearLogs() {
    if (this.runner.clearLogs) {
      this.runner.clearLogs();
    }
  }
}

/**
 * Create a workflow executor instance
 * @param {Object} options - Executor options
 * @returns {WorkflowExecutor} - New executor instance
 */
export function createExecutor(options = {}) {
  return new WorkflowExecutor(options);
}

export default {
  WorkflowExecutor,
  createExecutor,
};
