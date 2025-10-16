import React, { useEffect, useState, useRef } from 'react';
import {
  Server,
  Bot,
  Code,
  Image,
  Zap,
  ExternalLink,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  HardDrive,
  Save,
  Check,
  X,
  Monitor
} from 'lucide-react';
import { useProviders } from '../../contexts/ProvidersContext';

// Interfaces for service types
interface CoreService {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'running' | 'stopped';
  serviceUrl?: string;
  port?: number | string;
  deployment: string;
  engine?: string;
  autoStart: boolean;
  configurable: boolean;
  statusColor: string;
  actions: string[];
}

interface ConfigurableService {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'running' | 'stopped';
  mode: 'docker' | 'manual' | 'remote' | 'local';
  serviceUrl?: string;
  manualUrl?: string;
  remoteUrl?: string;
  platformSupport: {
    docker: boolean;
    manual: boolean;
    remote: boolean;
    local?: boolean; // For ClaraCore
  };
  isLoading?: boolean;
  error?: string;
  actions: string[];
}

// Docker Services Status Interface (reused from existing code)
interface DockerServicesStatus {
  dockerAvailable: boolean;
  n8nAvailable: boolean;
  pythonAvailable: boolean;
  message?: string;
  ports?: {
    python: number;
    n8n: number;
    ollama: number;
  };
}

// Service Status Interface (reused from existing code)
interface ServiceStatus {
  running: boolean;
  serviceUrl?: string;
  error?: string;
}

const UnifiedServiceManager: React.FC = () => {
  // Use ProvidersContext for managing Clara's Core provider URL updates
  const { updateProvider: updateProviderInContext, providers } = useProviders();

  // Core service states (reused from existing ServicesTab)
  const [dockerServices, setDockerServices] = useState<DockerServicesStatus>({
    dockerAvailable: false,
    n8nAvailable: false,
    pythonAvailable: false
  });

  // Configurable service states (reused from existing Settings.tsx)
  const [serviceConfigs, setServiceConfigs] = useState<any>({});
  const [enhancedServiceStatus, setEnhancedServiceStatus] = useState<any>({});
  const [currentPlatform, setCurrentPlatform] = useState<string>('win32');
  
  // N8N, ComfyUI, and Python Backend service status (reused from ServicesTab)
  const [n8nStatus, setN8nStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:5678'
  });
  const [comfyuiStatus, setComfyuiStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:8188'
  });
  const [pythonBackendStatus, setPythonBackendStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:5001'
  });
  const [claraCoreStatus, setClaraCoreStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:8091'
  });

  // Loading states
  const [globalLoading, setGlobalLoading] = useState(false);
  const [n8nLoading, setN8nLoading] = useState(false);
  const [comfyuiLoading, setComfyuiLoading] = useState(false);
  const [pythonBackendLoading, setPythonBackendLoading] = useState(false);
  const [claraCoreLoading, setClaraCoreLoading] = useState(false);
  
  // Clara Core Docker-specific states
  const [claraCoreDockerStatus, setClaraCoreDockerStatus] = useState<any>(null);
  const [claraCoreGPUInfo, setClaraCoreGPUInfo] = useState<any>(null);
  const [detectingGPU, setDetectingGPU] = useState(false);
  
  // Feature Configuration State
  const [featureConfig, setFeatureConfig] = useState({
    comfyUI: true,
    n8n: true,
    ragAndTts: true,
    claraCore: true
  });
  const [savingFeatureConfig, setSavingFeatureConfig] = useState(false);

  // Active Service Tab State (for card-based UI)
  const [activeServiceTab, setActiveServiceTab] = useState<string>('claracore');

  // Load feature configuration
  const loadFeatureConfig = async () => {
    try {
      if ((window as any).featureConfig?.getFeatureConfig) {
        const config = await (window as any).featureConfig.getFeatureConfig();
        if (config) {
          setFeatureConfig(config);
        }
      }
    } catch (error) {
      console.error('Failed to load feature configuration:', error);
    }
  };

  // Update feature configuration
  const updateFeatureConfig = async (updates: Partial<typeof featureConfig>) => {
    try {
      setSavingFeatureConfig(true);
      const newConfig = { ...featureConfig, ...updates };
      
      // Clara Core is always enabled
      newConfig.claraCore = true;
      
      setFeatureConfig(newConfig);
      
      // Save to electron backend
      if ((window as any).featureConfig?.updateFeatureConfig) {
        const success = await (window as any).featureConfig.updateFeatureConfig(newConfig);
        if (!success) {
          throw new Error('Failed to save feature configuration');
        }
      }
      
      // Dispatch event to notify other components (like Sidebar) about the config change
      const event = new CustomEvent('feature-config-updated', { detail: newConfig });
      window.dispatchEvent(event);
      console.log('🔄 UnifiedServiceManager - Dispatched feature-config-updated event');
      
    } catch (error) {
      console.error('Failed to update feature configuration:', error);
      // Revert on error
      setFeatureConfig(featureConfig);
      alert('❌ Failed to save feature configuration. Please try again.');
    } finally {
      setSavingFeatureConfig(false);
    }
  };
  const [dockerServiceLoading, setDockerServiceLoading] = useState<{ [key: string]: boolean }>({});

  // Manual service configuration states (reused from Settings.tsx)
  const [tempServiceUrls, setTempServiceUrls] = useState<{ [key: string]: string }>({});
  const [savingServiceConfig, setSavingServiceConfig] = useState<{ [key: string]: boolean }>({});
  const [testingServices, setTestingServices] = useState<{ [key: string]: boolean }>({});
  const [serviceTestResults, setServiceTestResults] = useState<{ [key: string]: any }>({});

  // Remote server state
  const [remoteServerConfig, setRemoteServerConfig] = useState<any>(null);
  const [claraCoreRemoteConfig, setClaraCoreRemoteConfig] = useState<any>(null);
  const [loadingRemoteConfig, setLoadingRemoteConfig] = useState(false);

  const expectedServiceStatesRef = useRef<{ [key: string]: boolean }>({});

  // Platform detection (reused from Settings.tsx)
  useEffect(() => {
    const platform = (window as any).electronAPI?.platform;
    if (platform) {
      if (platform.includes('win')) setCurrentPlatform('win32');
      else if (platform.includes('darwin')) setCurrentPlatform('darwin');
      else setCurrentPlatform('linux');
    } else {
      // Fallback for web environment
      setCurrentPlatform('win32');
    }
  }, []);

  // Load remote server configuration
  const loadRemoteServerConfig = async () => {
    try {
      if ((window as any).electron?.store?.get) {
        const config = await (window as any).electron.store.get('remoteServer');
        setRemoteServerConfig(config);
        
        // Also load ClaraCore remote config
        const claraCoreConfig = await (window as any).electron.store.get('claraCoreRemote');
        setClaraCoreRemoteConfig(claraCoreConfig);
      }
    } catch (error) {
      console.error('Failed to load remote server config:', error);
    }
  };

  // Load service configurations (reused from Settings.tsx)
  useEffect(() => {
    loadServiceConfigurations();
    loadFeatureConfig(); // Load feature configuration on mount
    loadRemoteServerConfig(); // Load remote server configuration
  }, []);

  // Status checking intervals (reused from ServicesTab)
  useEffect(() => {
    const checkDockerServices = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.checkDockerServices) {
          const status = await electron.checkDockerServices();
          setDockerServices(status);
        }
      } catch (error) {
        console.error('Failed to check Docker services:', error);
      }
    };

    checkDockerServices();
    fetchN8nStatus();
    fetchComfyuiStatus();
    fetchPythonBackendStatus();
    fetchClaraCoreStatus();

    // Auto-detect GPU for Clara Core Docker mode if configured
    const checkClaraCoreDockerMode = async () => {
      try {
        if ((window as any).electronAPI?.invoke) {
          const configs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
          if (configs?.claracore?.currentMode === 'docker') {
            // Auto-detect GPU on mount
            handleDetectGPU();
            fetchClaraCoreDockerStatus();
          }
        }
      } catch (error) {
        console.error('Error checking Clara Core Docker mode:', error);
      }
    };
    checkClaraCoreDockerMode();

    const interval = setInterval(() => {
      checkDockerServices();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // ===== REUSED FUNCTIONS FROM EXISTING CODE =====

  // Load service configurations (from Settings.tsx)
  const loadServiceConfigurations = async () => {
    try {
      if ((window as any).electronAPI?.invoke) {
        const configs = await (window as any).electronAPI.invoke('service-config:get-all-configs');

        // Map currentMode to mode for consistency with UI expectations
        const normalizedConfigs: any = {};
        Object.keys(configs).forEach(serviceName => {
          normalizedConfigs[serviceName] = {
            ...configs[serviceName],
            mode: configs[serviceName].currentMode || 'docker',
            url: configs[serviceName].currentUrl
          };
        });

        setServiceConfigs(normalizedConfigs);

        const status = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
        setEnhancedServiceStatus(status);
      }
    } catch (error) {
      console.error('Failed to load service configurations:', error);
    }
  };

  // Fetch N8N status (from ServicesTab)
  const fetchN8nStatus = async () => {
    try {
      const mode = serviceConfigs.n8n?.mode || 'docker';

      if (mode === 'remote') {
        // Remote mode - check remote server health
        const remoteUrl = serviceConfigs.n8n?.url || remoteServerConfig?.services?.n8n?.url;
        if (remoteUrl) {
          try {
            const response = await fetch(`${remoteUrl}/healthz`, {
              method: 'GET',
              signal: AbortSignal.timeout(5000)
            });
            const isHealthy = response.ok;
            setN8nStatus({
              running: isHealthy,
              serviceUrl: remoteUrl,
              error: isHealthy ? undefined : 'Remote service unhealthy'
            });
            return;
          } catch (fetchError) {
            setN8nStatus({
              running: false,
              serviceUrl: remoteUrl,
              error: 'Cannot reach remote service'
            });
            return;
          }
        }
      }

      // Docker or Manual mode
      const result = await (window as any).electronAPI.invoke('n8n:check-service-status');
      setN8nStatus({
        running: result.running || false,
        serviceUrl: result.serviceUrl || 'http://localhost:5678',
        error: result.error
      });
    } catch (error) {
      console.error('Error fetching N8N status:', error);
      setN8nStatus({
        running: false,
        serviceUrl: 'http://localhost:5678',
        error: 'Failed to check status'
      });
    }
  };

  // Fetch ComfyUI status (from ServicesTab)
  const fetchComfyuiStatus = async () => {
    try {
      const mode = serviceConfigs.comfyui?.mode || 'docker';

      if (mode === 'remote') {
        // Remote mode - check remote server health
        const remoteUrl = serviceConfigs.comfyui?.url || remoteServerConfig?.services?.comfyui?.url;
        if (remoteUrl) {
          try {
            const response = await fetch(`${remoteUrl}/system_stats`, {
              method: 'GET',
              signal: AbortSignal.timeout(5000)
            });
            const isHealthy = response.ok;
            setComfyuiStatus({
              running: isHealthy,
              serviceUrl: remoteUrl,
              error: isHealthy ? undefined : 'Remote service unhealthy'
            });
            return;
          } catch (fetchError) {
            setComfyuiStatus({
              running: false,
              serviceUrl: remoteUrl,
              error: 'Cannot reach remote service'
            });
            return;
          }
        }
      }

      // Docker or Manual mode
      const result = await (window as any).electronAPI.invoke('comfyui:check-service-status');
      setComfyuiStatus({
        running: result.running || false,
        serviceUrl: result.serviceUrl || 'http://localhost:8188',
        error: result.error
      });
    } catch (error) {
      console.error('Error fetching ComfyUI status:', error);
      setComfyuiStatus({
        running: false,
        serviceUrl: 'http://localhost:8188',
        error: 'Failed to check status'
      });
    }
  };

  // Fetch Python Backend status
  const fetchPythonBackendStatus = async () => {
    try {
      const mode = serviceConfigs['python-backend']?.mode || 'docker';

      if (mode === 'remote') {
        // Remote mode - check remote server health
        const remoteUrl = serviceConfigs['python-backend']?.url || remoteServerConfig?.services?.python?.url;
        if (remoteUrl) {
          try {
            const response = await fetch(`${remoteUrl}/health`, {
              method: 'GET',
              signal: AbortSignal.timeout(5000)
            });
            const isHealthy = response.ok;
            setPythonBackendStatus({
              running: isHealthy,
              serviceUrl: remoteUrl,
              error: isHealthy ? undefined : 'Remote service unhealthy'
            });
            return;
          } catch (fetchError) {
            setPythonBackendStatus({
              running: false,
              serviceUrl: remoteUrl,
              error: 'Cannot reach remote service'
            });
            return;
          }
        }
      }

      // Docker or Manual mode
      const result = await (window as any).electronAPI.invoke('python-backend:check-service-status');
      setPythonBackendStatus({
        running: result.running || false,
        serviceUrl: result.serviceUrl || 'http://localhost:5001',
        error: result.error
      });
    } catch (error) {
      console.error('Error fetching Python Backend status:', error);
      setPythonBackendStatus({
        running: false,
        serviceUrl: 'http://localhost:5001',
        error: 'Failed to check status'
      });
    }
  };

  // Fetch ClaraCore status
  const fetchClaraCoreStatus = async () => {
    try {
      const mode = serviceConfigs.claracore?.mode || 'local';
      let result;

      if (mode === 'docker') {
        // Docker mode - check Docker container status
        result = await (window as any).claraCore?.getDockerStatus();
        if (result && result.success) {
          setClaraCoreStatus({
            running: result.status.running || false,
            serviceUrl: 'http://localhost:8091',
            error: result.error
          });
          setClaraCoreDockerStatus(result.status);
        } else {
          setClaraCoreStatus({
            running: false,
            serviceUrl: 'http://localhost:8091',
            error: result?.error || 'Docker container not running'
          });
        }
      } else if (mode === 'remote') {
        // Remote mode - check remote server health
        const remoteUrl = serviceConfigs.claracore?.url || claraCoreRemoteConfig?.url || remoteServerConfig?.services?.claracore?.url;
        console.log('🔍 Checking ClaraCore remote status:', remoteUrl);
        if (remoteUrl) {
          try {
            const response = await fetch(`${remoteUrl}/health`, {
              method: 'GET',
              signal: AbortSignal.timeout(5000)
            });
            const isHealthy = response.ok;
            console.log('✅ ClaraCore remote health check:', isHealthy);
            setClaraCoreStatus({
              running: isHealthy,
              serviceUrl: remoteUrl,
              error: isHealthy ? undefined : 'Remote service unhealthy'
            });
          } catch (fetchError) {
            console.error('❌ ClaraCore remote health check failed:', fetchError);
            setClaraCoreStatus({
              running: false,
              serviceUrl: remoteUrl,
              error: 'Cannot reach remote service'
            });
          }
        } else {
          console.warn('⚠️ ClaraCore remote URL not configured');
          setClaraCoreStatus({
            running: false,
            serviceUrl: 'http://localhost:8091',
            error: 'Remote URL not configured'
          });
        }
      } else {
        // Local binary mode - check native binary status
        result = await (window as any).claraCore?.getStatus();
        if (result && result.success) {
          setClaraCoreStatus({
            running: result.status.isRunning || false,
            serviceUrl: result.status.url || 'http://localhost:8091',
            error: result.error
          });
        } else {
          setClaraCoreStatus({
            running: false,
            serviceUrl: 'http://localhost:8091',
            error: result?.error || 'Failed to check status'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching ClaraCore status:', error);
      setClaraCoreStatus({
        running: false,
        serviceUrl: 'http://localhost:8091',
        error: 'Failed to check status'
      });
    }
  };

  // Handle N8N actions (from ServicesTab)
  const handleN8nAction = async (action: 'start' | 'stop' | 'restart') => {
    setN8nLoading(true);
    try {
      const mode = serviceConfigs.n8n?.mode || 'docker';

      if (mode === 'remote') {
        // Remote mode: Services are managed on remote server
        alert(`⚠️ N8N is running on a remote server.\n\nTo control it, please ${action} the service on your remote server directly.\n\nRemote service management from the UI is coming soon!`);
        setN8nLoading(false);
        return;
      }

      // Docker or Manual mode
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:start-container');
      } else if (action === 'stop' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:stop-container');
      } else if (action === 'restart' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:restart-container');
      }

      if (result?.success) {
        setTimeout(() => fetchN8nStatus(), 3000);
      }
    } catch (error) {
      console.error('Error performing N8N action:', error);
    } finally {
      setN8nLoading(false);
    }
  };

  // Handle ComfyUI actions (from ServicesTab)
  const handleComfyuiAction = async (action: 'start' | 'stop' | 'restart') => {
    setComfyuiLoading(true);
    try {
      const mode = serviceConfigs.comfyui?.mode || 'docker';

      if (mode === 'remote') {
        // Remote mode: Services are managed on remote server
        alert(`⚠️ ComfyUI is running on a remote server.\n\nTo control it, please ${action} the service on your remote server directly.\n\nRemote service management from the UI is coming soon!`);
        setComfyuiLoading(false);
        return;
      }

      // Docker or Manual mode
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-start');
      } else if (action === 'stop' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-stop');
      } else if (action === 'restart' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-restart');
      }

      if (result?.success) {
        setTimeout(() => fetchComfyuiStatus(), 5000);
        setTimeout(() => fetchComfyuiStatus(), 15000);
      }
    } catch (error) {
      console.error('Error performing ComfyUI action:', error);
    } finally {
      setComfyuiLoading(false);
    }
  };

  // Handle Python Backend actions
  const handlePythonBackendAction = async (action: 'start' | 'stop' | 'restart') => {
    setPythonBackendLoading(true);
    try {
      const mode = serviceConfigs['python-backend']?.mode || 'docker';

      if (mode === 'remote') {
        // Remote mode: Services are managed on remote server
        alert(`⚠️ Python Backend is running on a remote server.\n\nTo control it, please ${action} the service on your remote server directly.\n\nRemote service management from the UI is coming soon!`);
        setPythonBackendLoading(false);
        return;
      }

      // Docker or Manual mode
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('start-python-container');
      } else if (action === 'stop' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('stop-docker-service', 'python');
      } else if (action === 'restart' && (window as any).electronAPI) {
        // Stop then start
        await (window as any).electronAPI.invoke('stop-docker-service', 'python');
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = await (window as any).electronAPI.invoke('start-python-container');
      }

      if (result?.success) {
        setTimeout(() => fetchPythonBackendStatus(), 3000);
        setTimeout(() => fetchPythonBackendStatus(), 10000);
      }
    } catch (error) {
      console.error('Error performing Python Backend action:', error);
    } finally {
      setPythonBackendLoading(false);
    }
  };

  // Handle ClaraCore actions
  const handleClaraCoreAction = async (action: 'start' | 'stop' | 'restart') => {
    setClaraCoreLoading(true);
    try {
      const mode = serviceConfigs.claracore?.mode || 'local';
      let result;
      
      if (mode === 'docker') {
        // Docker mode
        if (action === 'start' && (window as any).claraCore) {
          result = await (window as any).claraCore.startDocker();
        } else if (action === 'stop' && (window as any).claraCore) {
          result = await (window as any).claraCore.stopDocker();
        } else if (action === 'restart' && (window as any).claraCore) {
          result = await (window as any).claraCore.restartDocker();
        }
      } else {
        // Local binary mode
        if (action === 'start' && (window as any).claraCore) {
          result = await (window as any).claraCore.start();
        } else if (action === 'stop' && (window as any).claraCore) {
          result = await (window as any).claraCore.stop();
        } else if (action === 'restart' && (window as any).claraCore) {
          result = await (window as any).claraCore.restart();
        }
      }

      if (result?.success) {
        setTimeout(() => fetchClaraCoreStatus(), 2000);
        setTimeout(() => fetchClaraCoreStatus(), 5000);
      }
    } catch (error) {
      console.error('Error performing ClaraCore action:', error);
    } finally {
      setClaraCoreLoading(false);
    }
  };

  // Detect GPU for Clara Core Docker
  const handleDetectGPU = async () => {
    setDetectingGPU(true);
    try {
      const result = await (window as any).claraCore.detectGPU();
      if (result?.success) {
        setClaraCoreGPUInfo(result.gpuInfo);
      }
    } catch (error) {
      console.error('Error detecting GPU:', error);
    } finally {
      setDetectingGPU(false);
    }
  };

  // Fetch Clara Core Docker status
  const fetchClaraCoreDockerStatus = async () => {
    try {
      const result = await (window as any).claraCore.getDockerStatus();
      if (result?.success) {
        setClaraCoreDockerStatus(result.status);
      }
    } catch (error) {
      console.error('Error fetching Clara Core Docker status:', error);
    }
  };

  // Handle Docker service actions (from ServicesTab)
  const handleDockerServiceAction = async (service: string, action: 'start' | 'stop' | 'restart') => {
    const loadingKey = `${service}-${action}`;
    setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('electronAPI not available');
        return;
      }

      // Use specific service handlers instead of generic container actions
      // This ensures containers are created if they don't exist
      let result;
      
      if (service === 'python') {
        if (action === 'start') {
          result = await electronAPI.invoke('start-python-container');
        } else {
          // For stop/restart, try to use generic docker service handler
          result = await electronAPI.invoke('stop-docker-service', service);
        }
      } else if (service === 'n8n') {
        if (action === 'start') {
          result = await electronAPI.invoke('n8n:start-container');
        } else if (action === 'stop') {
          result = await electronAPI.invoke('n8n:stop-container');
        } else if (action === 'restart') {
          result = await electronAPI.invoke('n8n:restart-container');
        }
      } else {
        console.error(`Unknown service: ${service}`);
        return;
      }
      
      if (result?.success) {
        let expectedState: boolean;
        if (action === 'start') {
          expectedState = true;
        } else if (action === 'stop') {
          expectedState = false;
        } else {
          expectedState = true;
        }
        
        expectedServiceStatesRef.current = { ...expectedServiceStatesRef.current, [service]: expectedState };
        
        setTimeout(async () => {
          try {
            const electron = (window as any).electron;
            if (electron?.checkDockerServices) {
              const status = await electron.checkDockerServices();
              setDockerServices(status);
            }
          } catch (error) {
            console.error('Error refreshing services after action:', error);
          }
        }, 1000);
      } else {
        console.error(`Failed to ${action} ${service}:`, result?.error || 'Unknown error');
      }
    } catch (error) {
      console.error(`Failed to ${action} ${service}:`, error);
    } finally {
      setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  // Update service config (from Settings.tsx)
  const updateServiceConfig = async (serviceName: string, mode: string, url?: string) => {
    try {
      setSavingServiceConfig(prev => ({ ...prev, [serviceName]: true }));

      // For remote mode, get URL from remote server config
      if (mode === 'remote') {
        const remoteService = remoteServerConfig?.services?.[serviceName];
        url = remoteService?.url || url;
      }

      if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('service-config:set-config', serviceName, mode, url);
        // Don't reload configurations immediately - let the local state updates persist
        // await loadServiceConfigurations();
      }
    } catch (error) {
      console.error('Failed to update service config:', error);
      // On error, reload to get the correct state
      await loadServiceConfigurations();
    } finally {
      setSavingServiceConfig(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  // Handle mode switching with confirmation for Clara Core
  const handleModeSwitch = async (serviceName: string, newMode: string, url?: string) => {
    const currentConfig = serviceConfigs[serviceName];
    const currentMode = currentConfig?.mode;

    // If switching from an active mode, ask for confirmation
    if (serviceName === 'claracore' && currentMode && currentMode !== newMode) {
      const modeNames: Record<string, string> = {
        local: 'Local',
        docker: 'Docker',
        manual: 'Manual',
        remote: 'Remote'
      };

      const confirmed = window.confirm(
        `Do you want to stop the ${modeNames[currentMode] || currentMode} Clara Core service and switch to ${modeNames[newMode] || newMode} mode?\n\nThis will:\n1. Stop the currently running service\n2. Switch to ${modeNames[newMode]} mode\n3. Start the service automatically`
      );

      if (!confirmed) {
        return; // User cancelled, don't switch
      }

      // Stop the current service based on mode
      try {
        if (currentMode === 'local') {
          await (window as any).claraCore?.stop();
        } else if (currentMode === 'docker') {
          await (window as any).claraCore?.stopDocker();
        }
        
        // Wait a moment for service to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error stopping current service:', error);
      }
    }

    // Update local state immediately
    setServiceConfigs((prev: any) => ({
      ...prev,
      [serviceName]: {
        ...prev[serviceName],
        mode: newMode,
        url: url
      }
    }));

    // Update backend config
    await updateServiceConfig(serviceName, newMode, url);

    // Auto-start the new service for Clara Core
    if (serviceName === 'claracore') {
      try {
        // Wait a moment before starting
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (newMode === 'local') {
          await (window as any).claraCore?.start();
        } else if (newMode === 'docker') {
          await (window as any).claraCore?.startDocker();
        }

        // Update Clara's Core provider URL in database when mode changes
        try {
          const clarasCoreProvider = providers.find((p: any) => p.type === 'claras-pocket');

          if (clarasCoreProvider) {
            const newBaseUrl = url ? `${url}/v1` : 'http://localhost:8091/v1';
            console.log(`🔄 Updating Clara's Core provider URL: ${clarasCoreProvider.baseUrl} → ${newBaseUrl}`);
            await updateProviderInContext(clarasCoreProvider.id, {
              baseUrl: newBaseUrl
            });
            console.log('✅ Clara\'s Core provider URL updated successfully');
          }
        } catch (providerError) {
          console.error('Failed to update Clara\'s Core provider URL:', providerError);
        }

        // Refresh status
        setTimeout(() => fetchClaraCoreStatus(), 2000);
      } catch (error) {
        console.error('Error starting new service:', error);
      }
    }
  };

  // Save manual service URL (from Settings.tsx)
  const saveManualServiceUrl = async (serviceName: string) => {
    const urlToSave = tempServiceUrls[serviceName] || serviceConfigs[serviceName]?.url || '';
    if (!urlToSave.trim()) {
      return;
    }
    
    // Update local state immediately
    setServiceConfigs((prev: any) => ({
      ...prev,
      [serviceName]: { 
        ...prev[serviceName], 
        mode: 'manual',
        url: urlToSave.trim()
      }
    }));
    
    await updateServiceConfig(serviceName, 'manual', urlToSave.trim());
    
    // Clear temp URL after saving
    setTempServiceUrls(prev => ({ ...prev, [serviceName]: '' }));
    
    // Reload configurations after a delay to ensure backend sync
    setTimeout(() => {
      loadServiceConfigurations();
    }, 1000);
  };

  // Test manual service (from Settings.tsx)
  const testManualService = async (serviceName: string, url: string) => {
    setTestingServices(prev => ({ ...prev, [serviceName]: true }));
    
    try {
      if ((window as any).electronAPI?.invoke) {
        const result = await (window as any).electronAPI.invoke('service-config:test-manual-service', serviceName, url);
        setServiceTestResults(prev => ({ ...prev, [serviceName]: result }));
        
        setTimeout(() => {
          setServiceTestResults(prev => ({ ...prev, [serviceName]: null }));
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to test service:', error);
      setServiceTestResults(prev => ({ 
        ...prev, 
        [serviceName]: { 
          success: false, 
          error: 'Test failed: ' + (error instanceof Error ? error.message : String(error))
        }
      }));
    } finally {
      setTestingServices(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  // Refresh all services
  const refreshAllServices = async () => {
    setGlobalLoading(true);
    try {
      await Promise.all([
        loadServiceConfigurations(),
        fetchN8nStatus(),
        fetchComfyuiStatus(),
        fetchPythonBackendStatus(),
        fetchClaraCoreStatus()
      ]);
    } catch (error) {
      console.error('Error refreshing services:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  // ===== UNIFIED SERVICE DATA =====

  // Core Services
  const coreServices: CoreService[] = [
    // ClaraCore is now in Configurable Services section for full control
  ];

  // Configurable Services
  const configurableServices: ConfigurableService[] = [
    {
      id: 'claracore',
      name: 'Clara Core AI Engine',
      description: 'Core AI engine with model management (llama.cpp)',
      icon: Bot,
      status: claraCoreStatus.running ? 'running' : 'stopped',
      mode: serviceConfigs.claracore?.mode || 'local',
      serviceUrl: claraCoreStatus.serviceUrl,
      manualUrl: serviceConfigs.claracore?.url,
      remoteUrl: remoteServerConfig?.services?.claracore?.url,
      platformSupport: {
        local: true,  // ClaraCore native binary
        docker: currentPlatform === 'win32' || currentPlatform === 'linux', // Docker supported on Windows and Linux
        manual: false, // Use "local" instead of "manual" for Clara Core
        remote: true
      },
      isLoading: claraCoreLoading,
      error: claraCoreStatus.error,
      actions: claraCoreStatus.running ? ['open', 'stop', 'restart'] : ['start']
    },
    {
      id: 'python-backend',
      name: 'Python Backend',
      description: 'RAG, TTS, STT, and document processing services',
      icon: Code,
      status: pythonBackendStatus.running ? 'running' : 'stopped',
      mode: serviceConfigs['python-backend']?.mode || 'docker',
      serviceUrl: pythonBackendStatus.serviceUrl,
      manualUrl: serviceConfigs['python-backend']?.url,
      remoteUrl: remoteServerConfig?.services?.python?.url,
      platformSupport: {
        docker: true,
        manual: true,
        remote: true
      },
      isLoading: pythonBackendLoading,
      error: pythonBackendStatus.error,
      actions: pythonBackendStatus.running ? ['open', 'stop', 'restart'] : ['start']
    },
    {
      id: 'n8n',
      name: 'N8N Workflows',
      description: 'Visual workflow builder and automation platform',
      icon: Zap,
      status: n8nStatus.running ? 'running' : 'stopped',
      mode: serviceConfigs.n8n?.mode || 'docker',
      serviceUrl: n8nStatus.serviceUrl,
      manualUrl: serviceConfigs.n8n?.url,
      remoteUrl: remoteServerConfig?.services?.n8n?.url,
      platformSupport: {
        docker: true,
        manual: true,
        remote: true
      },
      isLoading: n8nLoading,
      error: n8nStatus.error,
      actions: n8nStatus.running ? ['open', 'stop', 'restart'] : ['start']
    },
    {
      id: 'comfyui',
      name: 'ComfyUI Image Generation',
      description: 'AI image generation with Stable Diffusion',
      icon: Image,
      status: comfyuiStatus.running ? 'running' : 'stopped',
      mode: serviceConfigs.comfyui?.mode || 'docker',
      serviceUrl: comfyuiStatus.serviceUrl,
      manualUrl: serviceConfigs.comfyui?.url,
      remoteUrl: remoteServerConfig?.services?.comfyui?.url,
      platformSupport: {
        docker: currentPlatform === 'win32',
        manual: true,
        remote: true
      },
      isLoading: comfyuiLoading,
      error: comfyuiStatus.error,
      actions: comfyuiStatus.running ? ['open', 'stop', 'restart'] : ['start']
    }
  ];

  // ===== RENDER COMPONENTS =====

  const renderCoreServiceCard = (service: CoreService) => {
    const isRunning = service.status === 'running';
    const colorClasses = {
      emerald: {
        bg: 'from-emerald-50/50 to-green-50/50 dark:from-emerald-900/20 dark:to-green-900/20',
        border: 'border-emerald-200 dark:border-emerald-700',
        icon: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        status: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
        text: 'text-emerald-700 dark:text-emerald-300'
      },
      blue: {
        bg: 'from-blue-50/50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/20',
        border: 'border-blue-200 dark:border-blue-700',
        icon: 'bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700',
        iconColor: 'text-blue-600 dark:text-blue-400',
        status: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        text: 'text-blue-700 dark:text-blue-300'
      },
      purple: {
        bg: 'from-purple-50/50 to-violet-50/50 dark:from-purple-900/20 dark:to-violet-900/20',
        border: 'border-purple-200 dark:border-purple-700',
        icon: 'bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-700',
        iconColor: 'text-purple-600 dark:text-purple-400',
        status: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        text: 'text-purple-700 dark:text-purple-300'
      }
    };

    const colors = colorClasses[service.statusColor as keyof typeof colorClasses];
    const isLoading = (service.id === 'python-backend' && Object.values(dockerServiceLoading).some(Boolean));

    return (
      <div key={service.id} className={`p-6 bg-gradient-to-r ${colors.bg} rounded-xl border ${colors.border}`}>
        {/* Service Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 ${colors.icon} border-2 rounded-xl flex items-center justify-center`}>
              <service.icon className={`w-7 h-7 ${colors.iconColor}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {service.name}
                {service.id === 'clara-core' && (
                  <span className={`px-2 py-1 ${colors.status} text-xs font-medium rounded-full`}>
                    Built-in
                  </span>
                )}
                {service.id === 'python-backend' && (
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                    Critical
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {service.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {isRunning ? 'Running' : 'Stopped'}
            </span>
            {service.id === 'clara-core' && (
              <span className={`px-3 py-1 ${colors.status} text-xs font-medium rounded-full`}>
                Built-in
              </span>
            )}
            {service.id === 'python-backend' && (
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                Docker
              </span>
            )}
          </div>
        </div>

        {/* Status and Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Status: {isRunning ? 'Running' : 'Stopped'}
                {service.serviceUrl && (
                  <span className="ml-2 font-mono text-xs">
                    {service.serviceUrl.replace('http://', '')}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              {service.actions.includes('open') && service.serviceUrl && isRunning && (
                <button
                  onClick={() => window.open(service.serviceUrl, '_blank')}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </button>
              )}
              {service.actions.includes('start') && !isRunning && (
                <button
                  onClick={() => {
                    if (service.id === 'python-backend') handleDockerServiceAction('python', 'start');
                  }}
                  disabled={isLoading}
                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {isLoading ? 'Starting...' : 'Start'}
                </button>
              )}
              {service.actions.includes('stop') && isRunning && (
                <button
                  onClick={() => {
                    if (service.id === 'python-backend') handleDockerServiceAction('python', 'stop');
                  }}
                  disabled={isLoading}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                  {isLoading ? 'Stopping...' : 'Stop'}
                </button>
              )}
              {service.actions.includes('restart') && (
                <button
                  onClick={() => {
                    if (service.id === 'python-backend') handleDockerServiceAction('python', 'restart');
                  }}
                  disabled={isLoading}
                  className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Restarting...' : 'Restart'}
                </button>
              )}
            </div>
          </div>
          
          {/* Service Details */}
          <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Deployment:</span>
                <span className={`ml-1 font-medium ${colors.text}`}>{service.deployment}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  {service.id === 'python-backend' ? 'Services:' : 'Engine:'}
                </span>
                <span className={`ml-1 font-medium ${colors.text}`}>{service.engine}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Auto-Start:</span>
                <span className={`ml-1 font-medium ${colors.text}`}>
                  {service.autoStart ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Configurable:</span>
                <span className="ml-1 font-medium text-gray-500 dark:text-gray-400">
                  {service.configurable ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConfigurableServiceCard = (service: ConfigurableService) => {
    const config = serviceConfigs[service.id] || { mode: service.id === 'claracore' ? 'local' : 'docker', url: null };
    const testResult = serviceTestResults[service.id];
    const isRunning = service.status === 'running';
    // ComfyUI Docker is only supported on Windows
    const isManualOnly = (service.id === 'comfyui' && currentPlatform !== 'win32');
    
    // Docker disabled reason for tooltip
    const dockerDisabledReason = service.id === 'claracore' && currentPlatform === 'darwin' 
      ? 'Docker mode not supported on macOS. Use Local or Remote mode instead.' 
      : service.id === 'comfyui' && currentPlatform !== 'win32'
      ? 'ComfyUI Docker mode is only supported on Windows'
      : '';

    return (
      <div key={service.id} className="p-6 bg-white/50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        {/* Service Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-700'
                : 'bg-gray-100 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600'
            }`}>
              <service.icon className={`w-6 h-6 ${isRunning ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {service.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {service.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isRunning
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : service.isLoading
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              {service.isLoading ? 'Starting...' : (isRunning ? 'Running' : 'Stopped')}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              config.mode === 'docker'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : config.mode === 'remote'
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
            }`}>
              {config.mode === 'docker' ? 'Docker' : config.mode === 'remote' ? 'Remote' : 'Manual'}
            </span>
          </div>
        </div>

        {/* Platform Warning for ComfyUI and ClaraCore */}
        {isManualOnly && service.id !== 'claracore' && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <strong>Platform Limitation:</strong> ComfyUI Docker mode is only supported on Windows.
                {currentPlatform === 'darwin' ? ' On macOS, please use manual setup.' : ' On Linux, please use manual setup.'}
              </p>
            </div>
          </div>
        )}
        {service.id === 'claracore' && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Flexible Deployment:</strong> ClaraCore supports 3 modes - <strong>Local</strong> (native binary for max performance), 
                <strong> Docker</strong> (containerized with auto GPU detection{currentPlatform === 'darwin' ? ', macOS not supported' : ''}), 
                and <strong>Remote</strong> (connect to external instance).
              </p>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Deployment Mode
            </label>
            <div className="flex gap-3">
              {/* Local Mode (for ClaraCore) */}
              {service.platformSupport.local && (
                <button
                  onClick={() => {
                    // Use the new mode switch handler with confirmation
                    handleModeSwitch(service.id, 'local');
                  }}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all relative ${
                    config.mode === 'local'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shadow-md'
                      : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {config.mode === 'local' && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                  )}
                  <div className="flex items-center gap-2">
                    <Bot className={`w-4 h-4 ${config.mode === 'local' ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                    <span className="font-medium">Local</span>
                    {config.mode === 'local' && (
                      <span className="ml-auto text-xs bg-emerald-100 dark:bg-emerald-800 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 text-left">
                    Native binary for maximum performance
                  </p>
                </button>
              )}

              {/* Docker Mode */}
              {service.platformSupport.docker && (
                <button
                  onClick={() => {
                    if (!isManualOnly) {
                      // Use the new mode switch handler with confirmation
                      handleModeSwitch(service.id, 'docker');
                    }
                  }}
                  disabled={isManualOnly}
                  title={isManualOnly ? dockerDisabledReason || `Docker mode not available for ${service.name} on this platform` : 'Run in Docker container with automatic GPU detection'}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all relative ${
                    config.mode === 'docker'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-md'
                      : isManualOnly
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {config.mode === 'docker' && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                  )}
                  <div className="flex items-center gap-2">
                    <HardDrive className={`w-4 h-4 ${config.mode === 'docker' ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                    <span className="font-medium">Docker</span>
                    {config.mode === 'docker' && (
                      <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 text-left">
                    Managed containers with automatic setup
                  </p>
                </button>
              )}

              {/* Manual Mode */}
              {service.platformSupport.manual && (
              <button
                onClick={() => {
                  // Pre-populate with default URL if none exists
                  const defaultUrl = service.id === 'claracore'
                    ? 'http://localhost:8091'
                    : service.id === 'comfyui'
                      ? 'http://localhost:8188'
                      : service.id === 'python-backend'
                        ? 'http://localhost:5001'
                        : 'http://localhost:5678';

                  const urlToUse = config.url || defaultUrl;

                  // Set temp URL for editing
                  setTempServiceUrls(prev => ({
                    ...prev,
                    [service.id]: urlToUse
                  }));

                  // Use the new mode switch handler with confirmation
                  handleModeSwitch(service.id, 'manual', urlToUse);
                }}
                className={`flex-1 p-3 rounded-lg border-2 transition-all relative ${
                  config.mode === 'manual'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 text-gray-700 dark:text-gray-300'
                }`}
              >
                {config.mode === 'manual' && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                )}
                <div className="flex items-center gap-2">
                  <ExternalLink className={`w-4 h-4 ${config.mode === 'manual' ? 'text-purple-600 dark:text-purple-400' : ''}`} />
                  <span className="font-medium">Manual</span>
                  {config.mode === 'manual' && (
                    <span className="ml-auto text-xs bg-purple-100 dark:bg-purple-800 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 text-left">
                  External service with custom URL
                </p>
              </button>
              )}

              {/* Remote Mode */}
              <button
                onClick={() => {
                  let remoteUrl = '';
                  let isDeployed = false;

                  // For ClaraCore, check both claraCoreRemote and remoteServer configs
                  if (service.id === 'claracore') {
                    if (claraCoreRemoteConfig?.deployed && claraCoreRemoteConfig?.url) {
                      // ClaraCore deployed via dedicated remote deployment
                      remoteUrl = claraCoreRemoteConfig.url;
                      isDeployed = true;
                      console.log('🔍 [Remote Mode] ClaraCore deployed via dedicated remote:', remoteUrl);
                    } else if (remoteServerConfig?.services?.claracore?.url) {
                      // ClaraCore deployed via remote server deployment
                      remoteUrl = remoteServerConfig.services.claracore.url;
                      isDeployed = true;
                      console.log('🔍 [Remote Mode] ClaraCore deployed via remote server:', remoteUrl);
                    }
                  } else {
                    // For other services, check remote server config
                    // Map service IDs to remote server keys (python-backend -> python)
                    const remoteServiceKey = service.id === 'python-backend' ? 'python' : service.id;
                    console.log('🔍 [Remote Mode] Checking remote service:', service.id, '-> key:', remoteServiceKey);
                    console.log('🔍 [Remote Mode] Available services:', remoteServerConfig?.services);
                    const remoteService = remoteServerConfig?.services?.[remoteServiceKey];
                    console.log('🔍 [Remote Mode] Found remote service:', remoteService);

                    if (remoteService?.url) {
                      remoteUrl = remoteService.url;
                      isDeployed = true;
                    }
                  }

                  // Check if service is deployed
                  if (!isDeployed || !remoteUrl) {
                    alert(`⚠️ ${service.name} is not deployed on remote server.\n\n${service.id === 'claracore' ? 'Go to Remote ClaraCore tab to deploy it first.' : 'Go to Remote Server tab to deploy it first.'}`);
                    return;
                  }

                  // Switch to remote mode
                  console.log('🔍 [Remote Mode] Using URL:', remoteUrl);

                  // Use the new mode switch handler with confirmation
                  handleModeSwitch(service.id, 'remote', remoteUrl);

                  // Refresh service status after mode change
                  setTimeout(() => {
                    if (service.id === 'claracore') fetchClaraCoreStatus();
                    else if (service.id === 'n8n') fetchN8nStatus();
                    else if (service.id === 'comfyui') fetchComfyuiStatus();
                    else if (service.id === 'python-backend') fetchPythonBackendStatus();
                  }, 1000);
                }}
                disabled={
                  service.id === 'claracore' 
                    ? !claraCoreRemoteConfig?.deployed && !remoteServerConfig?.services?.claracore
                    : !remoteServerConfig?.isConnected
                }
                className={`flex-1 p-3 rounded-lg border-2 transition-all relative ${
                  config.mode === 'remote'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 shadow-md'
                    : (service.id === 'claracore' ? (claraCoreRemoteConfig?.deployed || remoteServerConfig?.services?.claracore) : remoteServerConfig?.isConnected)
                      ? 'border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-500 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 text-gray-700 dark:text-gray-300'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                {config.mode === 'remote' && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                )}
                <div className="flex items-center gap-2">
                  <Server className={`w-4 h-4 ${config.mode === 'remote' ? 'text-orange-600 dark:text-orange-400' : ''}`} />
                  <span className="font-medium">Remote</span>
                  {config.mode === 'remote' && (
                    <span className="ml-auto text-xs bg-orange-100 dark:bg-orange-800 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 text-left">
                  {service.id === 'claracore' && claraCoreRemoteConfig?.deployed
                    ? `Server: ${claraCoreRemoteConfig.host}`
                    : remoteServerConfig?.isConnected
                      ? `Server: ${remoteServerConfig.host}`
                      : 'Setup required'
                  }
                </p>
              </button>
            </div>
          </div>

          {/* Docker GPU Detection - Clara Core Only */}
          {service.id === 'claracore' && config.mode === 'docker' && (
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Docker Container with GPU Acceleration
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Clara Core will run in a Docker container with automatic GPU detection and acceleration.
                      </p>
                    </div>

                    {/* GPU Detection Button */}
                    <button
                      onClick={handleDetectGPU}
                      disabled={detectingGPU}
                      className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg transition-all flex items-center gap-2 font-medium border border-blue-200 dark:border-blue-700 disabled:opacity-50"
                    >
                      {detectingGPU ? (
                        <>
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          Detecting GPU...
                        </>
                      ) : (
                        <>
                          <Monitor className="w-4 h-4" />
                          Detect GPU
                        </>
                      )}
                    </button>

                    {/* GPU Info Display */}
                    {claraCoreGPUInfo && (
                      <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-700">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${
                            claraCoreGPUInfo.type === 'cuda' ? 'bg-green-500' :
                            claraCoreGPUInfo.type === 'rocm' ? 'bg-red-500' :
                            claraCoreGPUInfo.type === 'vulkan' ? 'bg-purple-500' :
                            'bg-gray-500'
                          }`}></div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {claraCoreGPUInfo.type === 'cuda' ? '🎮 NVIDIA CUDA' :
                             claraCoreGPUInfo.type === 'rocm' ? '🔴 AMD ROCm' :
                             claraCoreGPUInfo.type === 'vulkan' ? '🟣 Vulkan' :
                             '🖥️ CPU Only'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {claraCoreGPUInfo.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                          Image: <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">
                            clara17verse/claracore:{claraCoreGPUInfo.type}
                          </code>
                        </p>
                      </div>
                    )}

                    {/* Docker Status */}
                    {claraCoreDockerStatus && claraCoreDockerStatus.exists && (
                      <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <strong>Container Status:</strong> {claraCoreDockerStatus.running ? '✅ Running' : '⚪ Stopped'}
                        </p>
                        {claraCoreDockerStatus.image && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Image: <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">
                              {claraCoreDockerStatus.image}
                            </code>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Remote Server Info */}
          {config.mode === 'remote' && remoteServerConfig && (
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <div className="flex items-start gap-3">
                <Server className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium text-orange-900 dark:text-orange-100">
                    Running on Remote Server
                  </h4>
                  <div className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                    <p><strong>Host:</strong> {remoteServerConfig.host}</p>
                    <p><strong>Service URL:</strong> <code className="bg-orange-100 dark:bg-orange-900/30 px-1 py-0.5 rounded">{config.url}</code></p>
                    <p className="text-xs mt-2 pt-2 border-t border-orange-200 dark:border-orange-700">
                      💡 This service is running on your remote server. To switch back to local, select Docker or Manual mode.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual URL Configuration */}
          {config.mode === 'manual' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Service URL
                {config.url ? (
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-normal">
                    ✓ Saved: <span className="font-mono">{config.url}</span>
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-orange-600 dark:text-orange-400 font-normal">
                    (Required - Enter URL and click Save)
                  </span>
                )}
              </label>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={tempServiceUrls[service.id] !== undefined && tempServiceUrls[service.id] !== '' 
                      ? tempServiceUrls[service.id] 
                      : config.url || ''
                    }
                    onChange={(e) => {
                      setTempServiceUrls(prev => ({
                        ...prev,
                        [service.id]: e.target.value
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveManualServiceUrl(service.id);
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-purple-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder={service.id === 'claracore'
                      ? 'http://localhost:8091'
                      : service.id === 'comfyui'
                        ? 'http://localhost:8188'
                        : service.id === 'python-backend'
                          ? 'http://localhost:5001'
                          : 'http://localhost:5678'
                    }
                  />
                  
                  <button
                    onClick={() => saveManualServiceUrl(service.id)}
                    disabled={savingServiceConfig[service.id] || 
                      !(tempServiceUrls[service.id] !== undefined 
                        ? tempServiceUrls[service.id].trim()
                        : config.url?.trim()
                      )
                    }
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 font-medium ${
                      tempServiceUrls[service.id] && tempServiceUrls[service.id] !== config.url
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {savingServiceConfig[service.id] ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                      </>
                    ) : tempServiceUrls[service.id] && tempServiceUrls[service.id] !== config.url ? (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save URL
                      </>
                    )}
                  </button>
                </div>

                {/* Test Connection Button */}
                <div className="flex gap-2">
                  {(config.url || tempServiceUrls[service.id]) && (
                    <button
                      onClick={() => {
                        const urlToTest = tempServiceUrls[service.id] || config.url;
                        testManualService(service.id, urlToTest);
                      }}
                      disabled={testingServices[service.id]}
                      className={`flex-1 px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 font-medium ${
                        testResult?.success === true
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                          : testResult?.success === false
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700'
                      } disabled:opacity-50`}
                    >
                      {testingServices[service.id] ? (
                        <>
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          Testing Connection...
                        </>
                      ) : testResult?.success === true ? (
                        <>
                          <Check className="w-4 h-4" />
                          Connection Successful
                        </>
                      ) : testResult?.success === false ? (
                        <>
                          <X className="w-4 h-4" />
                          Connection Failed
                        </>
                      ) : (
                        <>
                          <Server className="w-4 h-4" />
                          Test Connection
                        </>
                      )}
                    </button>
                  )}

                  {/* Clear Button */}
                  {(tempServiceUrls[service.id] || config.url) && (
                    <button
                      onClick={async () => {
                        setTempServiceUrls(prev => ({ ...prev, [service.id]: '' }));
                        await updateServiceConfig(service.id, 'manual', '');
                        
                        setServiceTestResults(prev => ({ 
                          ...prev, 
                          [service.id]: { 
                            success: true, 
                            message: 'URL cleared successfully',
                            timestamp: Date.now()
                          }
                        }));
                        
                        setTimeout(() => {
                          setServiceTestResults(prev => ({ ...prev, [service.id]: null }));
                        }, 3000);
                      }}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                      <X className="w-3 h-3" />
                      Clear
                    </button>
                  )}
                </div>

                {/* Test Result Messages */}
                {testResult && (
                  <div className={`p-2 rounded-lg text-sm ${
                    testResult.success === true
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                      : testResult.success === false
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                  }`}>
                    {testResult.success === true ? (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        <span>{testResult.message || 'Service is accessible and responding correctly!'}</span>
                      </div>
                    ) : testResult.success === false ? (
                      <div className="flex items-center gap-2">
                        <X className="w-4 h-4" />
                        <span>Error: {testResult.error}</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* URL Format Help */}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <p><strong>Expected format:</strong> http://localhost:port or https://your-domain.com</p>
                  <p><strong>Default ports:</strong> Python Backend (5001), ComfyUI (8188), N8N (5678)</p>
                  <p><strong>Tip:</strong> Press Enter to save quickly</p>
                </div>
              </div>
            </div>
          )}

          {/* Service Status and Controls */}
          {config.mode && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    service.isLoading 
                      ? 'bg-yellow-500 animate-pulse' 
                      : isRunning 
                        ? 'bg-green-500' 
                        : 'bg-gray-400'
                  }`}></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Status: {service.isLoading ? 'Starting...' : (isRunning ? 'Running' : 'Stopped')}
                    {(service.serviceUrl || (config.mode === 'manual' && config.url)) && (
                      <span className="ml-2 font-mono text-xs">
                        {service.serviceUrl || config.url}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  {service.actions.includes('open') && service.serviceUrl && isRunning && (
                    <button
                      onClick={() => window.open(service.serviceUrl, '_blank')}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </button>
                  )}
                  {/* Hide Start/Stop/Restart buttons for remote mode services */}
                  {config.mode !== 'remote' && (
                    <>
                      {service.actions.includes('start') && !isRunning && (
                        <button
                          onClick={() => {
                            if (service.id === 'claracore') handleClaraCoreAction('start');
                            else if (service.id === 'n8n') handleN8nAction('start');
                            else if (service.id === 'comfyui') handleComfyuiAction('start');
                            else if (service.id === 'python-backend') handlePythonBackendAction('start');
                          }}
                          disabled={service.isLoading}
                          className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                        >
                          {service.isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          {service.isLoading ? 'Starting...' : 'Start'}
                        </button>
                      )}
                      {service.actions.includes('stop') && isRunning && (
                        <button
                          onClick={() => {
                            if (service.id === 'claracore') handleClaraCoreAction('stop');
                            else if (service.id === 'n8n') handleN8nAction('stop');
                            else if (service.id === 'comfyui') handleComfyuiAction('stop');
                            else if (service.id === 'python-backend') handlePythonBackendAction('stop');
                          }}
                          disabled={service.isLoading}
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                        >
                          {service.isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                          {service.isLoading ? 'Stopping...' : 'Stop'}
                        </button>
                      )}
                      {service.actions.includes('restart') && (
                        <button
                          onClick={() => {
                            if (service.id === 'claracore') handleClaraCoreAction('restart');
                            else if (service.id === 'n8n') handleN8nAction('restart');
                            else if (service.id === 'comfyui') handleComfyuiAction('restart');
                            else if (service.id === 'python-backend') handlePythonBackendAction('restart');
                          }}
                          disabled={service.isLoading}
                          className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${service.isLoading ? 'animate-spin' : ''}`} />
                          {service.isLoading ? 'Restarting...' : 'Restart'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* Configuration Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Deployment:</span>
                  <span className={`ml-1 font-medium ${
                    config.mode === 'docker'
                      ? 'text-blue-700 dark:text-blue-300'
                      : config.mode === 'remote'
                        ? 'text-orange-700 dark:text-orange-300'
                        : 'text-purple-700 dark:text-purple-300'
                  }`}>
                    {config.mode === 'docker' ? 'Docker Container' : config.mode === 'remote' ? 'Remote Server' : 'Manual Setup'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Service Type:</span>
                  <span className="ml-1 text-gray-700 dark:text-gray-300 font-medium">
                    {service.id === 'comfyui' ? 'Image Generation' : service.id === 'python-backend' ? 'AI Processing' : 'Workflow Automation'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">URL Source:</span>
                  <span className="ml-1 text-gray-700 dark:text-gray-300 font-medium">
                    {config.mode === 'docker' ? 'Auto-detected' : (config.url ? `Manual: ${config.url}` : 'Not set')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Configurable:</span>
                  <span className="ml-1 text-green-700 dark:text-green-300 font-medium">Yes</span>
                </div>
              </div>

              {/* Error Display */}
              {service.error && (
                <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                  {service.error}
                </div>
              )}

              {/* Loading Message for ComfyUI */}
              {service.id === 'comfyui' && service.isLoading && (
                <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-700 dark:text-yellow-300">
                  ComfyUI may take 30-60 seconds to fully start
                </div>
              )}
            </div>
          )}

          {/* Feature Configuration Toggle - Only for optional services (not ClaraCore) */}
          {service.id !== 'claracore' && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {service.id === 'comfyui' ? '🎨 Enable' : service.id === 'python-backend' ? '🧠 Enable' : '⚡ Enable'}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {service.id === 'comfyui'
                      ? 'Show ComfyUI in the sidebar'
                      : service.id === 'python-backend'
                        ? 'Enable RAG and TTS features in the sidebar'
                        : 'Show N8N in the sidebar'
                    }
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={service.id === 'comfyui' ? featureConfig.comfyUI : service.id === 'python-backend' ? featureConfig.ragAndTts : featureConfig.n8n}
                    onChange={(e) => {
                      if (service.id === 'comfyui') {
                        updateFeatureConfig({ comfyUI: e.target.checked });
                      } else if (service.id === 'python-backend') {
                        updateFeatureConfig({ ragAndTts: e.target.checked });
                      } else {
                        updateFeatureConfig({ n8n: e.target.checked });
                      }
                    }}
                    disabled={savingFeatureConfig}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {savingFeatureConfig && (
                <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-purple-700 dark:text-purple-300">
                      Updating feature configuration...
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
                <div className="flex items-start gap-2">
                  <div className="text-blue-600 dark:text-blue-400 mt-0.5">💡</div>
                  <div className="text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> Enabling this feature will make {service.id === 'comfyui' ? 'Image Generation' : service.id === 'python-backend' ? 'RAG and TTS' : 'Workflow Automation'}
                    available in the sidebar and include it in the onboarding flow for new users.
                    This is useful if you initially skipped this service during setup.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Helper function for platform name
  const getPlatformName = (platform: string) => {
    switch (platform) {
      case 'win32': return 'Windows';
      case 'darwin': return 'macOS';
      case 'linux': return 'Linux';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Service Management
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Monitor and control all ClaraVerse services from one place
              </p>
            </div>
          </div>
          <button
            onClick={refreshAllServices}
            disabled={globalLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${globalLoading ? 'animate-spin' : ''}`} />
            {globalLoading ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>

        {/* System Info */}
        <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                System: {getPlatformName(currentPlatform)}
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs text-blue-700 dark:text-blue-300">
                <div>
                  <span className="font-medium">ClaraCore:</span> {serviceConfigs.claracore?.mode === 'remote' ? '🌐 Remote Server' : '💻 Local Binary'}
                </div>
                <div>
                  <span className="font-medium">Python Backend:</span> {serviceConfigs['python-backend']?.mode === 'remote' ? '🌐 Remote' : serviceConfigs['python-backend']?.mode === 'manual' ? '⚙️ Manual' : '🐳 Docker'}
                </div>
                <div>
                  <span className="font-medium">ComfyUI:</span> {serviceConfigs.comfyui?.mode === 'remote' ? '🌐 Remote' : serviceConfigs.comfyui?.mode === 'manual' ? '⚙️ Manual' : currentPlatform === 'win32' ? '🐳 Docker' : '⚙️ Manual'}
                </div>
                <div>
                  <span className="font-medium">N8N:</span> {serviceConfigs.n8n?.mode === 'remote' ? '🌐 Remote' : serviceConfigs.n8n?.mode === 'manual' ? '⚙️ Manual' : '🐳 Docker'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    

      {/* Configurable Services - Card-Based Tabbed UI */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Configurable Services
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Optional services with Docker and Manual deployment options
            </p>
          </div>
        </div>

        {/* Service Tabs Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {configurableServices.map((service) => {
            const isActive = activeServiceTab === service.id;
            const Icon = service.icon;
            const isRunning = service.status === 'running';

            return (
              <button
                key={service.id}
                onClick={() => setActiveServiceTab(service.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all flex-shrink-0 ${
                  isActive
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-purple-600 dark:text-purple-400' : ''}`} />
                  <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
                    isRunning ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                </div>
                <div className="text-left">
                  <div className="font-medium text-sm">
                    {service.id === 'claracore'
                      ? 'Clara Core'
                      : service.id === 'python-backend'
                        ? 'Python Backend'
                        : service.id === 'comfyui'
                          ? 'ComfyUI'
                          : 'N8N'
                    }
                  </div>
                  <div className="text-xs opacity-75">
                    {isRunning ? 'Running' : 'Stopped'}
                  </div>
                </div>
                {isActive && (
                  <div className="ml-2 px-2 py-0.5 bg-purple-200 dark:bg-purple-700 rounded-full text-xs font-medium">
                    Active
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Service Card */}
        <div className="transition-all duration-300">
          {configurableServices
            .filter(service => service.id === activeServiceTab)
            .map(renderConfigurableServiceCard)}
        </div>
      </div>
    </div>
  );
};

export default UnifiedServiceManager;
