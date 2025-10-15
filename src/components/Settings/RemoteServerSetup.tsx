import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  Terminal,
  Info,
  HardDrive,
  Bot,
  Zap
} from 'lucide-react';
import RemoteClaraCoreSetup from './RemoteClaraCoreSetup';

interface RemoteServerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  deployServices: {
    claracore: boolean;
    comfyui: boolean;
    python: boolean;
    n8n: boolean;
  };
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

type DeploymentStep =
  | 'idle'
  | 'connecting'
  | 'checking-docker'
  | 'pulling-images'
  | 'deploying'
  | 'verifying'
  | 'complete'
  | 'error';

const RemoteServerSetup: React.FC = () => {
  // Sub-tab selection: 'claracore' or 'other-services'
  const [activeSubTab, setActiveSubTab] = useState<'claracore' | 'other-services'>('claracore');

  const [config, setConfig] = useState<RemoteServerConfig>({
    host: '',
    port: 22,
    username: '',
    password: '',
    deployServices: {
      claracore: true,
      comfyui: true,
      python: true,
      n8n: true
    }
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState<DeploymentStep>('idle');
  const [completedSteps, setCompletedSteps] = useState<Set<DeploymentStep>>(new Set());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Load saved config
  useEffect(() => {
    const loadConfig = async () => {
      console.log('🔍 [RemoteServer] Attempting to load saved config...');
      console.log('🔍 [RemoteServer] window.electron exists?', !!(window as any).electron);
      console.log('🔍 [RemoteServer] window.electron.store exists?', !!((window as any).electron?.store));
      console.log('🔍 [RemoteServer] window.electron.store.get exists?', !!((window as any).electron?.store?.get));

      if ((window as any).electron?.store?.get) {
        const saved = await (window as any).electron.store.get('remoteServer');
        console.log('💾 [RemoteServer] Loaded from storage:', saved);

        if (saved) {
          const newConfig = {
            host: saved.host || '',
            port: saved.port || 22,
            username: saved.username || '',
            password: saved.password || '',
            deployServices: saved.deployServices || {
              comfyui: true,
              python: true,
              n8n: true
            }
          };
          console.log('✅ [RemoteServer] Setting config:', newConfig);
          setConfig(newConfig);
          setIsConnected(saved.isConnected || false);
        } else {
          console.log('⚠️ [RemoteServer] No saved config found');
        }
      } else {
        console.log('❌ [RemoteServer] electron.store API not available');
      }
    };
    loadConfig();
  }, []);

  const STEP_ORDER: DeploymentStep[] = [
    'connecting',
    'checking-docker',
    'pulling-images',
    'deploying',
    'verifying',
    'complete'
  ];

  const addLog = (type: LogEntry['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, type, message }]);
  };

  const testConnection = async () => {
    setLogs([]);
    addLog('info', '🔍 Testing SSH connection...');

    try {
      const result = await window.remoteServer.testConnection({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password
      });

      if (result.success) {
        addLog('success', `✓ Connected to ${config.host}`);
        addLog('info', `OS: ${result.osInfo || 'Unknown'}`);
        addLog('info', `Docker: ${result.dockerVersion || 'Not found'}`);

        // Show running services
        if (result.runningServices && Object.keys(result.runningServices).length > 0) {
          addLog('info', '\n🔍 Found running Clara services:');
          if (result.runningServices.comfyui) {
            addLog('success', `  ✓ ComfyUI: ${result.runningServices.comfyui.url}`);
          }
          if (result.runningServices.python) {
            addLog('success', `  ✓ Python Backend: ${result.runningServices.python.url}`);
          }
          if (result.runningServices.n8n) {
            addLog('success', `  ✓ N8N: ${result.runningServices.n8n.url}`);
          }
        } else {
          addLog('info', '\n💡 No Clara services found. Deploy services using the button below.');
        }

        setIsConnected(true);

        // Save connection config (including password for convenience)
        const configToSave = {
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password, // Save for convenience
          deployServices: config.deployServices,
          services: result.runningServices || {},
          isConnected: true
        };
        console.log('💾 [RemoteServer] Saving config after test:', configToSave);

        if ((window as any).electron?.store?.set) {
          await (window as any).electron.store.set('remoteServer', configToSave);
          console.log('✅ [RemoteServer] Config saved successfully');
        } else {
          console.log('❌ [RemoteServer] Cannot save - electron.store not available');
        }
      } else {
        addLog('error', `✗ Connection failed: ${result.error}`);
        setIsConnected(false);
      }
    } catch (error: any) {
      addLog('error', `✗ Error: ${error.message}`);
      setIsConnected(false);
    }
  };

  const startDeployment = async () => {
    setIsDeploying(true);
    setLogs([]);
  setDeploymentStep('connecting');
  setCompletedSteps(new Set());

    try {
      // Listen for deployment logs
      const unsubscribe = window.remoteServer.onLog((log) => {
        addLog(log.type, log.message);
        if (log.step) {
          const newStep = log.step as DeploymentStep;
          setDeploymentStep(newStep);

          setCompletedSteps(prev => {
            const updated = new Set(prev);
            const stepIndex = STEP_ORDER.indexOf(newStep);

            if (stepIndex > -1) {
              for (let i = 0; i < stepIndex; i += 1) {
                updated.add(STEP_ORDER[i]);
              }
            }

            return updated;
          });
        }
      });

      // Start deployment
      const result = await window.remoteServer.deploy({
        ...config,
        services: config.deployServices
      });

      if (result.success) {
        // Mark verifying as complete before final complete status
        setCompletedSteps(prev => {
          const updated = new Set(prev);
          updated.add('verifying');
          return updated;
        });
        setDeploymentStep('complete');
        addLog('success', '🎉 Deployment complete!');
        addLog('info', 'Services:');
        if (result.services?.comfyui) {
          addLog('success', `  ✓ ComfyUI: http://${config.host}:8188`);
        }
        if (result.services?.python) {
          addLog('success', `  ✓ Python Backend: http://${config.host}:5001`);
        }
        if (result.services?.n8n) {
          addLog('success', `  ✓ N8N: http://${config.host}:5678`);
        }

        // Save configuration
        if ((window as any).electron?.store?.set) {
          await (window as any).electron.store.set('remoteServer', {
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password, // Save for persistence
            services: result.services,
            isConnected: true
          });

          // Enable remote mode
          await (window as any).electron.store.set('serverMode', 'remote');
        }

        setIsConnected(true);
      } else {
        setDeploymentStep('error');
        addLog('error', `✗ Deployment failed: ${result.error}`);
      }

      // Cleanup listener
      unsubscribe();

    } catch (error: any) {
      setDeploymentStep('error');
      addLog('error', `✗ Error: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const switchToLocal = async () => {
    if ((window as any).electron?.store?.set) {
      await (window as any).electron.store.set('serverMode', 'local');
    }
    setIsConnected(false);
    addLog('info', 'Switched to local mode');
  };

  const getStepIcon = (step: DeploymentStep) => {
    // Show error icon if deployment failed
    if (deploymentStep === 'error') return <XCircle className="w-4 h-4 text-red-500" />;

    // Show checkmark if step is completed
    if (completedSteps.has(step)) return <CheckCircle className="w-4 h-4 text-green-500" />;

    // Show spinner if this is the current step and deployment is ongoing
    if (deploymentStep === step && isDeploying) return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />;

    // Show gray circle for pending steps
    return <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-700" />;
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
                Remote Server Setup
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Deploy Clara backend to a remote server and access it from anywhere
              </p>
            </div>
          </div>
          {isConnected && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              Connected
            </span>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">How It Works</h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• SSH connects to your remote server</li>
                <li>• Deploys Docker containers for selected services</li>
                <li>• Clara will use the remote server instead of localhost</li>
                <li>• Your laptop stays lightweight, server does heavy compute</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveSubTab('claracore')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-all relative ${
              activeSubTab === 'claracore'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            ClaraCore
            {activeSubTab === 'claracore' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('other-services')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-all relative ${
              activeSubTab === 'other-services'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            Other Services
            {activeSubTab === 'other-services' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>
            )}
          </button>
        </div>
      </div>

      {/* Connection Status Card */}
      {isConnected && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-700 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Connected to Remote Server
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Host: <span className="font-mono">{config.host}</span>
                </p>
              </div>
            </div>
            <button
              onClick={switchToLocal}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Switch to Local Mode
            </button>
          </div>
        </div>
      )}

      {/* ClaraCore Tab Content */}
      {activeSubTab === 'claracore' && (
        <RemoteClaraCoreSetup />
      )}

      {/* Other Services Tab Content */}
      {activeSubTab === 'other-services' && (
        <>
          {/* Configuration Form Card */}
          <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <HardDrive className="w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Server Configuration</h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Server IP / Hostname
              </label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="192.168.1.100 or server.local"
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={isDeploying}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SSH Port
              </label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={isDeploying}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="ubuntu"
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={isDeploying}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={isDeploying}
              />
            </div>
          </div>

          {/* Services to Deploy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Services to Deploy
            </label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(config.deployServices).map(([key, enabled]) => (
                <label 
                  key={key} 
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    enabled
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setConfig({
                      ...config,
                      deployServices: { ...config.deployServices, [key]: e.target.checked }
                    })}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-purple-600 focus:ring-purple-500"
                    disabled={isDeploying}
                  />
                  <span className={`font-medium capitalize ${
                    enabled 
                      ? 'text-purple-700 dark:text-purple-300' 
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {key === 'python' ? 'Python Backend' : key}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={testConnection}
              disabled={isDeploying || !config.host || !config.username || !config.password}
              className="flex items-center gap-2 px-6 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors font-medium"
            >
              <Server className="w-4 h-4" />
              Test Connection
            </button>
            <button
              onClick={startDeployment}
              disabled={isDeploying || !config.host || !config.username || !config.password}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white rounded-lg transition-colors font-medium"
            >
              {isDeploying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Deploying...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Deploy Backend</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Deployment Progress */}
      {(isDeploying || logs.length > 0) && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <RefreshCw className={`w-5 h-5 text-blue-500 ${isDeploying ? 'animate-spin' : ''}`} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Deployment Progress
            </h3>
            {deploymentStep === 'complete' && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                Complete
              </span>
            )}
            {deploymentStep === 'error' && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                Failed
              </span>
            )}
          </div>

          {/* Progress Steps */}
          <div className="space-y-3 mb-6">
            {[
              { step: 'connecting' as DeploymentStep, label: 'Connecting to server' },
              { step: 'checking-docker' as DeploymentStep, label: 'Checking Docker installation' },
              { step: 'pulling-images' as DeploymentStep, label: 'Pulling container images' },
              { step: 'deploying' as DeploymentStep, label: 'Deploying services' },
              { step: 'verifying' as DeploymentStep, label: 'Verifying deployment' }
            ].map(({ step, label }) => (
              <div key={step} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {getStepIcon(step)}
                <span className={`text-sm font-medium ${
                  completedSteps.has(step)
                    ? 'text-green-600 dark:text-green-400'
                    : deploymentStep === step
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {label}
                </span>
                {completedSteps.has(step) && (
                  <span className="ml-auto text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                    Done
                  </span>
                )}
                {deploymentStep === step && isDeploying && (
                  <span className="ml-auto text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full animate-pulse">
                    In Progress
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Live Logs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Deployment Logs</h4>
            </div>
            <div className="bg-gray-900 dark:bg-black rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm border border-gray-700">
              {logs.map((log, index) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500">[{log.timestamp}]</span>
                  <span className={`ml-2 ${
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warning' ? 'text-yellow-400' :
                    'text-gray-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default RemoteServerSetup;
