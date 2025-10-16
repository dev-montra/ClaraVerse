import React, { useState, useEffect, useRef } from 'react';
import { Bot, RefreshCcw, ExternalLink, AlertCircle, X } from 'lucide-react';
import type { WebviewTag } from 'electron';

declare global {
  interface WebViewHTMLAttributes<T> extends React.HTMLAttributes<T> {
    src?: string;
    allowpopups?: string | boolean;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>;
    }
  }

  interface DidFailLoadEvent {
    errorCode: number;
    errorDescription: string;
  }
}

interface ClaraCoreModelsProps {
  onNavigateToServices?: () => void;
}

const ClaraCoreModels: React.FC<ClaraCoreModelsProps> = ({ onNavigateToServices }) => {
  const [claraCoreUrl, setClaraCoreUrl] = useState<string>('http://localhost:8091');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claraCoreRunning, setClaraCoreRunning] = useState<boolean>(false);
  const webviewRef = useRef<WebviewTag | null>(null);

  // Check ClaraCore service status
  useEffect(() => {
    const checkClaraCoreStatus = async () => {
      try {
        const result = await (window as any).claraCore?.getStatus();
        if (result && result.success) {
          setClaraCoreRunning(result.status.isRunning || false);
          // Append /ui/models to the base URL
          const baseUrl = result.status.url || 'http://localhost:8091';
          setClaraCoreUrl(`${baseUrl}/ui/models`);
        } else {
          setClaraCoreRunning(false);
        }
      } catch (error) {
        console.error('Failed to check ClaraCore status:', error);
        setClaraCoreRunning(false);
      }
    };

    checkClaraCoreStatus();
    // Poll status every 5 seconds
    const interval = setInterval(checkClaraCoreStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    if (webviewRef.current && claraCoreRunning) {
      try {
        webviewRef.current.reload();
      } catch (e) {
        console.error("Error reloading webview:", e);
        setError("Could not reload ClaraCore view.");
      }
    }
  };

  const handleOpenExternal = () => {
    if (claraCoreUrl) {
      window.open(claraCoreUrl, '_blank');
    } else {
      setError("Cannot open ClaraCore externally: URL not determined.");
    }
  };

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !claraCoreUrl || !claraCoreRunning) {
      return;
    }

    const handleLoadStart = () => setIsLoading(true);
    const handleLoadStop = () => setIsLoading(false);
    const handleDidFailLoad = (event: Event) => {
      const failEvent = event as any;
      // Ignore -3 error code which is a normal cancellation
      if (failEvent.errorCode !== -3) {
        setError(`Failed to load ClaraCore: ${failEvent.errorDescription} (Code: ${failEvent.errorCode})`);
        setIsLoading(false);

        // Retry after 5 seconds
        setTimeout(() => {
          if (webview) {
            console.log('Retrying ClaraCore connection...');
            webview.reload();
          }
        }, 5000);
      }
    };

    const handleDomReady = () => {
      setError(null);
      setIsLoading(false);

      // Inject CSS for better styling
      webview.insertCSS(`
        body {
          overflow: auto !important;
          font-family: 'Quicksand', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
        * {
          font-family: 'Quicksand', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
      `);
    };

    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('dom-ready', handleDomReady);

    console.log('Setting ClaraCore URL:', claraCoreUrl);
    webview.src = claraCoreUrl;

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('dom-ready', handleDomReady);
    };
  }, [claraCoreUrl, claraCoreRunning]);

  if (!claraCoreRunning) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8 text-center max-w-md">
          <Bot className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-3">
            ClaraCore is not running
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Start ClaraCore service to access the models interface
          </p>
          {onNavigateToServices && (
            <button
              onClick={onNavigateToServices}
              className="px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors font-medium"
            >
              Go to Services
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-black">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading || !claraCoreUrl}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh ClaraCore View"
          >
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${claraCoreRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              ClaraCore Models
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {claraCoreUrl && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              URL: {claraCoreUrl}
            </span>
          )}
          <button
            onClick={handleOpenExternal}
            disabled={!claraCoreUrl}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Open in Browser"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Webview Container */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-black z-10">
            <div className="text-center">
              <RefreshCcw className="w-8 h-8 text-sakura-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading ClaraCore Models...</p>
            </div>
          </div>
        )}
        <webview
          ref={webviewRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '133.33%',  // 100% / 0.75 to compensate for scale
            height: '133.33%', // 100% / 0.75 to compensate for scale
            border: 'none',
            transform: 'scale(0.75)',
            transformOrigin: 'top left'
          }}
          allowpopups="true"
        />
      </div>
    </div>
  );
};

export default ClaraCoreModels;
