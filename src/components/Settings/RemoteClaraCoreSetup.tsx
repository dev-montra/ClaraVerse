import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  Terminal,
  Info,
  Cpu,
  Zap,
  AlertCircle,
  CheckCheck
} from 'lucide-react';

interface ClaraCoreRemoteConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  hardwareType: 'auto' | 'cuda' | 'rocm' | 'strix' | 'cpu';
}

interface HardwareDetectionResult {
  detected: 'cuda' | 'rocm' | 'strix' | 'cpu';
  confidence: 'high' | 'medium' | 'low';
  details: {
    docker: boolean;
    dockerVersion?: string;
    nvidia: boolean;
    nvidiaVersion?: string;
    cudaVersion?: string;
    rocm: boolean;
    rocmVersion?: string;
    strix: boolean;
    cpuModel?: string;
    gpuInfo?: string;
  };
}

interface TestResult {
  success: boolean;
  error?: string;
  hardware?: HardwareDetectionResult;
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

type DeploymentState = 'idle' | 'testing' | 'test-success' | 'test-failed' | 'deploying' | 'deployed' | 'error';

const RemoteClaraCoreSetup: React.FC = () => {
  const [config, setConfig] = useState<ClaraCoreRemoteConfig>({
    host: '',
    port: 22,
    username: '',
    password: '',
    hardwareType: 'auto'
  });

  const [state, setState] = useState<DeploymentState>('idle');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deploymentUrl, setDeploymentUrl] = useState<string>('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load remote server config on mount
  useEffect(() => {
    const loadRemoteConfig = async () => {
      try {
        if ((window as any).electron?.store?.get) {
          const remoteServer = await (window as any).electron.store.get('remoteServer');
          if (remoteServer) {
            setConfig(prev => ({
              ...prev,
              host: remoteServer.host || '',
              port: remoteServer.port || 22,
              username: remoteServer.username || '',
              password: remoteServer.password || ''
            }));
          }
        }
      } catch (error) {
        console.error('Failed to load remote server config:', error);
      }
    };
    loadRemoteConfig();
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (type: LogEntry['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, type, message }]);
  };

  const testSetup = async () => {
    setState('testing');
    setLogs([]);
    setTestResult(null);

    addLog('info', '🔍 Testing remote server setup...');
    addLog('info', `Connecting to ${config.host}:${config.port}...`);

    try {
      // Call backend to test SSH connection and detect hardware
      const result = await (window as any).claraCoreRemote.testSetup({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password
      });

      if (result.success) {
        addLog('success', '✓ SSH connection successful');

        // Show hardware detection results
        const hw = result.hardware;
        addLog('info', '\n🔍 Hardware Detection Results:');

        // Docker
        if (hw.details.docker) {
          addLog('success', `  ✓ Docker installed: ${hw.details.dockerVersion}`);
        } else {
          addLog('error', '  ✗ Docker not found');
          addLog('warning', '    Docker will be installed automatically during deployment');
        }

        // NVIDIA CUDA
        if (hw.details.nvidia) {
          addLog('success', `  ✓ NVIDIA GPU detected: ${hw.details.gpuInfo}`);
          if (hw.details.cudaVersion) {
            addLog('success', `  ✓ CUDA Toolkit: ${hw.details.cudaVersion}`);
          } else {
            addLog('warning', '  ⚠ CUDA Toolkit not found (will be installed)');
          }
        }

        // AMD ROCm
        if (hw.details.rocm) {
          addLog('success', `  ✓ AMD GPU with ROCm: ${hw.details.rocmVersion}`);
        }

        // Strix Halo
        if (hw.details.strix) {
          addLog('success', '  ✓ AMD Strix Halo APU detected (Ryzen AI Max series)');
        }

        // CPU
        if (!hw.details.nvidia && !hw.details.rocm && !hw.details.strix) {
          addLog('info', `  ℹ CPU Model: ${hw.details.cpuModel}`);
          addLog('warning', '  ⚠ No GPU acceleration detected - will use CPU mode');
        }

        // Show recommendation
        addLog('info', '\n💡 Recommendation:');
        const hwTypes = {
          cuda: 'NVIDIA CUDA (Best for NVIDIA GPUs)',
          rocm: 'AMD ROCm (Best for AMD GPUs)',
          strix: 'AMD Strix Halo (Optimized for Ryzen AI Max)',
          cpu: 'CPU Only (Slower, but works everywhere)'
        };
        addLog('success', `  → ${hwTypes[hw.detected]}`);
        addLog('info', `  → Image: clara17verse/claracore:${hw.detected}`);
        addLog('info', `  → Confidence: ${hw.confidence.toUpperCase()}`);

        setState('test-success');
        setTestResult(result);
      } else {
        addLog('error', `✗ Test failed: ${result.error}`);
        setState('test-failed');
        setTestResult(result);
      }
    } catch (error: any) {
      addLog('error', `✗ Error: ${error.message}`);
      setState('test-failed');
    }
  };

  const deployContainer = async () => {
    setState('deploying');
    addLog('info', '\n🚀 Starting deployment...');

    try {
      const hardwareType = config.hardwareType === 'auto'
        ? testResult?.hardware?.detected
        : config.hardwareType;

      addLog('info', `Using hardware type: ${hardwareType?.toUpperCase()}`);
      addLog('info', `Docker image: clara17verse/claracore:${hardwareType}`);

      const result = await (window as any).claraCoreRemote.deploy({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        hardwareType: hardwareType as string
      });

      if (result.success) {
        const url = `http://${config.host}:5890`;
        setDeploymentUrl(url);

        addLog('success', '\n🎉 Deployment successful!');
        addLog('success', `✓ ClaraCore is running at: ${url}`);
        addLog('info', `✓ Container name: claracore-${hardwareType}`);
        addLog('info', '\nYou can now configure ClaraCore in Remote mode and use this URL');

        // Save configuration
        if ((window as any).electron?.store?.set) {
          await (window as any).electron.store.set('claraCoreRemote', {
            host: config.host,
            port: config.port,
            url: url,
            hardwareType: hardwareType,
            deployed: true
          });
        }

        setState('deployed');
      } else {
        addLog('error', `✗ Deployment failed: ${result.error}`);
        setState('error');
      }
    } catch (error: any) {
      addLog('error', `✗ Error: ${error.message}`);
      setState('error');
    }
  };

  const getHardwareIcon = (type: string) => {
    switch(type) {
      case 'cuda': return <Zap className="w-5 h-5 text-green-500" />;
      case 'rocm': return <Cpu className="w-5 h-5 text-red-500" />;
      case 'strix': return <Zap className="w-5 h-5 text-orange-500" />;
      case 'cpu': return <Cpu className="w-5 h-5 text-gray-500" />;
      default: return <Server className="w-5 h-5 text-blue-500" />;
    }
  };

  const canTest = config.host && config.username && config.password && state !== 'testing';
  const canDeploy = state === 'test-success' && testResult?.success;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Remote ClaraCore Setup
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Deploy ClaraCore AI Engine to a remote server with GPU acceleration
              </p>
            </div>
          </div>
          {state === 'deployed' && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              ✓ Deployed
            </span>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">How It Works</h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Test Setup: Automatically detects your server's hardware (NVIDIA, AMD, CPU)</li>
                <li>• Auto-Install: Installs Docker and GPU drivers if needed</li>
                <li>• Smart Deploy: Pulls the right ClaraCore image for your hardware</li>
                <li>• Manual Override: You can choose a different image if auto-detection is wrong</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="glassmorphic rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Server Configuration
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Server IP / Hostname *
              </label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="192.168.1.100 or server.local"
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={state === 'deploying'}
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
                disabled={state === 'deploying'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username *
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="ubuntu"
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={state === 'deploying'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password *
              </label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500 dark:focus:border-purple-500"
                disabled={state === 'deploying'}
              />
            </div>
          </div>

          {/* Hardware Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Hardware Type
            </label>
            <div className="grid grid-cols-5 gap-3">
              {[
                { value: 'auto', label: 'Auto-detect', icon: <CheckCheck className="w-4 h-4" />, color: 'blue' },
                { value: 'cuda', label: 'NVIDIA CUDA', icon: <Zap className="w-4 h-4" />, color: 'green' },
                { value: 'rocm', label: 'AMD ROCm', icon: <Cpu className="w-4 h-4" />, color: 'red' },
                { value: 'strix', label: 'Strix Halo', icon: <Zap className="w-4 h-4" />, color: 'orange' },
                { value: 'cpu', label: 'CPU Only', icon: <Cpu className="w-4 h-4" />, color: 'gray' }
              ].map(({ value, label, icon, color }) => (
                <button
                  key={value}
                  onClick={() => setConfig({ ...config, hardwareType: value as any })}
                  disabled={state === 'deploying'}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    config.hardwareType === value
                      ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/30`
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } ${state === 'deploying' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {icon}
                  <span className={`text-xs font-medium text-center ${
                    config.hardwareType === value
                      ? `text-${color}-700 dark:text-${color}-300`
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {label}
                  </span>
                  {value === 'auto' && config.hardwareType === 'auto' && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">(Recommended)</span>
                  )}
                </button>
              ))}
            </div>
            {config.hardwareType !== 'auto' && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Manual override - auto-detection will be skipped
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={testSetup}
              disabled={!canTest}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all font-medium ${
                canTest
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
              }`}
            >
              {state === 'testing' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Server className="w-4 h-4" />
                  <span>Test Setup</span>
                </>
              )}
            </button>

            {canDeploy && (
              <button
                onClick={deployContainer}
                disabled={state === 'deploying'}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all font-medium shadow-lg shadow-green-500/30 animate-pulse-slow"
              >
                {state === 'deploying' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deploying...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Deploy ClaraCore</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hardware Detection Results */}
      {state === 'test-success' && testResult?.hardware && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Hardware Detected
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                {getHardwareIcon(testResult.hardware.detected)}
                <span className="font-medium text-gray-900 dark:text-white capitalize">
                  {testResult.hardware.detected === 'cuda' ? 'NVIDIA CUDA' :
                   testResult.hardware.detected === 'rocm' ? 'AMD ROCm' :
                   testResult.hardware.detected === 'strix' ? 'AMD Strix Halo' :
                   'CPU Only'}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Recommended hardware type
              </p>
            </div>

            <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <Server className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-gray-900 dark:text-white">
                  {testResult.hardware.details.docker ? 'Docker Ready' : 'Docker Missing'}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {testResult.hardware.details.docker
                  ? `Version ${testResult.hardware.details.dockerVersion}`
                  : 'Will be installed automatically'}
              </p>
            </div>
          </div>

          {testResult.hardware.details.gpuInfo && (
            <div className="mt-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>GPU:</strong> {testResult.hardware.details.gpuInfo}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Deployment Success */}
      {state === 'deployed' && deploymentUrl && (
        <div className="glassmorphic rounded-xl p-6 border-2 border-green-500">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">
              ClaraCore Deployed Successfully!
            </h3>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                Your ClaraCore URL:
              </p>
              <code className="text-sm text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-3 py-2 rounded block">
                {deploymentUrl}
              </code>
            </div>

            <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Next Steps:</strong>
              </p>
              <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 mt-2 list-decimal list-inside">
                <li>Go to Settings → Services → ClaraCore</li>
                <li>Click "Remote" mode</li>
                <li>Enter the URL above</li>
                <li>Click "Save" and start using remote ClaraCore!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Logs Panel */}
      {logs.length > 0 && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {state === 'testing' ? 'Testing...' :
               state === 'deploying' ? 'Deploying...' :
               'Logs'}
            </h3>
          </div>

          <div className="bg-gray-900 dark:bg-black rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm border border-gray-700">
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
      )}
    </div>
  );
};

export default RemoteClaraCoreSetup;
