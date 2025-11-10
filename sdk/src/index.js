/**
 * Clara Flow SDK v2.0 - Modern AI Workflow Execution Engine
 * Zero-config SDK for running Clara AI agent workflows
 */

// Core execution engine
class ClaraFlowRunner {
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || 30000,
      enableLogging: options.enableLogging !== false,
      logLevel: options.logLevel || 'info',
      maxRetries: options.maxRetries || 3,
      ...options
    };

    this.executionLogs = [];
    this.customNodes = new Map();
    this.isExecuting = false;
    
    if (this.config.enableLogging) {
      this.log('Clara Flow SDK v2.0 initialized');
    }
  }

  /**
   * Execute a workflow with inputs
   * @param {Object} flowData - Exported workflow from Clara Studio
   * @param {Object} inputs - Input values for the workflow
   * @returns {Promise<Object>} Execution results
   */
  async execute(flowData, inputs = {}) {
    if (this.isExecuting) {
      throw new Error('Another workflow is already executing');
    }

    this.isExecuting = true;
    const startTime = Date.now();
    
    try {
      this.log('🚀 Starting workflow execution');
      
      // Normalize flow data format
      const flow = this.normalizeFlow(flowData);
      
      // Register custom nodes if present
      this.registerCustomNodes(flow.customNodes || []);
      
      // Validate workflow
      this.validateFlow(flow);
      
      // Execute workflow
      const results = await this.executeWorkflow(flow, inputs);
      
      const duration = Date.now() - startTime;
      this.log(`✅ Workflow completed successfully in ${duration}ms`);
      
      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`❌ Workflow failed after ${duration}ms: ${error.message}`, 'error');
      throw error;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Register a custom node type
   * @param {Object} nodeDefinition - Custom node definition
   */
  registerCustomNode(nodeDefinition) {
    if (!nodeDefinition.type || !nodeDefinition.executionCode) {
      throw new Error('Custom node must have type and executionCode');
    }
    
    this.customNodes.set(nodeDefinition.type, nodeDefinition);
    this.log(`📦 Registered custom node: ${nodeDefinition.type}`);
  }

  /**
   * Get execution logs
   * @returns {Array} Array of log entries
   */
  getLogs() {
    return [...this.executionLogs];
  }

  /**
   * Clear execution logs
   */
  clearLogs() {
    this.executionLogs = [];
  }

  /**
   * Get required inputs for a workflow (what the developer needs to provide)
   * @param {Object} flowData - Workflow JSON
   * @returns {Array} Array of required input descriptions
   */
  getRequiredInputs(flowData) {
    try {
      const flow = this.normalizeFlow(flowData);
      const inputNodes = flow.nodes.filter(node => node.type === 'input');
      
      return inputNodes.map(node => ({
        id: node.id,
        name: node.name || node.data?.label || node.id,
        description: node.data?.description || `Input for ${node.name || node.id}`,
        type: node.data?.type || 'text',
        required: !node.data?.value && !node.data?.defaultValue, // Required if no default
        defaultValue: node.data?.value || node.data?.defaultValue,
        example: this.getInputExample(node.data?.type || 'text')
      }));
    } catch (error) {
      throw new Error(`Failed to analyze workflow inputs: ${error.message}`);
    }
  }

  /**
   * Get example value for input type
   * @private
   */
  getInputExample(type) {
    const examples = {
      'text': 'Hello world',
      'number': 42,
      'json': '{"key": "value"}',
      'boolean': true,
      'email': 'user@example.com',
      'url': 'https://example.com'
    };
    return examples[type] || 'Sample input';
  }

  /**
   * Simple execution - automatically prompt for missing inputs
   * @param {Object} flowData - Workflow JSON  
   * @param {Object} inputs - Optional inputs (if not provided, will prompt)
   * @returns {Promise<any>} Execution result
   */
  async run(flowData, inputs = {}) {
    // Get required inputs
    const requiredInputs = this.getRequiredInputs(flowData);
    
    // Check if we have all required inputs
    const missingInputs = requiredInputs.filter(input => 
      input.required && !(input.id in inputs) && !(input.name in inputs)
    );

    if (missingInputs.length > 0 && typeof process !== 'undefined' && process.stdin && typeof window === 'undefined') {
      // We're in Node.js and have missing inputs - prompt for them
      this.log('🔍 Missing required inputs, prompting user...');
      
      try {
        const readline = await import('readline');
        
        for (const input of missingInputs) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const prompt = `${input.name} (${input.type})${input.defaultValue ? ` [${input.defaultValue}]` : ''}: `;
          const answer = await new Promise(resolve => rl.question(prompt, resolve));
          rl.close();

          if (answer.trim() || !input.defaultValue) {
            inputs[input.id] = answer.trim() || input.defaultValue;
          } else {
            inputs[input.id] = input.defaultValue;
          }
        }
      } catch (error) {
        // Fallback if readline import fails
        const inputList = missingInputs.map(i => `- ${i.name} (${i.type}): ${i.description}`).join('\n');
        throw new Error(`Missing required inputs:\n${inputList}\n\nPlease provide these inputs when calling run(workflow, inputs)`);
      }
    } else if (missingInputs.length > 0) {
      // Missing inputs but can't prompt (browser or missing inputs)
      const inputList = missingInputs.map(i => `- ${i.name} (${i.type}): ${i.description}`).join('\n');
      throw new Error(`Missing required inputs:\n${inputList}\n\nPlease provide these inputs when calling run(workflow, inputs)`);
    }

    // Fill in default values for optional inputs
    requiredInputs.forEach(input => {
      if (!input.required && !(input.id in inputs) && !(input.name in inputs) && input.defaultValue !== undefined) {
        inputs[input.id] = input.defaultValue;
      }
    });

    // Execute the workflow
    return this.execute(flowData, inputs);
  }

  /**
   * Get a simple description of what this workflow does
   * @param {Object} flowData - Workflow JSON
   * @returns {Object} Workflow description
   */
  describe(flowData) {
    try {
      const flow = this.normalizeFlow(flowData);
      const inputs = this.getRequiredInputs(flowData);
      const outputNodes = flow.nodes.filter(node => node.type === 'output');
      const aiNodes = flow.nodes.filter(node => 
        node.type === 'llm' || 
        node.type === 'structured-llm' || 
        node.type === 'whisper-transcription'
      );
      const customNodes = flow.nodes.filter(node => 
        this.customNodes.has(node.type) || 
        (flow.customNodes && flow.customNodes.some(cn => cn.type === node.type))
      );

      return {
        name: flow.name || 'Unnamed Workflow',
        description: flow.description || 'No description provided',
        inputs: inputs,
        outputs: outputNodes.map(node => ({
          name: node.name || node.id,
          description: node.data?.description || `Output from ${node.name || node.id}`
        })),
        nodeCount: flow.nodes.length,
        hasAI: aiNodes.length > 0,
        hasCustomNodes: customNodes.length > 0,
        aiModels: aiNodes.map(node => node.data?.model || 'Unknown').filter(Boolean),
        complexity: this.calculateComplexity(flow)
      };
    } catch (error) {
      throw new Error(`Failed to describe workflow: ${error.message}`);
    }
  }

  /**
   * Calculate workflow complexity
   * @private
   */
  calculateComplexity(flow) {
    const nodeCount = flow.nodes.length;
    const connectionCount = flow.connections?.length || 0;
    const hasAI = flow.nodes.some(n => n.type === 'llm' || n.type === 'structured-llm');
    const hasCustomNodes = flow.nodes.some(n => this.customNodes.has(n.type));
    
    if (nodeCount <= 3) return 'Simple';
    if (nodeCount <= 7) return 'Medium';
    if (nodeCount <= 15 || hasAI || hasCustomNodes) return 'Complex';
    return 'Advanced';
  }

  // Private methods
  
  normalizeFlow(flowData) {
    // Handle different export formats from Clara Studio
    let flow;
    if (flowData.format && flowData.flow) {
      // SDK export format
      flow = flowData.flow;
    } else if (flowData.nodes && flowData.connections) {
      // Direct flow format
      flow = flowData;
    } else {
      throw new Error('Invalid flow format');
    }

    // Normalize connections format - convert React Flow format to SDK format
    if (flow.connections && flow.connections.length > 0) {
      flow.connections = flow.connections.map(conn => {
        // If already in SDK format, return as-is
        if (conn.sourceNodeId && conn.targetNodeId) {
          return conn;
        }
        // Convert React Flow format to SDK format
        return {
          sourceNodeId: conn.source || conn.sourceNodeId,
          targetNodeId: conn.target || conn.targetNodeId,
          sourcePortId: conn.sourceHandle || conn.sourcePortId || 'output',
          targetPortId: conn.targetHandle || conn.targetPortId || 'input'
        };
      });
    }

    return flow;
  }

  registerCustomNodes(customNodes) {
    if (Array.isArray(customNodes)) {
      customNodes.forEach(node => this.registerCustomNode(node));
    }
  }

  validateFlow(flow) {
    if (!flow.nodes || !Array.isArray(flow.nodes)) {
      throw new Error('Flow must have nodes array');
    }
    
    if (!flow.connections || !Array.isArray(flow.connections)) {
      throw new Error('Flow must have connections array');
    }

    if (flow.nodes.length === 0) {
      throw new Error('Flow must have at least one node');
    }

    this.log(`📋 Flow validated: ${flow.nodes.length} nodes, ${flow.connections.length} connections`);
  }

  async executeWorkflow(flow, inputs) {
    // Get execution order using topological sort
    const executionOrder = this.getExecutionOrder(flow.nodes, flow.connections);
    this.log(`📊 Execution order: ${executionOrder.map(n => n.name || n.type).join(' → ')}`);

    // Initialize node outputs storage
    const nodeOutputs = new Map();
    
    // Set input node values
    const inputNodes = flow.nodes.filter(node => node.type === 'input');
    for (const inputNode of inputNodes) {
      const inputValue = inputs[inputNode.id] || inputs[inputNode.name] || inputNode.data?.value;
      nodeOutputs.set(inputNode.id, { output: inputValue });
      this.log(`📥 Input [${inputNode.name || inputNode.id}]: ${this.truncateValue(inputValue)}`);
    }

    // Execute nodes in order
    for (const node of executionOrder) {
      if (nodeOutputs.has(node.id)) continue; // Skip already executed nodes

      const nodeStartTime = Date.now();
      this.log(`▶️ Executing: ${node.name || node.type} (${node.type})`);

      try {
        // Get inputs for this node
        const nodeInputs = this.getNodeInputs(node, flow.connections, nodeOutputs);
        
        // Execute the node
        const result = await this.executeNode(node, nodeInputs);
        
        // Store result
        nodeOutputs.set(node.id, result);
        
        const nodeDuration = Date.now() - nodeStartTime;
        this.log(`✅ Completed: ${node.name || node.type} (${nodeDuration}ms)`);
        
      } catch (error) {
        const nodeDuration = Date.now() - nodeStartTime;
        this.log(`❌ Failed: ${node.name || node.type} (${nodeDuration}ms) - ${error.message}`, 'error');
        throw new Error(`Node '${node.name || node.type}' failed: ${error.message}`);
      }
    }

    // Collect output node results
    const results = {};
    const outputNodes = flow.nodes.filter(node => node.type === 'output');
    
    for (const outputNode of outputNodes) {
      const outputValue = nodeOutputs.get(outputNode.id);
      results[outputNode.id] = outputValue;
      results[outputNode.name || outputNode.id] = outputValue;
      this.log(`📤 Output [${outputNode.name || outputNode.id}]: ${this.truncateValue(outputValue)}`);
    }

    return results;
  }

  getExecutionOrder(nodes, connections) {
    // Topological sort for dependency-based execution order
    const inDegree = new Map();
    const adjList = new Map();
    
    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }
    
    // Build adjacency list and count incoming edges
    for (const conn of connections) {
      adjList.get(conn.sourceNodeId).push(conn.targetNodeId);
      inDegree.set(conn.targetNodeId, inDegree.get(conn.targetNodeId) + 1);
    }
    
    // Kahn's algorithm
    const queue = [];
    const result = [];
    
    // Start with nodes that have no incoming edges
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    
    while (queue.length > 0) {
      const nodeId = queue.shift();
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        result.push(node);
      }
      
      for (const targetId of adjList.get(nodeId)) {
        inDegree.set(targetId, inDegree.get(targetId) - 1);
        if (inDegree.get(targetId) === 0) {
          queue.push(targetId);
        }
      }
    }
    
    if (result.length !== nodes.length) {
      throw new Error('Circular dependency detected in workflow');
    }
    
    return result;
  }

  getNodeInputs(node, connections, nodeOutputs) {
    const inputs = {};
    
    // Find all connections that target this node
    const incomingConnections = connections.filter(conn => conn.targetNodeId === node.id);
    
    for (const conn of incomingConnections) {
      const sourceOutput = nodeOutputs.get(conn.sourceNodeId);
      if (sourceOutput) {
        // Get the correct output value
        let outputValue;
        if (sourceOutput[conn.sourcePortId]) {
          outputValue = sourceOutput[conn.sourcePortId];
        } else if (sourceOutput.output !== undefined) {
          outputValue = sourceOutput.output;
        } else {
          outputValue = sourceOutput;
        }
        
        // Map to the target port ID directly (this is the most important mapping)
        inputs[conn.targetPortId] = outputValue;
        
        // Also map common variations for backwards compatibility
        if (conn.targetPortId === 'user') {
          inputs.user = outputValue;
          inputs.message = outputValue;
          inputs.input = outputValue;
        }
        if (conn.targetPortId === 'system') {
          inputs.system = outputValue;
        }
        if (conn.targetPortId === 'context') {
          inputs.context = outputValue;
        }
        if (conn.targetPortId === 'text1') {
          inputs.input1 = outputValue;
          inputs.text1 = outputValue;
        }
        if (conn.targetPortId === 'text2') {
          inputs.input2 = outputValue;
          inputs.text2 = outputValue;
        }
        if (conn.targetPortId === 'input') {
          inputs.input = outputValue;
        }
        
        // Map by input port name if available
        const inputPort = node.inputs?.find(input => input.id === conn.targetPortId);
        if (inputPort) {
          const inputName = inputPort.name?.toLowerCase();
          if (inputName) {
            inputs[inputName] = outputValue;
          }
        }
      }
    }
    
    return inputs;
  }

  async executeNode(node, inputs) {
    // Check if it's a custom node
    if (this.customNodes.has(node.type)) {
      return this.executeCustomNode(node, inputs);
    }
    
    // Execute built-in node types
    switch (node.type) {
      case 'input':
        return { output: node.data?.value || '' };
        
      case 'output':
        return { output: inputs.input || Object.values(inputs)[0] };
        
      case 'static-text':
        return {
          output: node.data?.text || node.data?.value || '',
          text: node.data?.text || node.data?.value || ''
        };
        
      case 'combine-text':
        const input1 = inputs.input1 || inputs.text1 || '';
        const input2 = inputs.input2 || inputs.text2 || '';
        const separator = node.data?.separator || ' ';
        return { output: input1 + separator + input2 };
        
      case 'json-parse':
        try {
          let jsonInput = inputs.input || inputs.json || '{}';
          let parsed;
          
          // Handle API response format { data: {...}, status: 200, ... }
          if (jsonInput && typeof jsonInput === 'object' && 'data' in jsonInput && 'status' in jsonInput) {
            // Extract the actual data from API response wrapper
            parsed = jsonInput.data;
          } else if (typeof jsonInput === 'string') {
            // Parse JSON string
            parsed = JSON.parse(jsonInput);
          } else if (typeof jsonInput === 'object') {
            // Already an object, use as-is
            parsed = jsonInput;
          } else {
            // Try to parse as string
            parsed = JSON.parse(String(jsonInput));
          }
          
          const field = node.data?.field || node.data?.path;
          if (field) {
            // Support dot notation for nested fields
            const value = this.getNestedValue(parsed, field);
            return { output: value };
          }
          return { output: parsed };
        } catch (error) {
          if (node.data?.failOnError !== false) {
            throw new Error(`JSON Parse Error: ${error.message}`);
          }
          return { output: null };
        }

      case 'json-stringify': {
        const jsonInput = inputs.input || inputs.json || Object.values(inputs)[0];
        const prettyPrint = node.data?.prettyPrint ?? true;
        const indentSetting = Number(node.data?.indent ?? 2);
        const indent = Number.isFinite(indentSetting) ? Math.min(Math.max(Math.round(indentSetting), 0), 8) : 2;
        const fallback = node.data?.nullFallback ?? '';

        if (jsonInput === null || jsonInput === undefined) {
          return { output: fallback };
        }

        if (typeof jsonInput === 'string') {
          return { output: jsonInput };
        }

        try {
          const spacing = prettyPrint ? indent : 0;
          const output = JSON.stringify(jsonInput, null, spacing || undefined);
          return { output: output ?? fallback };
        } catch (error) {
          return { output: String(jsonInput ?? fallback) };
        }
      }
        
      case 'if-else':
        const condition = inputs.condition !== undefined ? inputs.condition : inputs.input;
        const trueValue = node.data?.trueValue || inputs.trueValue || condition;
        const falseValue = node.data?.falseValue || inputs.falseValue || null;
        
        // Evaluate condition
        let result;
        if (node.data?.expression) {
          try {
            // Safe evaluation using Function constructor
            const func = new Function('input', 'condition', `return ${node.data.expression}`);
            result = func(condition, condition);
          } catch (error) {
            this.log(`If-Else expression error: ${error.message}`, 'warn');
            result = Boolean(condition);
          }
        } else {
          result = Boolean(condition);
        }
        
        return {
          output: result ? trueValue : falseValue,
          true: result ? trueValue : undefined,
          false: result ? undefined : falseValue
        };
        
      case 'llm':
      case 'llm-chat':
        return this.executeLLMNode(node, inputs);

      case 'structured-llm':
        return this.executeStructuredLLMNode(node, inputs);

      case 'agent-executor':
        return this.executeAgentExecutorNode(node, inputs);

      case 'api-request':
        return this.executeAPIRequestNode(node, inputs);

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  async executeCustomNode(node, inputs) {
    const nodeDefinition = this.customNodes.get(node.type);
    const properties = node.data || {};
    
    try {
      // Create execution context
      const context = {
        log: (message, data) => this.log(`[${node.name || node.type}] ${message}`, 'info', data),
        warn: (message, data) => this.log(`[${node.name || node.type}] ${message}`, 'warn', data),
        error: (message, data) => this.log(`[${node.name || node.type}] ${message}`, 'error', data)
      };
      
      // Execute custom node code
      const func = new Function('inputs', 'properties', 'context', `
        ${nodeDefinition.executionCode}
        if (typeof execute === 'function') {
          return execute(inputs, properties, context);
        } else {
          throw new Error('Custom node must define an execute function');
        }
      `);
      
      const result = await func(inputs, properties, context);
      return result || {};
      
    } catch (error) {
      throw new Error(`Custom node execution failed: ${error.message}`);
    }
  }

  async executeLLMNode(node, inputs) {
    // Basic LLM node implementation
    const apiKey = node.data?.apiKey || process.env.OPENAI_API_KEY || '';
    const model = node.data?.model || 'gpt-3.5-turbo';
    let apiBaseUrl = (node.data?.apiBaseUrl && node.data?.apiBaseUrl.trim()) || process.env.OPENAI_API_BASE_URL || 'http://localhost:8091/v1';

    // Convert localhost to host.docker.internal for Docker compatibility
    apiBaseUrl = this.convertLocalhostForDocker(apiBaseUrl);

    const systemMessage = inputs.system || node.data?.systemMessage || '';
    const userMessage = inputs.user || inputs.input || inputs.message || '';

    if (!userMessage) {
      throw new Error('LLM node requires user message');
    }

    try {
      const messages = [];
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }
      messages.push({ role: 'user', content: userMessage });
      
      const headers = {
        'Content-Type': 'application/json'
      };

      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        this.log('LLM node executing without API key. Ensure your API permits unauthenticated requests.', 'warn');
      }

      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: node.data?.temperature || 0.7,
          max_tokens: node.data?.maxTokens || 1000
        })
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed - API key may be required or invalid');
        } else if (response.status === 403) {
          throw new Error('Access forbidden - check API key permissions');
        }
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const output = data.choices?.[0]?.message?.content || '';
      
      return {
        output,
        usage: data.usage,
        model: data.model
      };
      
    } catch (error) {
      throw new Error(`LLM execution failed: ${error.message}`);
    }
  }

  async executeStructuredLLMNode(node, inputs) {
    // Similar to LLM but with structured output
    const result = await this.executeLLMNode(node, inputs);
    
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(result.output);
      return {
        output: parsed,
        raw: result.output,
        usage: result.usage,
        model: result.model
      };
    } catch (error) {
      // If parsing fails, return raw output
      return {
        output: result.output,
        usage: result.usage,
        model: result.model
      };
    }
  }

  async executeAgentExecutorNode(node, inputs) {
    // Agent executor node - executes autonomous agents with tool access
    const instructions = inputs.instructions || node.data?.instructions || '';
    const context = inputs.context || node.data?.context || '';
    const attachments = inputs.attachments || node.data?.attachments || [];

    if (!instructions) {
      throw new Error('Agent Executor requires instructions');
    }

    // Get agent configuration
    const provider = node.data?.provider || process.env.AGENT_PROVIDER || '';
    const textModel = node.data?.textModel || 'gpt-4o-mini';
    const visionModel = node.data?.visionModel || textModel;
    const codeModel = node.data?.codeModel || textModel;
    const enabledMCPServers = node.data?.enabledMCPServers || [];

    // Construct agent execution request
    const agentRequest = {
      instructions,
      context,
      attachments,
      config: {
        provider,
        textModel,
        visionModel,
        codeModel,
        enabledMCPServers
      }
    };

    // Try to execute via Clara Assistant service
    const claraAssistantUrl = process.env.CLARA_ASSISTANT_URL || 'http://localhost:8069';

    try {
      // Try to call agent execution service
      const response = await fetch(`${claraAssistantUrl}/api/execute-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentRequest)
      });

      if (!response.ok) {
        // Fallback: If agent service not available, use LLM as fallback
        this.log('Agent service unavailable, using LLM fallback', 'warn');
        return await this.agentExecutorFallback(instructions, context, node);
      }

      const result = await response.json();

      return {
        result: result.output || result.result || '',
        toolResults: result.toolResults || [],
        executionLog: result.log || '',
        success: result.success !== false,
        metadata: result.metadata || {}
      };

    } catch (error) {
      // Fallback to LLM if agent service is not available
      this.log(`Agent service error: ${error.message}, using LLM fallback`, 'warn');
      return await this.agentExecutorFallback(instructions, context, node);
    }
  }

  async agentExecutorFallback(instructions, context, node) {
    // Enhanced fallback: Use LLM with MCP tool calling when agent service is not available
    const apiKey = node.data?.apiKey || process.env.OPENAI_API_KEY || '';
    const model = node.data?.textModel?.split(':')[1] || node.data?.textModel || 'gpt-4o-mini';
    let apiBaseUrl = node.data?.apiBaseUrl || process.env.OPENAI_API_BASE_URL || 'http://localhost:8091/v1';
    const enabledMCPServers = node.data?.enabledMCPServers || [];

    // Convert localhost to host.docker.internal for Docker compatibility
    apiBaseUrl = this.convertLocalhostForDocker(apiBaseUrl);

    // MCP Proxy URL (convert for Docker too)
    let mcpProxyUrl = process.env.MCP_PROXY_URL || 'http://127.0.0.1:8092';
    mcpProxyUrl = this.convertLocalhostForDocker(mcpProxyUrl);

    try {
      // Step 1: Fetch available MCP tools from enabled servers
      const mcpTools = await this.fetchMCPTools(mcpProxyUrl, enabledMCPServers);
      this.log(`Fetched ${mcpTools.length} MCP tools from ${enabledMCPServers.length} enabled servers`, 'info');

      // Step 2: Convert MCP tools to OpenAI function calling format
      const openAITools = this.convertMCPToolsToOpenAIFormat(mcpTools);
      this.log(`Converted ${openAITools.length} tools to OpenAI format`, 'info');

      // Step 3: Initialize conversation with system message and user instructions
      const messages = [
        {
          role: 'system',
          content: 'You are an autonomous AI agent with access to powerful tools. Use the available tools to accomplish your tasks effectively. When a task is complete, provide a clear final answer without making additional tool calls.'
        },
        {
          role: 'user',
          content: `Instructions: ${instructions}\n\n${context ? `Context: ${context}` : ''}`
        }
      ];

      const executionLog = [];
      const toolResults = [];
      let iterations = 0;
      const maxIterations = 10; // Prevent infinite loops

      // Step 4: Agentic loop - continue until LLM completes task
      while (iterations < maxIterations) {
        iterations++;
        executionLog.push(`\n[Iteration ${iterations}]`);

        // Make LLM call with available tools
        const llmResponse = await this.callLLMWithTools(
          apiBaseUrl,
          apiKey,
          model,
          messages,
          openAITools.length > 0 ? openAITools : undefined
        );

        const message = llmResponse.choices?.[0]?.message;
        if (!message) {
          throw new Error('No message in LLM response');
        }

        // Add assistant message to conversation
        messages.push(message);

        // Check if LLM wants to use tools
        const toolCalls = message.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          // No more tool calls - task complete
          const finalResult = message.content || '';
          executionLog.push(`Task completed after ${iterations} iterations`);

          return {
            result: finalResult,
            toolResults,
            executionLog: executionLog.join('\n'),
            success: true,
            metadata: {
              model: llmResponse.model,
              usage: llmResponse.usage,
              iterations,
              fallback: true,
              mcpEnabled: true
            }
          };
        }

        // Step 5: Execute all tool calls
        executionLog.push(`Executing ${toolCalls.length} tool call(s)...`);

        for (const toolCall of toolCalls) {
          try {
            executionLog.push(`  - Tool: ${toolCall.function.name}`);

            // Parse MCP tool call from OpenAI format
            const mcpToolCall = this.parseOpenAIToolCallToMCP(toolCall);

            // Execute MCP tool via proxy
            const toolResult = await this.executeMCPTool(mcpProxyUrl, mcpToolCall);

            // Format result for LLM
            const resultText = this.formatMCPToolResult(toolResult);
            executionLog.push(`    Result: ${resultText.substring(0, 100)}...`);

            // Store for output
            toolResults.push({
              tool: toolCall.function.name,
              arguments: mcpToolCall.arguments,
              result: toolResult
            });

            // Add tool result to conversation
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: resultText
            });

          } catch (toolError) {
            executionLog.push(`    Error: ${toolError.message}`);

            // Report error to LLM so it can adapt
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error executing tool: ${toolError.message}`
            });
          }
        }
      }

      // Max iterations reached
      executionLog.push(`Warning: Max iterations (${maxIterations}) reached`);
      const lastMessage = messages[messages.length - 1];
      const finalResult = lastMessage.role === 'assistant' ? lastMessage.content : 'Task incomplete - max iterations reached';

      return {
        result: finalResult,
        toolResults,
        executionLog: executionLog.join('\n'),
        success: false,
        metadata: {
          model,
          iterations,
          fallback: true,
          mcpEnabled: true,
          warning: 'Max iterations reached'
        }
      };

    } catch (error) {
      throw new Error(`Agent execution failed: ${error.message}`);
    }
  }

  async fetchMCPTools(mcpProxyUrl, enabledServerNames) {
    // Fetch available MCP tools from the MCP proxy service
    try {
      // Get list of servers
      const serversResponse = await fetch(`${mcpProxyUrl}/api/servers`);
      if (!serversResponse.ok) {
        this.log(`MCP proxy not available at ${mcpProxyUrl}, skipping tool discovery`, 'warn');
        return [];
      }

      const serversData = await serversResponse.json();
      const servers = serversData.servers || serversData || [];

      // Filter for enabled servers that are running
      const enabledServers = servers.filter(server =>
        enabledServerNames.includes(server.name) &&
        server.isRunning &&
        server.status === 'running'
      );

      this.log(`Found ${enabledServers.length} running servers: ${enabledServers.map(s => s.name).join(', ')}`, 'info');

      // Discover tools from each enabled server
      const allTools = [];
      for (const server of enabledServers) {
        try {
          // Use MCP protocol to discover tools from this server
          const toolsResult = await this.executeMCPTool(mcpProxyUrl, {
            name: 'tools/list',
            arguments: {},
            server: server.name,
            callId: `discover_${server.name}_${Date.now()}`
          });

          if (toolsResult.success && toolsResult.content) {
            // Parse tools from result
            const toolsList = this.parseToolsList(toolsResult.content);
            toolsList.forEach(tool => {
              tool.server = server.name; // Tag with server name
              allTools.push(tool);
            });
            this.log(`Discovered ${toolsList.length} tools from ${server.name}`, 'info');
          }
        } catch (discoverError) {
          this.log(`Failed to discover tools from ${server.name}: ${discoverError.message}`, 'warn');
        }
      }

      return allTools;
    } catch (error) {
      this.log(`Failed to fetch MCP tools: ${error.message}`, 'warn');
      return [];
    }
  }

  parseToolsList(content) {
    // Parse tools list from MCP result content
    try {
      if (!Array.isArray(content)) {
        return [];
      }

      // Look for JSON or text content with tools
      const toolsContent = content.find(c => c.type === 'json' || c.type === 'text');
      if (!toolsContent) {
        return [];
      }

      let toolsData;
      if (toolsContent.type === 'json' && toolsContent.data) {
        toolsData = typeof toolsContent.data === 'string' ?
          JSON.parse(toolsContent.data) : toolsContent.data;
      } else if (toolsContent.type === 'text' && toolsContent.text) {
        toolsData = JSON.parse(toolsContent.text);
      } else {
        return [];
      }

      // Validate tools array
      if (!Array.isArray(toolsData)) {
        return [];
      }

      return toolsData.filter(tool => tool && tool.name && tool.inputSchema);
    } catch (error) {
      this.log(`Failed to parse tools list: ${error.message}`, 'warn');
      return [];
    }
  }

  convertMCPToolsToOpenAIFormat(mcpTools) {
    // Convert MCP tools to OpenAI function calling format
    const openAITools = [];

    for (const tool of mcpTools) {
      try {
        // Fix and validate the input schema
        const fixedParameters = this.fixOpenAISchema(tool.inputSchema || {});

        const openAITool = {
          type: 'function',
          function: {
            name: `mcp_${tool.server}_${tool.name}`,
            description: `[MCP:${tool.server}] ${tool.description || tool.name}`,
            parameters: fixedParameters
          }
        };

        // Validate before adding
        if (this.isValidOpenAITool(openAITool)) {
          openAITools.push(openAITool);
        } else {
          this.log(`Skipping invalid tool: ${tool.server}:${tool.name}`, 'warn');
        }
      } catch (error) {
        this.log(`Failed to convert tool ${tool.server}:${tool.name}: ${error.message}`, 'warn');
      }
    }

    return openAITools;
  }

  fixOpenAISchema(schema) {
    // Fix schema to be OpenAI-compatible
    if (!schema || typeof schema !== 'object') {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }

    // Deep clone
    const fixed = JSON.parse(JSON.stringify(schema));

    // Ensure required structure
    if (!fixed.type) fixed.type = 'object';
    if (!fixed.properties) fixed.properties = {};
    if (!fixed.required) fixed.required = [];

    // Remove incompatible properties recursively
    this.cleanSchemaForOpenAI(fixed);

    return fixed;
  }

  cleanSchemaForOpenAI(schema) {
    // Remove OpenAI-incompatible properties
    if (!schema || typeof schema !== 'object') return;

    // Remove at any level
    delete schema.$schema;
    delete schema.additionalProperties;
    delete schema.anyOf;
    delete schema.oneOf;
    delete schema.allOf;
    delete schema.not;
    delete schema.const;
    delete schema.enum;

    // Handle properties
    if (schema.properties) {
      for (const propName in schema.properties) {
        const prop = schema.properties[propName];

        // Fix array properties - ensure items exist
        if (prop && prop.type === 'array') {
          if (!prop.items || typeof prop.items !== 'object' || !prop.items.type) {
            prop.items = { type: 'object' };
          }
        }

        // Recurse
        if (prop && typeof prop === 'object') {
          this.cleanSchemaForOpenAI(prop);
        }
      }
    }

    // Handle array items
    if (schema.items) {
      this.cleanSchemaForOpenAI(schema.items);
    }
  }

  isValidOpenAITool(tool) {
    // Validate OpenAI tool structure
    try {
      if (!tool || tool.type !== 'function' || !tool.function) {
        return false;
      }

      const func = tool.function;
      if (!func.name || !func.description || !func.parameters) {
        return false;
      }

      return this.isValidParametersSchema(func.parameters);
    } catch (error) {
      return false;
    }
  }

  isValidParametersSchema(schema) {
    // Validate parameters schema
    if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
      return false;
    }

    if (!schema.hasOwnProperty('properties') || typeof schema.properties !== 'object') {
      return false;
    }

    // Check each property
    for (const propName in schema.properties) {
      const prop = schema.properties[propName];
      if (!prop || typeof prop !== 'object' || !prop.type) {
        return false;
      }

      // Arrays must have items
      if (prop.type === 'array') {
        if (!prop.items || typeof prop.items !== 'object' || !prop.items.type) {
          return false;
        }
      }
    }

    return true;
  }

  async callLLMWithTools(apiBaseUrl, apiKey, model, messages, tools) {
    // Make LLM API call with optional tools
    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4000
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  parseOpenAIToolCallToMCP(toolCall) {
    // Parse OpenAI tool call back to MCP format
    const funcName = toolCall.function.name;

    if (!funcName.startsWith('mcp_')) {
      throw new Error(`Invalid MCP tool name: ${funcName}`);
    }

    const nameParts = funcName.replace('mcp_', '').split('_');
    if (nameParts.length < 2) {
      throw new Error(`Invalid MCP tool name format: ${funcName}`);
    }

    const server = nameParts[0];
    const toolName = nameParts.slice(1).join('_');

    // Parse arguments
    let parsedArgs = {};
    try {
      const argsString = toolCall.function.arguments || '{}';
      parsedArgs = typeof argsString === 'string' ? JSON.parse(argsString) : argsString;
    } catch (error) {
      this.log(`Failed to parse tool arguments: ${error.message}`, 'warn');
    }

    return {
      name: toolName,
      arguments: parsedArgs,
      server: server,
      callId: toolCall.id || `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  async executeMCPTool(mcpProxyUrl, mcpToolCall) {
    // Execute MCP tool via the proxy service
    const response = await fetch(`${mcpProxyUrl}/api/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mcpToolCall)
    });

    if (!response.ok) {
      throw new Error(`MCP tool execution failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Extract actual result from wrapper if needed
    return result.result || result;
  }

  formatMCPToolResult(toolResult) {
    // Format MCP tool result for LLM consumption
    if (!toolResult) {
      return 'No result';
    }

    if (toolResult.success === false) {
      return `Error: ${toolResult.error || 'Tool execution failed'}`;
    }

    if (toolResult.content && Array.isArray(toolResult.content)) {
      // Extract text from content array
      const textParts = toolResult.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text);

      if (textParts.length > 0) {
        return textParts.join('\n\n');
      }

      // Try JSON content
      const jsonParts = toolResult.content
        .filter(c => c.type === 'json' && c.data)
        .map(c => typeof c.data === 'string' ? c.data : JSON.stringify(c.data, null, 2));

      if (jsonParts.length > 0) {
        return jsonParts.join('\n\n');
      }
    }

    // Fallback to JSON stringify
    return JSON.stringify(toolResult, null, 2);
  }

  async executeAPIRequestNode(node, inputs) {
    const url = inputs.url || node.data?.url;
    const method = node.data?.method || 'GET';
    const headers = { ...node.data?.headers, ...inputs.headers };
    const body = inputs.body || node.data?.body;

    if (!url) {
      throw new Error('API Request node requires URL');
    }
    
    try {
      const options = {
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      
      if (body && method.toUpperCase() !== 'GET') {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      
      const response = await fetch(url, options);
      
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
    return {
        output: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      };
      
    } catch (error) {
      throw new Error(`API Request failed: ${error.message}`);
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  truncateValue(value) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > 100 ? str.substring(0, 100) + '...' : str;
  }

  convertLocalhostForDocker(url) {
    // Convert localhost/127.0.0.1 to host.docker.internal for Docker compatibility
    // This allows services running inside Docker to access services on the host machine
    if (!url || typeof url !== 'string') return url;

    // Check if we're running in Docker (common indicators)
    const isDocker = process.env.DOCKER_CONTAINER === 'true' ||
                     process.env.NODE_ENV === 'production' ||
                     (typeof process !== 'undefined' && process.platform === 'linux' &&
                      (process.env.HOSTNAME?.includes('docker') ||
                       process.env.HOSTNAME?.length === 12)); // Docker container hostnames are 12 chars

    if (isDocker) {
      // Replace localhost and 127.0.0.1 with host.docker.internal
      return url
        .replace(/localhost/g, 'host.docker.internal')
        .replace(/127\.0\.0\.1/g, 'host.docker.internal');
    }

    return url;
  }

  log(message, level = 'info', data = null) {
    if (!this.config.enableLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.executionLogs.push(logEntry);
    
    if (typeof console !== 'undefined') {
      const logMethod = console[level] || console.log;
      logMethod(`[Clara SDK] ${message}`, data || '');
    }
  }
}

// Utility functions for browser usage
const BrowserUtils = {
  // Download flow as JSON file
  downloadFlow(flowData, filename = 'workflow.json') {
    if (typeof document === 'undefined') {
      throw new Error('downloadFlow is only available in browser environment');
    }
    
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Load flow from file input
  async loadFlowFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const flowData = JSON.parse(e.target.result);
          resolve(flowData);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsText(file);
    });
  },

  // Get browser info
  getBrowserInfo() {
    if (typeof navigator === 'undefined') return null;
    
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    };
  },

  // Check if running in browser
  isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }
};

// Export main classes and utilities
export { ClaraFlowRunner, BrowserUtils };

// Default export for CommonJS compatibility
export default ClaraFlowRunner;