const express = require('express');
const cors = require('cors');
const log = require('electron-log');

/**
 * MCP HTTP Proxy Service
 *
 * Provides HTTP/REST API access to MCP (Model Context Protocol) functionality.
 * This service bridges the gap between browser-based clients and the Node.js-based
 * MCP service, allowing web applications to use MCP tools without Electron.
 *
 * Architecture:
 *   Browser Client → HTTP API (port 8092) → MCPService → MCP Servers
 *
 * Key Features:
 * - Full MCP protocol support (server management, tool execution, discovery)
 * - CORS enabled for localhost
 * - No authentication (trusted localhost environment)
 * - Health check endpoint for monitoring
 * - Auto-start with Electron app
 */
class MCPProxyService {
  constructor(mcpService) {
    this.mcpService = mcpService;
    this.app = express();
    this.server = null;
    this.port = 8092;
    this.isRunning = false;

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for localhost (browser access)
    this.app.use(cors({
      origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:37117',  // Loopback server port
        /^http:\/\/localhost:\d+$/,  // Any localhost port
        /^http:\/\/127\.0\.0\.1:\d+$/  // Any 127.0.0.1 port
      ],
      credentials: true
    }));

    // Parse JSON bodies
    this.app.use(express.json({ limit: '50mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      log.info(`[MCP Proxy] ${req.method} ${req.path}`);
      next();
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      log.error('[MCP Proxy] Error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
      });
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        status: 'healthy',
        service: 'mcp-proxy',
        port: this.port,
        timestamp: new Date().toISOString()
      });
    });

    // Get all servers
    this.app.get('/api/servers', async (req, res) => {
      try {
        const servers = this.mcpService.getAllServers();
        res.json({
          success: true,
          servers
        });
      } catch (error) {
        log.error('[MCP Proxy] Error getting servers:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get server status
    this.app.get('/api/servers/:name', async (req, res) => {
      try {
        const { name } = req.params;
        const status = this.mcpService.getServerStatus(name);
        res.json({
          success: true,
          status
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error getting server status for ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Add server
    this.app.post('/api/servers', async (req, res) => {
      try {
        const serverConfig = req.body;
        const result = await this.mcpService.addServer(serverConfig);
        res.json({
          success: true,
          result
        });
      } catch (error) {
        log.error('[MCP Proxy] Error adding server:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Update server
    this.app.put('/api/servers/:name', async (req, res) => {
      try {
        const { name } = req.params;
        const updates = req.body;
        const result = await this.mcpService.updateServer(name, updates);
        res.json({
          success: true,
          result
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error updating server ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Remove server
    this.app.delete('/api/servers/:name', async (req, res) => {
      try {
        const { name } = req.params;
        await this.mcpService.removeServer(name);
        res.json({
          success: true
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error removing server ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Start server
    this.app.post('/api/servers/:name/start', async (req, res) => {
      try {
        const { name } = req.params;
        await this.mcpService.startServer(name);
        res.json({
          success: true
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error starting server ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Stop server
    this.app.post('/api/servers/:name/stop', async (req, res) => {
      try {
        const { name } = req.params;
        await this.mcpService.stopServer(name);
        res.json({
          success: true
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error stopping server ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Restart server
    this.app.post('/api/servers/:name/restart', async (req, res) => {
      try {
        const { name } = req.params;
        await this.mcpService.restartServer(name);
        res.json({
          success: true
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error restarting server ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Test server
    this.app.post('/api/servers/:name/test', async (req, res) => {
      try {
        const { name } = req.params;
        const result = await this.mcpService.testServer(name);
        res.json({
          success: true,
          result
        });
      } catch (error) {
        log.error(`[MCP Proxy] Error testing server ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Execute tool call
    this.app.post('/api/tools/execute', async (req, res) => {
      try {
        const toolCall = req.body;
        const result = await this.mcpService.executeToolCall(toolCall);
        res.json({
          success: true,
          result
        });
      } catch (error) {
        log.error('[MCP Proxy] Error executing tool call:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get server templates
    this.app.get('/api/templates', async (req, res) => {
      try {
        const templates = this.mcpService.getServerTemplates();
        res.json({
          success: true,
          templates
        });
      } catch (error) {
        log.error('[MCP Proxy] Error getting templates:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Start all enabled servers
    this.app.post('/api/servers/start-all-enabled', async (req, res) => {
      try {
        await this.mcpService.startAllEnabledServers();
        res.json({
          success: true
        });
      } catch (error) {
        log.error('[MCP Proxy] Error starting all enabled servers:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Stop all servers
    this.app.post('/api/servers/stop-all', async (req, res) => {
      try {
        await this.mcpService.stopAllServers();
        res.json({
          success: true
        });
      } catch (error) {
        log.error('[MCP Proxy] Error stopping all servers:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Start previously running servers
    this.app.post('/api/servers/start-previously-running', async (req, res) => {
      try {
        await this.mcpService.startPreviouslyRunningServers();
        res.json({
          success: true
        });
      } catch (error) {
        log.error('[MCP Proxy] Error starting previously running servers:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Save running state
    this.app.post('/api/servers/save-running-state', async (req, res) => {
      try {
        this.mcpService.saveRunningState();
        res.json({
          success: true
        });
      } catch (error) {
        log.error('[MCP Proxy] Error saving running state:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Import Claude config
    this.app.post('/api/import-claude-config', async (req, res) => {
      try {
        const { configPath } = req.body;
        const result = await this.mcpService.importFromClaudeConfig(configPath);
        res.json({
          success: true,
          result
        });
      } catch (error) {
        log.error('[MCP Proxy] Error importing Claude config:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Diagnose Node installation
    this.app.get('/api/diagnose-node', async (req, res) => {
      try {
        const diagnosis = await this.mcpService.diagnoseNodeInstallation();
        res.json({
          success: true,
          diagnosis
        });
      } catch (error) {
        log.error('[MCP Proxy] Error diagnosing Node:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Start the HTTP proxy server
   */
  async start(port = 8092) {
    if (this.isRunning) {
      log.warn('[MCP Proxy] Server is already running');
      return;
    }

    this.port = port;

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, '127.0.0.1', () => {
          this.isRunning = true;
          log.info(`[MCP Proxy] Server started on http://127.0.0.1:${this.port}`);
          resolve({
            port: this.port,
            url: `http://127.0.0.1:${this.port}`,
            healthCheck: async () => {
              try {
                const response = await fetch(`http://127.0.0.1:${this.port}/health`);
                return response.ok;
              } catch (error) {
                return false;
              }
            }
          });
        });

        this.server.on('error', (error) => {
          log.error('[MCP Proxy] Server error:', error);
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${this.port} is already in use`));
          } else {
            reject(error);
          }
        });
      } catch (error) {
        log.error('[MCP Proxy] Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP proxy server
   */
  async stop() {
    if (!this.isRunning || !this.server) {
      log.warn('[MCP Proxy] Server is not running');
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        log.info('[MCP Proxy] Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      url: this.isRunning ? `http://127.0.0.1:${this.port}` : null
    };
  }
}

module.exports = MCPProxyService;
