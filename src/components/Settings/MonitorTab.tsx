import React, { useState, useEffect } from 'react';
import { Activity, Server, CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';

interface RemoteServer {
  name: string;
  host: string;
  serviceUrl: string;
  hardwareType: string;
  deployedAt?: string;
}

interface ServiceHealth {
  isHealthy: boolean;
  responseTime?: number;
  error?: string;
  timestamp: string;
}

interface MonitorTabProps {
  remoteServers: RemoteServer[];
}

const MonitorTab: React.FC<MonitorTabProps> = ({ remoteServers }) => {
  const [healthStatus, setHealthStatus] = useState<{ [key: string]: ServiceHealth }>({});
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [autoRefresh, setAutoRefresh] = useState(false);

  const checkServiceHealth = async (server: RemoteServer) => {
    const key = server.host;
    setLoading(prev => ({ ...prev, [key]: true }));

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${server.serviceUrl}/health`, {
        signal: controller.signal,
        method: 'GET'
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        setHealthStatus(prev => ({
          ...prev,
          [key]: {
            isHealthy: true,
            responseTime,
            timestamp: new Date().toISOString()
          }
        }));
      } else {
        setHealthStatus(prev => ({
          ...prev,
          [key]: {
            isHealthy: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            timestamp: new Date().toISOString()
          }
        }));
      }
    } catch (error: any) {
      setHealthStatus(prev => ({
        ...prev,
        [key]: {
          isHealthy: false,
          error: error.name === 'AbortError' ? 'Request timeout' : error.message,
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const checkAllServers = () => {
    remoteServers.forEach(server => checkServiceHealth(server));
  };

  useEffect(() => {
    // Initial health check
    if (remoteServers.length > 0) {
      checkAllServers();
    }
  }, [remoteServers]);

  useEffect(() => {
    if (autoRefresh && remoteServers.length > 0) {
      const interval = setInterval(() => {
        checkAllServers();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh, remoteServers]);

  const getHardwareIcon = (hardwareType: string) => {
    switch (hardwareType) {
      case 'cuda':
        return '🎮';
      case 'rocm':
        return '🔴';
      case 'strix':
        return '🦅';
      case 'cpu':
        return '💻';
      default:
        return '⚙️';
    }
  };

  const getHardwareLabel = (hardwareType: string) => {
    switch (hardwareType) {
      case 'cuda':
        return 'NVIDIA CUDA';
      case 'rocm':
        return 'AMD ROCm';
      case 'strix':
        return 'Strix Halo (Vulkan)';
      case 'cpu':
        return 'CPU Only';
      default:
        return hardwareType.toUpperCase();
    }
  };

  if (remoteServers.length === 0) {
    return (
      <div className="glassmorphic rounded-xl p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Server className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Remote Services Deployed
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
            Deploy ClaraCore to a remote server first, then you can monitor its health status here.
          </p>
        </div>
      </div>
    );
  }

  const healthyCount = Object.values(healthStatus).filter(h => h.isHealthy).length;
  const totalCount = remoteServers.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-sakura-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Remote Services Monitor
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                HTTP health checks for deployed ClaraCore services
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                autoRefresh
                  ? 'bg-sakura-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Clock className="w-4 h-4" />
              Auto Refresh {autoRefresh && '(30s)'}
            </button>
            <button
              onClick={checkAllServers}
              disabled={Object.values(loading).some(l => l)}
              className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${Object.values(loading).some(l => l) ? 'animate-spin' : ''}`} />
              Refresh All
            </button>
          </div>
        </div>

        {/* Overall Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Total Services</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {totalCount}
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-700 dark:text-green-300">Healthy</span>
            </div>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">
              {healthyCount}
            </p>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg p-4 border border-red-200 dark:border-red-700">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-red-700 dark:text-red-300">Unhealthy</span>
            </div>
            <p className="text-2xl font-bold text-red-900 dark:text-red-100">
              {totalCount - healthyCount}
            </p>
          </div>
        </div>
      </div>

      {/* Service Cards */}
      {remoteServers.map(server => {
        const key = server.host;
        const health = healthStatus[key];
        const isLoading = loading[key];

        return (
          <div key={key} className="glassmorphic rounded-xl p-6">
            {/* Server Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="text-3xl">
                  {getHardwareIcon(server.hardwareType)}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {server.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 rounded">
                      {getHardwareLabel(server.hardwareType)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {server.serviceUrl}
                  </p>
                  {server.deployedAt && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      Deployed: {new Date(server.deployedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => checkServiceHealth(server)}
                disabled={isLoading}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 transition-colors disabled:opacity-50"
                title="Check health"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Loading State */}
            {isLoading && !health && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sakura-500"></div>
              </div>
            )}

            {/* Health Status */}
            {health && (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  {health.isHealthy ? (
                    <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex-1">
                      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          Service is healthy and responding
                        </p>
                        {health.responseTime && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                            Response time: {health.responseTime}ms
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex-1">
                      <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                          Service is not responding
                        </p>
                        {health.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            {health.error}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <p className="text-xs text-gray-500 dark:text-gray-500 text-right">
                  Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MonitorTab;
