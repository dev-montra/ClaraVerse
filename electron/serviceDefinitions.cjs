/**
 * ClaraVerse Service Definitions
 * Centralized configuration for all services
 * Replaces scattered service configurations across multiple files
 */

const path = require('path');
const os = require('os');
const log = require('electron-log');

// Get platform info
const platform = os.platform();
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

// Base paths
const appDataPath = path.join(os.homedir(), '.clara');
const pythonBackendDataPath = path.join(appDataPath, 'python_backend_data');

/**
 * Service definitions with all configuration
 */
const SERVICE_DEFINITIONS = {
  
  // Docker Engine (foundational service)
  docker: {
    name: 'Docker Engine',
    type: 'docker-daemon',
    critical: true,
    autoRestart: true,
    priority: 1,
    dependencies: [],
    
    healthCheck: async () => {
      const Docker = require('dockerode');
      try {
        const docker = new Docker();
        await docker.ping();
        return true;
      } catch {
        return false;
      }
    },
    
    customStart: async () => {
      // Docker daemon startup logic
      const DockerSetup = require('./dockerSetup.cjs');
      const dockerSetup = new DockerSetup();
      await dockerSetup.ensureDockerRunning();
      return dockerSetup;
    }
  },

  // Python Backend Service
  'python-backend': {
    name: 'Python Backend Service',
    type: 'docker-container',
    critical: true,
    autoRestart: true,
    priority: 2,
    dependencies: ['docker'],

    // NEW: Deployment mode support
    deploymentModes: ['docker', 'manual', 'remote'],
    platformSupport: {
      docker: ['win32', 'darwin', 'linux'], // Docker supported on all platforms
      manual: ['win32', 'darwin', 'linux'], // Manual/BYOS supported on all platforms
      remote: ['win32', 'darwin', 'linux'] // Remote server supported on all platforms
    },

    // NEW: Manual service configuration
    manual: {
      urlRequired: true,
      // On Linux (host network mode), use port 5000. On Windows/Mac (bridge mode), use port 5001
      defaultUrl: `http://localhost:${isLinux ? 5000 : 5001}`,
      healthEndpoint: '/health',
      configKey: 'python_backend_url',
      description: 'Bring Your Own Python Backend - Connect to external Python Backend instance'
    },

    dockerContainer: {
      name: 'clara_python',
      image: 'clara17verse/clara-backend:latest',
      // On Linux (host network mode), container runs on 5000 directly. On Windows/Mac, map 5001->5000
      ports: isLinux ? { '5000': '5000' } : { '5001': '5000' },
      volumes: [
        `${pythonBackendDataPath}:/home/clara`,
        'clara_python_models:/app/models'
      ],
      environment: [
        'PYTHONUNBUFFERED=1',
        'CLARA_ENV=production'
      ]
    },

    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      // On Linux (host network mode), use port 5000. On Windows/Mac (bridge mode), use port 5001
      const defaultPort = isLinux ? 5000 : 5001;
      const url = serviceUrl || `http://localhost:${defaultPort}`;
      const endpoint = serviceUrl ? `${url}/health` : `http://localhost:${defaultPort}/health`;
      return new Promise((resolve) => {
        const req = http.get(endpoint, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  },

  // ClaraCore Service (Core AI Engine)
  claracore: {
    name: 'Clara Core AI Engine',
    type: 'binary',
    critical: true,
    autoRestart: true,
    priority: 3,
    dependencies: ['docker'], // Docker dependency for docker mode

    // NEW: Deployment mode support
    deploymentModes: ['local', 'remote', 'docker'],
    platformSupport: {
      local: ['win32', 'darwin', 'linux'], // Native binary supported on all platforms
      remote: ['win32', 'darwin', 'linux'], // Remote server supported on all platforms
      docker: ['win32', 'linux'] // Docker supported on Windows and Linux (GPU support)
    },

    // Binary paths for each platform
    binaryPath: platform === 'win32'
      ? './claracore/claracore-windows-amd64.exe'
      : platform === 'darwin'
      ? os.arch() === 'arm64'
        ? './claracore/claracore-darwin-arm64'
        : './claracore/claracore-darwin-amd64'
      : platform === 'linux'
      ? os.arch() === 'arm64'
        ? './claracore/claracore-linux-arm64'
        : './claracore/claracore-linux-amd64'
      : './claracore/claracore-linux-amd64',

    // Service arguments
    args: ['-listen', ':8091'],

    ports: { main: 8091 },

    // Docker container configuration
    dockerContainer: {
      name: 'clara_core',
      imageBase: 'clara17verse/claracore', // Base image name, variant added based on GPU
      ports: { '8091': '5890' }, // Host:Container (container runs on 5890, mapped to host 8091)
      volumes: [
        'claracore:/app/downloads' // Named volume for downloads persistence
      ],
      environment: [
        'NODE_ENV=production',
        'CLARA_PORT=5890' // Container internal port
      ],
      // GPU-specific configurations
      gpuConfigs: {
        cuda: {
          image: 'clara17verse/claracore:cuda',
          runtime: 'nvidia',
          environment: [
            'NVIDIA_VISIBLE_DEVICES=all',
            'NVIDIA_DRIVER_CAPABILITIES=compute,utility'
          ]
        },
        rocm: {
          image: 'clara17verse/claracore:rocm',
          devices: ['/dev/kfd', '/dev/dri'],
          environment: [
            'HSA_OVERRIDE_GFX_VERSION=10.3.0'
          ]
        },
        vulkan: {
          image: 'clara17verse/claracore:vulkan',
          devices: ['/dev/dri'],
          environment: [
            'VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json'
          ]
        },
        cpu: {
          image: 'clara17verse/claracore:cpu',
          environment: []
        }
      }
    },

    // Health check
    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      const url = serviceUrl || 'http://localhost:8091';
      const endpoint = serviceUrl ? `${url}/health` : 'http://localhost:8091/health';
      return new Promise((resolve) => {
        const req = http.get(endpoint, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(false);
        });
      });
    },

    // Custom start method (for local mode)
    customStart: async () => {
      const ClaraCoreService = require('./claraCoreService.cjs');
      const service = new ClaraCoreService();
      await service.start();
      return service;
    },

    // Custom stop method (for local mode)
    customStop: async (service) => {
      if (service.instance && service.instance.stop) {
        await service.instance.stop();
      }
    },

    // Manual/Remote service configuration
    manual: {
      urlRequired: true,
      defaultUrl: 'http://localhost:8091',
      healthEndpoint: '/health',
      configKey: 'claracore_url',
      description: 'Connect to external ClaraCore instance (local, remote, or docker)'
    }
  },

  // ComfyUI Image Generation Service
  comfyui: {
    name: 'ComfyUI Image Generation',
    type: 'docker-container',
    critical: false, // Non-critical - user can disable
    autoRestart: true,
    priority: 4,
    dependencies: ['docker', 'python-backend'],

    // NEW: Deployment mode support
    deploymentModes: ['docker', 'manual', 'remote'],
    platformSupport: {
      docker: ['win32'], // Docker only supported on Windows
      manual: ['win32', 'darwin', 'linux'], // Manual/BYOS supported on all platforms
      remote: ['win32', 'darwin', 'linux'] // Remote server supported on all platforms
    },
    
    // NEW: Manual service configuration
    manual: {
      urlRequired: true,
      defaultUrl: 'http://localhost:8188',
      healthEndpoint: '/',
      configKey: 'comfyui_url',
      description: 'Bring Your Own ComfyUI - Connect to external ComfyUI instance'
    },
    
    dockerContainer: {
      name: 'clara_comfyui',
      image: 'clara17verse/clara-comfyui:with-custom-nodes',
      ports: { '8188': '8188' },
      volumes: [
        `${path.join(appDataPath, 'comfyui_models')}:/app/ComfyUI/models`,
        `${path.join(appDataPath, 'comfyui_output')}:/app/ComfyUI/output`,
        `${path.join(appDataPath, 'comfyui_input')}:/app/ComfyUI/input`,
        `${path.join(appDataPath, 'comfyui_custom_nodes')}:/app/ComfyUI/custom_nodes`,
        `${path.join(appDataPath, 'comfyui_temp')}:/tmp`
      ],
      environment: [
        'NVIDIA_VISIBLE_DEVICES=all',
        'CUDA_VISIBLE_DEVICES=0',
        'PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:2048,expandable_segments:True',
        'COMFYUI_FORCE_FP16=1',
        'COMFYUI_HIGHVRAM=1'
      ],
      runtime: 'nvidia' // GPU support
    },
    
    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      const url = serviceUrl || 'http://localhost:8188';
      return new Promise((resolve) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(10000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  },

  // N8N Workflow Automation
  n8n: {
    name: 'N8N Workflow Engine',
    type: 'docker-container',
    critical: false,
    autoRestart: true,
    priority: 5,
    dependencies: ['docker'],

    // NEW: Deployment mode support
    deploymentModes: ['docker', 'manual', 'remote'],
    platformSupport: {
      docker: ['win32', 'darwin', 'linux'], // Docker supported on all platforms
      manual: ['win32', 'darwin', 'linux'], // Manual/BYOS supported on all platforms
      remote: ['win32', 'darwin', 'linux'] // Remote server supported on all platforms
    },
    
    // NEW: Manual service configuration
    manual: {
      urlRequired: true,
      defaultUrl: 'http://localhost:5678',
      healthEndpoint: '/healthz',
      configKey: 'n8n_url',
      description: 'Bring Your Own N8N - Connect to external N8N instance'
    },
    
    dockerContainer: {
      name: 'clara_n8n',
      image: 'n8nio/n8n:latest',
      ports: { '5678': '5678' },
      volumes: [
        `${path.join(appDataPath, 'n8n')}:/home/node/.n8n`
      ],
      environment: [
        'N8N_BASIC_AUTH_ACTIVE=false',
        'N8N_METRICS=true',
        'WEBHOOK_URL=http://localhost:5678/',
        'GENERIC_TIMEZONE=UTC'
      ]
    },
    
    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      const url = serviceUrl || 'http://localhost:5678';
      const endpoint = serviceUrl ? `${url}/healthz` : 'http://localhost:5678/healthz';
      return new Promise((resolve) => {
        const req = http.get(endpoint, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  },

  // Model Context Protocol Service
  mcp: {
    name: 'Model Context Protocol',
    type: 'service',
    critical: false,
    autoRestart: true,
    priority: 6,
    dependencies: ['python-backend'],

    customStart: async () => {
      const MCPService = require('./mcpService.cjs');
      const service = new MCPService();
      await service.start();
      return service;
    },

    customStop: async (service) => {
      if (service.instance && service.instance.stop) {
        await service.instance.stop();
      }
    },

    healthCheck: async () => {
      // MCP health check logic
      return true; // Placeholder
    }
  },

  // MCP HTTP Proxy Service (for browser support)
  'mcp-proxy': {
    name: 'MCP HTTP Proxy',
    type: 'http-service',
    critical: false,
    autoRestart: true,
    priority: 7,
    dependencies: ['mcp'],

    ports: { main: 8092 },

    customStart: async (mcpServiceInstance) => {
      const MCPProxyService = require('./mcpProxyService.cjs');

      // Get the MCP service instance from dependencies
      // If not provided, create one (fallback)
      let mcpService = mcpServiceInstance;
      if (!mcpService) {
        const MCPService = require('./mcpService.cjs');
        mcpService = new MCPService();
      }

      const proxyService = new MCPProxyService(mcpService);
      const result = await proxyService.start(8092);

      return {
        instance: proxyService,
        url: result.url,
        port: result.port,
        healthCheck: result.healthCheck
      };
    },

    customStop: async (service) => {
      if (service.instance && service.instance.stop) {
        await service.instance.stop();
      }
    },

    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      const url = serviceUrl || 'http://localhost:8092';
      const endpoint = serviceUrl ? `${url}/health` : 'http://localhost:8092/health';
      return new Promise((resolve) => {
        const req = http.get(endpoint, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  }
};

/**
 * Platform-specific service configurations
 */
const PLATFORM_OVERRIDES = {
  darwin: {},
  linux: {},
  win32: {}
};

/**
 * Feature-based service selection
 * Based on user's feature selection during setup
 */
function getEnabledServices(selectedFeatures = {}) {
  const enabledServices = {};
  
  // Core services (always enabled)
  const coreServices = ['docker', 'python-backend', 'claracore'];
  
  // Optional services based on user selection
  if (selectedFeatures.comfyUI) {
    enabledServices.comfyui = SERVICE_DEFINITIONS.comfyui;
  }
  
  if (selectedFeatures.n8n) {
    enabledServices.n8n = SERVICE_DEFINITIONS.n8n;
  }
  
  // Add core services
  coreServices.forEach(serviceName => {
    if (SERVICE_DEFINITIONS[serviceName]) {
      enabledServices[serviceName] = SERVICE_DEFINITIONS[serviceName];
    }
  });
  
  return enabledServices;
}

/**
 * Apply platform-specific overrides
 */
function applyPlatformOverrides(services) {
  const platformOverrides = PLATFORM_OVERRIDES[platform] || {};
  
  const result = { ...services };
  
  Object.keys(platformOverrides).forEach(serviceName => {
    if (result[serviceName]) {
      result[serviceName] = {
        ...result[serviceName],
        ...platformOverrides[serviceName]
      };
    }
  });
  
  return result;
}

/**
 * Get complete service configuration for current platform and features
 */
function getServiceConfiguration(selectedFeatures = {}) {
  let services = getEnabledServices(selectedFeatures);
  services = applyPlatformOverrides(services);
  
  return services;
}

/**
 * Validate service configuration
 */
function validateServiceConfiguration(services) {
  const errors = [];
  
  // Check for circular dependencies
  const dependencies = {};
  Object.keys(services).forEach(name => {
    dependencies[name] = services[name].dependencies || [];
  });
  
  try {
    // Simple cycle detection
    const visited = new Set();
    const temp = new Set();
    
    const visit = (node) => {
      if (temp.has(node)) {
        errors.push(`Circular dependency detected involving ${node}`);
        return;
      }
      if (!visited.has(node)) {
        temp.add(node);
        dependencies[node].forEach(visit);
        temp.delete(node);
        visited.add(node);
      }
    };
    
    Object.keys(dependencies).forEach(visit);
  } catch (error) {
    errors.push(`Dependency validation failed: ${error.message}`);
  }
  
  // Check for missing dependencies
  Object.keys(services).forEach(serviceName => {
    const service = services[serviceName];
    service.dependencies?.forEach(dep => {
      if (!services[dep]) {
        errors.push(`Service ${serviceName} depends on ${dep} which is not enabled`);
      }
    });
  });
  
  return errors;
}

/**
 * Service health check timeouts by type
 */
const HEALTH_CHECK_TIMEOUTS = {
  'docker-daemon': 10000,
  'docker-container': 15000,
  'binary': 5000,
  'service': 3000
};

/**
 * Get health check timeout for service
 */
function getHealthCheckTimeout(service) {
  return HEALTH_CHECK_TIMEOUTS[service.type] || 5000;
}

/**
 * NEW: Check if a service supports a specific deployment mode on current platform
 */
function isServiceModeSupported(serviceName, deploymentMode, targetPlatform = platform) {
  const service = SERVICE_DEFINITIONS[serviceName];
  if (!service || !service.deploymentModes) {
    return deploymentMode === 'docker'; // Default to docker mode for backward compatibility
  }
  
  // Check if deployment mode is supported by service
  if (!service.deploymentModes.includes(deploymentMode)) {
    return false;
  }
  
  // Check platform support
  if (service.platformSupport) {
    if (typeof service.platformSupport === 'object') {
      // Platform support is mode-specific
      const supportedPlatforms = service.platformSupport[deploymentMode];
      return supportedPlatforms && supportedPlatforms.includes(targetPlatform);
    } else if (Array.isArray(service.platformSupport)) {
      // Platform support is general (backward compatibility)
      return service.platformSupport.includes(targetPlatform);
    }
  }
  
  return true; // No restrictions defined
}

/**
 * NEW: Get supported deployment modes for a service on current platform
 */
function getSupportedDeploymentModes(serviceName, targetPlatform = platform) {
  const service = SERVICE_DEFINITIONS[serviceName];
  if (!service || !service.deploymentModes) {
    return ['docker']; // Default to docker mode
  }
  
  return service.deploymentModes.filter(mode => 
    isServiceModeSupported(serviceName, mode, targetPlatform)
  );
}

/**
 * NEW: Get platform compatibility information for all services
 */
function getPlatformCompatibility(targetPlatform = platform) {
  const compatibility = {};
  
  Object.keys(SERVICE_DEFINITIONS).forEach(serviceName => {
    const service = SERVICE_DEFINITIONS[serviceName];
    
    compatibility[serviceName] = {
      name: service.name,
      critical: service.critical,
      supportedModes: getSupportedDeploymentModes(serviceName, targetPlatform),
      dockerSupported: isServiceModeSupported(serviceName, 'docker', targetPlatform),
      manualSupported: isServiceModeSupported(serviceName, 'manual', targetPlatform),
      manualConfig: service.manual || null
    };
  });
  
  return compatibility;
}

/**
 * NEW: Get services filtered by deployment mode and platform compatibility
 */
function getCompatibleServices(selectedFeatures = {}, preferredMode = 'docker', targetPlatform = platform) {
  let services = getEnabledServices(selectedFeatures);
  services = applyPlatformOverrides(services);
  
  // Filter services based on platform compatibility
  const compatibleServices = {};
  
  Object.keys(services).forEach(serviceName => {
    const service = services[serviceName];
    
    // Check if service supports preferred mode on current platform
    if (isServiceModeSupported(serviceName, preferredMode, targetPlatform)) {
      compatibleServices[serviceName] = {
        ...service,
        deploymentMode: preferredMode
      };
    } else {
      // Try to find alternative mode
      const supportedModes = getSupportedDeploymentModes(serviceName, targetPlatform);
      if (supportedModes.length > 0) {
        compatibleServices[serviceName] = {
          ...service,
          deploymentMode: supportedModes[0] // Use first available mode
        };
      }
      // If no modes supported, service is excluded (non-critical services only)
    }
  });
  
  return compatibleServices;
}

/**
 * NEW: Create manual service health check function
 */
function createManualHealthCheck(serviceUrl, healthEndpoint = '/') {
  return async () => {
    const http = require('http');
    const https = require('https');
    
    return new Promise((resolve) => {
      try {
        const url = new URL(serviceUrl);
        const client = url.protocol === 'https:' ? https : http;
        const endpoint = `${serviceUrl}${healthEndpoint}`.replace(/\/+/g, '/').replace(':/', '://');
        
        const req = client.get(endpoint, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      } catch (error) {
        resolve(false);
      }
    });
  };
}

module.exports = {
  SERVICE_DEFINITIONS,
  PLATFORM_OVERRIDES,
  getServiceConfiguration,
  validateServiceConfiguration,
  getEnabledServices,
  applyPlatformOverrides,
  getHealthCheckTimeout,
  HEALTH_CHECK_TIMEOUTS,
  // NEW: Deployment mode and platform compatibility functions
  isServiceModeSupported,
  getSupportedDeploymentModes,
  getPlatformCompatibility,
  getCompatibleServices,
  createManualHealthCheck
}; 