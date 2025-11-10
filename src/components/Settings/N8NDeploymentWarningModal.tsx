import React from 'react';
import { AlertTriangle, Shield, Lock, X, CheckCircle, Info } from 'lucide-react';

interface N8NDeploymentWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeployWithFix: () => void;
  onDeployWithoutFix: () => void;
}

const N8NDeploymentWarningModal: React.FC<N8NDeploymentWarningModalProps> = ({
  isOpen,
  onClose,
  onDeployWithFix,
  onDeployWithoutFix,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                N8N HTTPS Configuration Required
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Important security notice before deployment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Problem Explanation */}
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                The Issue
              </h3>
              <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                N8N's community version is configured to use <strong>secure cookies by default</strong>,
                which requires HTTPS. When you deploy N8N over HTTP (without SSL/TLS), you'll see this error:
              </p>
              <div className="bg-red-100 dark:bg-red-900/40 p-3 rounded border border-red-300 dark:border-red-700 text-xs font-mono text-red-900 dark:text-red-100">
                Your n8n server is configured to use a secure cookie, however you are either
                visiting this via an insecure URL, or using Safari.
              </div>
              <p className="text-sm text-red-800 dark:text-red-200 mt-2">
                <strong>Result:</strong> N8N won't be accessible even though it's running.
              </p>
            </div>
          </div>
        </div>

        {/* Solutions */}
        <div className="space-y-4 mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            Choose Your Deployment Option
          </h3>

          {/* Option 1: Deploy with HTTP (Recommended) - Clickable Card */}
          <button
            onClick={onDeployWithFix}
            className="w-full border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg p-4 transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-green-900 dark:text-green-100">
                    Deploy with HTTP (Works Immediately)
                  </h4>
                  <span className="px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs font-medium rounded">
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-sm text-green-800 dark:text-green-200 mb-2">
                  We'll automatically disable secure cookies (<code className="bg-green-100 dark:bg-green-900/40 px-1 py-0.5 rounded">N8N_SECURE_COOKIE=false</code>)
                  so N8N works immediately over HTTP.
                </p>
                <div className="mt-2">
                  <p className="text-xs font-semibold text-green-900 dark:text-green-100 mb-1">
                    What you get:
                  </p>
                  <ul className="text-xs text-green-800 dark:text-green-200 space-y-1 ml-4">
                    <li>✓ Accessible at <code>http://your-server:5678</code></li>
                    <li>✓ Protected by username/password</li>
                    <li>✓ Perfect for internal networks or VPN</li>
                    <li>✓ Can add HTTPS later if needed</li>
                  </ul>
                </div>
              </div>
            </div>
          </button>

          {/* Option 2: Setup HTTPS Yourself - Clickable Card */}
          <button
            onClick={onDeployWithoutFix}
            className="w-full border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg p-4 transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    I'll Setup HTTPS Myself
                  </h4>
                  <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs font-medium rounded">
                    ADVANCED
                  </span>
                </div>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  Deploy with secure cookies enabled. You'll configure SSL/TLS yourself before N8N becomes accessible.
                </p>
                <div className="mt-2">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    You'll need to:
                  </p>
                  <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 ml-4">
                    <li>• Setup reverse proxy (nginx, caddy, etc.)</li>
                    <li>• Configure SSL certificate</li>
                    <li>• Update N8N_WEBHOOK_URL to HTTPS</li>
                  </ul>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 italic">
                    ⚠️ N8N won't work until HTTPS is configured
                  </p>
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Security Note */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong className="text-gray-900 dark:text-white">Security Note:</strong> For production
            deployments accessible from the internet, we strongly recommend using HTTPS with proper SSL
            certificates. HTTP is acceptable for local/internal networks, development environments, or
            when accessed through a VPN.
          </p>
        </div>

        {/* Cancel Button */}
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-sm font-medium"
          >
            Cancel Deployment
          </button>
        </div>
      </div>
    </div>
  );
};

export default N8NDeploymentWarningModal;
