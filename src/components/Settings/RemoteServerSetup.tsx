import React, { useState, useEffect, useRef } from 'react';
import { FiServer, FiPlay, FiCheckCircle, FiXCircle, FiLoader } from 'react-icons/fi';

interface RemoteServerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  deployServices: {
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
  const [config, setConfig] = useState<RemoteServerConfig>({
    host: '',
    port: 22,
    username: '',
    password: '',
    deployServices: {
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

    // Track current step to avoid closure issues
    let currentStep: DeploymentStep = 'connecting';

    try {
      // Listen for deployment logs
      const unsubscribe = window.remoteServer.onLog((log) => {
        addLog(log.type, log.message);
        if (log.step) {
          const newStep = log.step as DeploymentStep;

          // Mark previous step as completed when moving to next step
          if (currentStep !== 'idle' && currentStep !== newStep) {
            setCompletedSteps(prev => new Set([...prev, currentStep]));
          }

          currentStep = newStep;
          setDeploymentStep(newStep);
        }
      });

      // Start deployment
      const result = await window.remoteServer.deploy({
        ...config,
        services: config.deployServices
      });

      if (result.success) {
        // Mark verifying as complete before final complete status
        setCompletedSteps(prev => new Set([...prev, 'verifying']));
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
    if (deploymentStep === 'error') return <FiXCircle className="text-red-500" />;

    // Show checkmark if step is completed
    if (completedSteps.has(step)) return <FiCheckCircle className="text-green-500" />;

    // Show spinner if this is the current step and deployment is ongoing
    if (deploymentStep === step && isDeploying) return <FiLoader className="animate-spin text-blue-500" />;

    // Show gray circle for pending steps
    return <div className="w-4 h-4 rounded-full bg-gray-700" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FiServer className="text-2xl text-blue-400" />
        <div>
          <h2 className="text-xl font-bold text-white">Remote Server Setup</h2>
          <p className="text-sm text-gray-400">
            Deploy Clara backend to a remote server and access it from anywhere
          </p>
        </div>
      </div>

      {/* Connection Status */}
      {isConnected && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-400">
            <FiCheckCircle />
            <span className="font-medium">Connected to {config.host}</span>
          </div>
          <button
            onClick={switchToLocal}
            className="mt-2 text-sm text-gray-400 hover:text-white"
          >
            Switch to local mode
          </button>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Server Configuration</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Server IP / Hostname
            </label>
            <input
              type="text"
              value={config.host}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              placeholder="192.168.1.100 or server.local"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              disabled={isDeploying}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              SSH Port
            </label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              disabled={isDeploying}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="ubuntu"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              disabled={isDeploying}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              disabled={isDeploying}
            />
          </div>
        </div>

        {/* Services to Deploy */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Services to Deploy
          </label>
          <div className="space-y-2">
            {Object.entries(config.deployServices).map(([key, enabled]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setConfig({
                    ...config,
                    deployServices: { ...config.deployServices, [key]: e.target.checked }
                  })}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
                  disabled={isDeploying}
                />
                <span className="text-gray-300 capitalize">{key}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={testConnection}
            disabled={isDeploying || !config.host || !config.username || !config.password}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
          >
            Test Connection
          </button>
          <button
            onClick={startDeployment}
            disabled={isDeploying || !config.host || !config.username || !config.password}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
          >
            {isDeploying ? (
              <>
                <FiLoader className="animate-spin" />
                <span>Deploying...</span>
              </>
            ) : (
              <>
                <FiPlay />
                <span>Deploy Backend</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Deployment Progress */}
      {(isDeploying || logs.length > 0) && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Deployment Progress</h3>

          {/* Progress Steps */}
          <div className="space-y-3">
            {[
              { step: 'connecting' as DeploymentStep, label: 'Connecting to server' },
              { step: 'checking-docker' as DeploymentStep, label: 'Checking Docker installation' },
              { step: 'pulling-images' as DeploymentStep, label: 'Pulling container images' },
              { step: 'deploying' as DeploymentStep, label: 'Deploying services' },
              { step: 'verifying' as DeploymentStep, label: 'Verifying deployment' }
            ].map(({ step, label }) => (
              <div key={step} className="flex items-center gap-3">
                {getStepIcon(step)}
                <span className={`text-sm ${
                  completedSteps.has(step)
                    ? 'text-green-400 font-medium'
                    : deploymentStep === step
                      ? 'text-white font-medium'
                      : 'text-gray-400'
                }`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Live Logs */}
          <div className="mt-4">
            <div className="bg-black rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
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

      {/* Info Box */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h4 className="text-blue-400 font-medium mb-2">How It Works</h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• SSH connects to your remote server</li>
          <li>• Deploys Docker containers for selected services</li>
          <li>• Clara will use the remote server instead of localhost</li>
          <li>• Your laptop stays lightweight, server does heavy compute</li>
        </ul>
      </div>
    </div>
  );
};

export default RemoteServerSetup;
