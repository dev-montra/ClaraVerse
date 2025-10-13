export interface RemoteServerAPI {
  testConnection: (config: {
    host: string;
    port: number;
    username: string;
    password: string;
  }) => Promise<{
    success: boolean;
    osInfo?: string;
    dockerVersion?: string;
    error?: string;
  }>;

  deploy: (config: {
    host: string;
    port: number;
    username: string;
    password: string;
    services: {
      comfyui?: boolean;
      python?: boolean;
      n8n?: boolean;
    };
  }) => Promise<{
    success: boolean;
    services?: Record<string, {
      url: string;
      port: number;
      containerId: string;
    }>;
    error?: string;
  }>;

  stopService: (
    config: {
      host: string;
      port: number;
      username: string;
      password: string;
    },
    serviceName: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onLog: (callback: (log: {
    type: 'info' | 'success' | 'error' | 'warning';
    message: string;
    step?: string;
    timestamp: string;
  }) => void) => () => void;
}

declare global {
  interface Window {
    remoteServer: RemoteServerAPI;
  }
}

export {};
