const { EventEmitter } = require('events');
const log = require('electron-log');
const { getAdaptiveHealthCheckManager } = require('./adaptiveHealthCheckManager.cjs');

/**
 * Central Service Manager
 * Single source of truth for all ClaraVerse services
 * Supports both Docker and manual deployment modes
 * Replaces scattered service management across multiple files
 */
class CentralServiceManager extends EventEmitter {
  constructor(configManager = null) {
    super();
    
    // Get adaptive health check manager
    this.adaptiveHealthManager = getAdaptiveHealthCheckManager();
    
    // Service registry - single source of truth
    this.services = new Map();
    this.serviceStates = new Map();
    this.platformInfo = this.detectPlatform();
    
    // NEW: Configuration manager for deployment modes
    this.configManager = configManager;
    
    // Service lifecycle states
    this.states = {
      STOPPED: 'stopped',
      STARTING: 'starting', 
      RUNNING: 'running',
      STOPPING: 'stopping',
      ERROR: 'error',
      RESTARTING: 'restarting'
    };
    
    // Global configuration (now with adaptive health checks)
    this.config = {
      startupTimeout: 30000,
      shutdownTimeout: 15000,
      baseHealthCheckInterval: 30000, // Base interval when active
      maxRestartAttempts: 3,
      restartDelay: 5000,
      useAdaptiveChecks: true // Enable adaptive health checking
    };
    
    this.isShuttingDown = false;
    this.startupPromise = null;
    
    log.info('🎯 Central Service Manager initialized with deployment mode support');
  }

  /**
   * Register a service with the central manager
   */
  registerService(name, serviceConfig) {
    const service = {
      name,
      ...serviceConfig,
      state: this.states.STOPPED,
      restartAttempts: 0,
      lastHealthCheck: null,
      lastError: null,
      instance: null
    };
    
    this.services.set(name, service);
    this.serviceStates.set(name, this.states.STOPPED);
    this.emit('service-registered', { name, service });
    
    log.info(`📝 Registered service: ${name}`);
    return service;
  }

  /**
   * Start all services in proper order
   */
  async startAllServices() {
    if (this.startupPromise) {
      return this.startupPromise;
    }
    
    this.startupPromise = this._startServicesSequence();
    return this.startupPromise;
  }

  async _startServicesSequence() {
    try {
      log.info('🚀 Starting all ClaraVerse services...');
      
      // Get services ordered by priority
      const orderedServices = this.getStartupOrder();
      
      for (const serviceName of orderedServices) {
        const service = this.services.get(serviceName);
        if (!service) continue;
        
        try {
          await this.startService(serviceName);
        } catch (error) {
          log.error(`❌ Failed to start ${serviceName}:`, error);
          
          // Decide if this is a critical failure
          if (service.critical) {
            throw new Error(`Critical service ${serviceName} failed to start: ${error.message}`);
          }
          
          // Mark as error but continue with non-critical services
          this.setState(serviceName, this.states.ERROR);
          service.lastError = error;
        }
      }
      
      // Start adaptive health monitoring
      if (this.config.useAdaptiveChecks) {
        this.adaptiveHealthManager.startMonitoring();
        log.info('🔋 Adaptive health monitoring enabled', this.adaptiveHealthManager.getStatus());
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      log.info('✅ Service startup sequence completed');
      this.emit('all-services-started');
      
    } catch (error) {
      log.error('💥 Service startup failed:', error);
      this.emit('startup-failed', error);
      throw error;
    } finally {
      this.startupPromise = null;
    }
  }

  /**
   * Start individual service (Enhanced for deployment modes)
   */
  async startService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered`);
    }
    
    if (service.state === this.states.RUNNING) {
      log.info(`⏭️  Service ${serviceName} already running`);
      return;
    }
    
    this.setState(serviceName, this.states.STARTING);
    
    try {
      // NEW: Determine deployment mode
      const deploymentMode = this.getDeploymentMode(serviceName);
      log.info(`🔄 Starting service: ${serviceName} (mode: ${deploymentMode})`);
      
      // Start service based on deployment mode
      if (deploymentMode === 'manual' || deploymentMode === 'remote') {
        service.instance = await this.startManualService(serviceName, service);
      } else if (deploymentMode === 'local' || deploymentMode === 'native') {
        // Local binary service
        service.instance = await this.startNativeService(serviceName, service);
      } else {
        // Default to Docker mode (backward compatibility)
        const startupMethod = this.getStartupMethod(service);
        service.instance = await startupMethod(service);
      }
      
      // Wait for service to become healthy
      await this.waitForHealthy(serviceName);
      
      this.setState(serviceName, this.states.RUNNING);
      service.restartAttempts = 0;
      service.deploymentMode = deploymentMode;
      
      log.info(`✅ Service ${serviceName} started successfully (${deploymentMode} mode)`);
      this.emit('service-started', { 
        name: serviceName, 
        service, 
        deploymentMode: deploymentMode 
      });
      
    } catch (error) {
      this.setState(serviceName, this.states.ERROR);
      service.lastError = error;
      log.error(`❌ Failed to start service ${serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Stop all services gracefully
   */
  async stopAllServices() {
    this.isShuttingDown = true;
    
    // Stop adaptive monitoring
    if (this.adaptiveHealthManager) {
      this.adaptiveHealthManager.stopMonitoring();
    }
    
    // Clear health check timer
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    try {
      log.info('🛑 Stopping all ClaraVerse services...');
      
      // Get services in reverse startup order
      const orderedServices = this.getStartupOrder().reverse();
      
      const stopPromises = orderedServices.map(serviceName => 
        this.stopService(serviceName).catch(error => {
          log.error(`Error stopping ${serviceName}:`, error);
        })
      );
      
      await Promise.allSettled(stopPromises);
      
      log.info('✅ All services stopped');
      this.emit('all-services-stopped');
      
    } catch (error) {
      log.error('Error during service shutdown:', error);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Stop individual service
   */
  async stopService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service || service.state === this.states.STOPPED) {
      return;
    }
    
    this.setState(serviceName, this.states.STOPPING);
    
    try {
      log.info(`🔄 Stopping service: ${serviceName}`);
      
      const stopMethod = this.getStopMethod(service);
      await stopMethod(service);
      
      this.setState(serviceName, this.states.STOPPED);
      service.instance = null;
      
      log.info(`✅ Service ${serviceName} stopped`);
      this.emit('service-stopped', { name: serviceName, service });
      
    } catch (error) {
      log.error(`❌ Error stopping service ${serviceName}:`, error);
      service.lastError = error;
      this.setState(serviceName, this.states.ERROR);
      throw error;
    }
  }

  /**
   * Restart service with exponential backoff
   */
  async restartService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered`);
    }
    
    if (service.restartAttempts >= this.config.maxRestartAttempts) {
      throw new Error(`Service ${serviceName} exceeded max restart attempts`);
    }
    
    this.setState(serviceName, this.states.RESTARTING);
    service.restartAttempts++;
    
    try {
      // Stop first
      await this.stopService(serviceName);
      
      // Wait with exponential backoff
      const delay = this.config.restartDelay * Math.pow(2, service.restartAttempts - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Start again
      await this.startService(serviceName);
      
      log.info(`🔄 Service ${serviceName} restarted successfully`);
      
    } catch (error) {
      log.error(`❌ Failed to restart service ${serviceName}:`, error);
      this.setState(serviceName, this.states.ERROR);
      throw error;
    }
  }

  /**
   * Get service startup order based on dependencies
   */
  getStartupOrder() {
    // Define service dependencies
    const dependencies = {
      'docker': [],
      'claracore': [], // No dependencies - runs independently
      'python-backend': ['docker'],
      'comfyui': ['docker', 'python-backend'],
      'n8n': ['docker'],
      'mcp': ['python-backend', 'claracore'],
      'watchdog': ['docker', 'python-backend', 'claracore']
    };

    // Topological sort to determine startup order
    return this.topologicalSort(dependencies);
  }

  /**
   * Topological sort for dependency resolution
   */
  topologicalSort(dependencies) {
    const visited = new Set();
    const temp = new Set();
    const result = [];
    
    const visit = (node) => {
      if (temp.has(node)) {
        throw new Error(`Circular dependency detected involving ${node}`);
      }
      if (!visited.has(node)) {
        temp.add(node);
        
        const deps = dependencies[node] || [];
        deps.forEach(visit);
        
        temp.delete(node);
        visited.add(node);
        result.push(node);
      }
    };
    
    Object.keys(dependencies).forEach(visit);
    return result;
  }

  /**
   * Platform detection
   */
  detectPlatform() {
    const os = require('os');
    return {
      platform: os.platform(),
      arch: os.arch(),
      isWindows: os.platform() === 'win32',
      isMac: os.platform() === 'darwin', 
      isLinux: os.platform() === 'linux'
    };
  }

  /**
   * Set service state and emit events
   */
  setState(serviceName, state) {
    const previousState = this.serviceStates.get(serviceName);
    this.serviceStates.set(serviceName, state);

    const service = this.services.get(serviceName);
    if (service) {
      service.state = state;
    }

    this.emit('service-state-changed', {
      name: serviceName,
      previousState,
      currentState: state
    });
  }

  /**
   * Set service URL (for remote/manual deployments)
   */
  setServiceUrl(serviceName, url) {
    const service = this.services.get(serviceName);
    if (service) {
      service.serviceUrl = url;
      log.info(`✅ Set ${serviceName} URL to: ${url}`);
    } else {
      log.warn(`⚠️ Service ${serviceName} not found when setting URL`);
    }
  }

  /**
   * Get current state of all services (Enhanced with deployment mode info)
   */
  getServicesStatus() {
    const status = {};
    
    for (const [name, service] of this.services) {
      // Calculate uptime
      let uptime = 0;
      if (service.instance && service.instance.startTime) {
        uptime = Date.now() - service.instance.startTime;
      }
      
      // Get deployment mode and URL info
      const deploymentMode = service.deploymentMode || this.getDeploymentMode(name);
      let serviceUrl = null;

      if ((deploymentMode === 'manual' || deploymentMode === 'remote') && this.configManager) {
        // Manual and remote services get URL from config manager
        serviceUrl = this.configManager.getServiceUrl(name);
      } else if (deploymentMode === 'docker' && service.serviceUrl) {
        // Docker services get URL from service state (set by main.cjs)
        serviceUrl = service.serviceUrl;
      } else if (deploymentMode === 'docker' && service.instance && service.instance.url) {
        // Docker services get URL from container instance (fallback)
        serviceUrl = service.instance.url;
      } else if (deploymentMode === 'docker') {
        // Fallback: construct default URLs for known Docker services
        const defaultPorts = {
          'n8n': 5678,
          'python-backend': 5001,
          'comfyui': 8188,
          'claracore': 8091
        };
        if (defaultPorts[name]) {
          serviceUrl = `http://localhost:${defaultPorts[name]}`;
        }
      }
      
      status[name] = {
        state: service.state,
        deploymentMode: deploymentMode,
        restartAttempts: service.restartAttempts,
        lastHealthCheck: service.lastHealthCheck,
        lastError: service.lastError?.message,
        uptime: uptime,
        // NEW: Deployment mode specific information
        serviceUrl: serviceUrl,
        isManual: deploymentMode === 'manual' || deploymentMode === 'remote',
        canRestart: (deploymentMode !== 'manual' && deploymentMode !== 'remote') && service.autoRestart,
        // Platform compatibility info
        supportedModes: this.configManager?.getSupportedModes(name) || ['docker']
      };
    }
    
    return status;
  }

  /**
   * Schedule next adaptive health check
   */
  scheduleNextHealthCheck() {
    if (this.isShuttingDown) return;

    // Get adaptive interval
    let nextInterval = this.config.baseHealthCheckInterval;
    
    if (this.config.useAdaptiveChecks && this.adaptiveHealthManager) {
      // Use the most conservative interval (longest) from all services
      for (const [serviceName] of this.services) {
        const serviceInterval = this.adaptiveHealthManager.getHealthCheckInterval(
          serviceName,
          this.config.baseHealthCheckInterval
        );
        nextInterval = Math.max(nextInterval, serviceInterval);
      }

      // Log adaptive interval changes
      const status = this.adaptiveHealthManager.getStatus();
      if (status.mode !== 'ACTIVE') {
        log.debug(`🔋 Adaptive health check: next in ${nextInterval / 1000}s (${status.mode} mode)`);
      }
    }

    // Clear existing timer
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
    }

    // Schedule next check
    this.healthCheckTimer = setTimeout(async () => {
      await this.performHealthMonitoring();
      this.scheduleNextHealthCheck(); // Schedule next one after this completes
    }, nextInterval);
  }

  /**
   * Health monitoring for all services (Enhanced for deployment modes and adaptive checking)
   */
  startHealthMonitoring() {
    // Start the first health check cycle
    this.scheduleNextHealthCheck();
  }

  /**
   * Perform health monitoring on all services
   */
  async performHealthMonitoring() {
    if (this.isShuttingDown) return;
      
      for (const [serviceName, service] of this.services) {
        if (service.state === this.states.RUNNING) {
          // Skip services during deep idle if adaptive checking is enabled
          if (this.config.useAdaptiveChecks && 
              this.adaptiveHealthManager && 
              this.adaptiveHealthManager.shouldSkipHealthCheck(serviceName)) {
            log.debug(`⏭️ Skipping ${serviceName} health check - deep idle mode`);
            continue;
          }

          try {
            // Determine health check method based on deployment mode
            let healthCheck;
            let isHealthy = false;
            
            if (service.instance && service.instance.healthCheck) {
              // Manual service with custom health check
              healthCheck = service.instance.healthCheck;
              isHealthy = await healthCheck();
            } else if (service.healthCheck) {
              // Service-defined health check
              const serviceUrl = this.configManager?.getServiceUrl(serviceName);
              isHealthy = await service.healthCheck(serviceUrl);
            } else {
              // No health check defined, assume healthy
              isHealthy = true;
            }
            
            service.lastHealthCheck = Date.now();
            
            // Record service activity for adaptive checking when healthy
            if (isHealthy && this.adaptiveHealthManager) {
              this.adaptiveHealthManager.recordServiceActivity(serviceName);
            }
            
            if (!isHealthy) {
              log.warn(`⚠️  Service ${serviceName} health check failed (${service.deploymentMode || 'docker'} mode)`);
              this.emit('service-unhealthy', { 
                name: serviceName, 
                service,
                deploymentMode: service.deploymentMode || 'docker'
              });
              
              // Auto-restart if configured (only for Docker services)
              if (service.autoRestart && service.deploymentMode !== 'manual') {
                log.info(`🔄 Auto-restarting service ${serviceName}`);
                await this.restartService(serviceName);
              } else if (service.deploymentMode === 'manual') {
                log.warn(`⚠️  Manual service ${serviceName} is unhealthy, manual intervention required`);
                this.setState(serviceName, this.states.ERROR);
                service.lastError = new Error('Manual service health check failed');
              }
            }
            
          } catch (error) {
            log.error(`❌ Health check error for ${serviceName}:`, error);
            service.lastError = error;
            
            // For manual services, mark as error since we can't restart them
            if (service.deploymentMode === 'manual') {
              this.setState(serviceName, this.states.ERROR);
            }
          }
        }
      }
  }

  /**
   * Wait for service to become healthy (Enhanced for deployment modes)
   */
  async waitForHealthy(serviceName, timeout = this.config.startupTimeout) {
    const service = this.services.get(serviceName);
    
    // Determine health check method based on deployment mode
    let healthCheck;
    
    if (service.instance && service.instance.healthCheck) {
      // Manual service with custom health check
      healthCheck = service.instance.healthCheck;
    } else if (service.healthCheck) {
      // Service-defined health check
      const serviceUrl = this.configManager?.getServiceUrl(serviceName);
      healthCheck = () => service.healthCheck(serviceUrl);
    } else {
      // No health check defined
      log.warn(`⚠️  No health check defined for service ${serviceName}, assuming healthy`);
      return;
    }
    
    const startTime = Date.now();
    let lastError = null;
    
    while (Date.now() - startTime < timeout) {
      try {
        const isHealthy = await healthCheck();
        if (isHealthy) {
          log.info(`💚 Service ${serviceName} is healthy`);
          return;
        }
      } catch (error) {
        lastError = error;
        log.debug(`Health check failed for ${serviceName}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const errorMessage = lastError 
      ? `Service ${serviceName} failed to become healthy within ${timeout}ms. Last error: ${lastError.message}`
      : `Service ${serviceName} failed to become healthy within ${timeout}ms`;
    
    throw new Error(errorMessage);
  }

  /**
   * NEW: Get deployment mode for a service
   */
  getDeploymentMode(serviceName) {
    // Special case: ClaraCore always defaults to 'local' mode (native binary)
    // Check this FIRST before config manager to ensure it always runs locally
    if (serviceName === 'claracore') {
      // Unless explicitly configured otherwise, always use local mode
      if (this.configManager) {
        const mode = this.configManager.getServiceMode(serviceName);
        // Only allow 'local' or 'remote', never docker for claracore
        if (mode === 'local' || mode === 'remote') {
          return mode;
        }
      }
      return 'local';
    }

    if (this.configManager) {
      const mode = this.configManager.getServiceMode(serviceName);
      if (mode) return mode;
    }

    // Fallback: check if service supports manual mode
    const { getSupportedDeploymentModes } = require('./serviceDefinitions.cjs');
    const supportedModes = getSupportedDeploymentModes(serviceName, this.platformInfo.platform);

    return supportedModes.includes('docker') ? 'docker' : supportedModes[0] || 'docker';
  }

  /**
   * NEW: Start manual service (BYOS - Bring Your Own Service)
   */
  async startManualService(serviceName, service) {
    if (!this.configManager) {
      throw new Error(`Manual service mode requires configuration manager`);
    }
    
    const serviceUrl = this.configManager.getServiceUrl(serviceName);
    if (!serviceUrl) {
      throw new Error(`Manual service ${serviceName} requires URL configuration`);
    }
    
    log.info(`🔗 Connecting to manual service ${serviceName} at ${serviceUrl}`);
    
    // Create manual service health check
    const { createManualHealthCheck } = require('./serviceDefinitions.cjs');
    const healthEndpoint = service.manual?.healthEndpoint || '/';
    const healthCheck = createManualHealthCheck(serviceUrl, healthEndpoint);
    
    // Test connectivity immediately
    const isHealthy = await healthCheck();
    if (!isHealthy) {
      throw new Error(`Manual service ${serviceName} at ${serviceUrl} is not accessible or unhealthy`);
    }
    
    // Return manual service instance
    return {
      type: 'manual',
      url: serviceUrl,
      healthEndpoint: healthEndpoint,
      healthCheck: healthCheck,
      startTime: Date.now(),
      deploymentMode: 'manual'
    };
  }

  /**
   * NEW: Start native service (binary executable)
   */
  async startNativeService(serviceName, service) {
    log.info(`🔧 Starting native service ${serviceName}`);

    // Use the service's custom start method if available
    if (service.customStart) {
      const instance = await service.customStart();

      // IMPORTANT: Don't spread the instance! Methods are on the prototype and won't be copied.
      // Store the instance directly and add metadata properties to it
      instance.type = 'native';
      instance.startTime = Date.now();
      instance.deploymentMode = 'local';

      // Ensure healthCheck is bound properly
      if (instance.checkHealth && !instance.healthCheck) {
        instance.healthCheck = instance.checkHealth.bind(instance);
      }

      // Return the instance with all its methods intact
      return instance;
    }

    // Fallback: generic native service startup
    throw new Error(`Native service ${serviceName} does not define a customStart method`);
  }

  /**
   * Get platform-specific startup method
   */
  getStartupMethod(service) {
    // Return appropriate startup method based on service type and platform
    if (service.dockerContainer) {
      return this.startDockerService.bind(this);
    } else if (service.binaryPath) {
      return this.startBinaryService.bind(this);
    } else if (service.customStart) {
      return service.customStart;
    }
    
    throw new Error(`No startup method defined for service ${service.name}`);
  }

  /**
   * Get platform-specific stop method
   */
  getStopMethod(service) {
    if (service.dockerContainer) {
      return this.stopDockerService.bind(this);
    } else if (service.instance && service.instance.stopService) {
      // Native service instance (like ClaraCore local binary)
      return this.stopNativeService.bind(this);
    } else if (service.process) {
      return this.stopProcessService.bind(this);
    } else if (service.customStop) {
      return service.customStop;
    }

    return () => Promise.resolve(); // No-op if no stop method
  }

  /**
   * Docker service startup
   */
  async startDockerService(service) {
    // Implementation will integrate with existing dockerSetup.cjs logic
    const DockerSetup = require('./dockerSetup.cjs');
    // ... Docker startup logic
  }

  /**
   * Docker service stop
   */
  async stopDockerService(service) {
    // Docker stop logic
  }

  /**
   * Binary service startup
   */
  async startBinaryService(service) {
    const { spawn } = require('child_process');
    // Binary startup logic
  }

  /**
   * Process service stop
   */
  async stopProcessService(service) {
    if (service.instance && service.instance.kill) {
      service.instance.kill('SIGTERM');
    }
  }

  /**
   * Native service stop (for ClaraCore local binary and similar)
   */
  async stopNativeService(service) {
    if (service.instance && typeof service.instance.stopService === 'function') {
      log.info(`🛑 Stopping native service instance: ${service.name}`);
      await service.instance.stopService();
      log.info(`✅ Native service instance stopped: ${service.name}`);
    } else {
      log.warn(`⚠️ Native service ${service.name} has no stopService method`);
    }
  }
}

module.exports = CentralServiceManager; 