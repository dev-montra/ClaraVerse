/**
 * Netlify Deployment Modal
 * Handles OAuth authentication and project deployment to Netlify
 */

import React, { useState, useEffect } from 'react';
import { netlifyService } from '../../services/netlifyService';
import type { WebContainer } from '@webcontainer/api';
import type { DeploymentProgress } from '../../services/netlifyService';
import type { SiteMapping } from '../../utils/netlifyStorage';

interface NetlifyDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  webContainer: WebContainer | null;
  projectId: string;
  projectName: string;
  writeToTerminal?: (data: string) => void;
}

export const NetlifyDeployModal: React.FC<NetlifyDeployModalProps> = ({
  isOpen,
  onClose,
  webContainer,
  projectId,
  projectName,
  writeToTerminal
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [siteName, setSiteName] = useState('');
  const [siteAssociation, setSiteAssociation] = useState<SiteMapping | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState<DeploymentProgress | null>(null);
  const [deployResult, setDeployResult] = useState<{
    success: boolean;
    siteUrl?: string;
    deployUrl?: string;
    adminUrl?: string;
    error?: string;
  } | null>(null);

  // Check authentication status and load site association on mount
  useEffect(() => {
    if (isOpen) {
      checkAuthStatus();
      loadSiteAssociation();
    }
  }, [isOpen, projectId]);

  const checkAuthStatus = async () => {
    const authenticated = await netlifyService.isAuthenticated();
    setIsAuthenticated(authenticated);

    if (authenticated) {
      const user = await netlifyService.getCurrentUser();
      if (user) {
        setUserEmail(user.email);
      }
    }
  };

  const loadSiteAssociation = async () => {
    const association = await netlifyService.getSiteAssociation(projectId);
    setSiteAssociation(association);

    // Pre-fill site name if no association exists
    if (!association && !siteName) {
      // Generate a site name suggestion from project name
      const suggested = projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setSiteName(suggested);
    }
  };

  const handleConnect = async () => {
    setIsAuthenticating(true);
    try {
      const success = await netlifyService.authenticate();
      if (success) {
        setIsAuthenticated(true);
        const user = await netlifyService.getCurrentUser();
        if (user) {
          setUserEmail(user.email);
        }
      }
    } catch (error: any) {
      console.error('Authentication failed:', error);

      // Provide user-friendly error messages
      let errorMessage = 'Failed to connect to Netlify. Please try again.';

      if (error.message?.includes('popup was closed')) {
        errorMessage = 'Authentication was cancelled. Please try again and complete the authorization process.';
      } else if (error.message?.includes('Failed to open OAuth popup')) {
        errorMessage = 'Pop-ups are blocked. Please allow pop-ups for this site and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      alert(errorMessage);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = async () => {
    await netlifyService.logout();
    setIsAuthenticated(false);
    setUserEmail('');
  };

  const handleDeploy = async () => {
    if (!webContainer) {
      alert('WebContainer not available');
      return;
    }

    setIsDeploying(true);
    setDeployProgress(null);
    setDeployResult(null);

    // Log to terminal
    if (writeToTerminal) {
      writeToTerminal('\n\x1b[90m' + '═'.repeat(80) + '\x1b[0m\n');
      writeToTerminal('\x1b[36m☁️  Starting Netlify Deployment\x1b[0m\n');
      writeToTerminal('\x1b[90m' + '═'.repeat(80) + '\x1b[0m\n\n');
    }

    try {
      const result = await netlifyService.deployProject(
        webContainer,
        projectId,
        projectName,
        siteName || undefined,
        (progress) => {
          setDeployProgress(progress);
        },
        writeToTerminal
      );

      setDeployResult(result);

      // Reload association after successful deployment
      if (result.success) {
        await loadSiteAssociation();
      }

      // Log success to terminal
      if (writeToTerminal && result.success) {
        writeToTerminal('\n\x1b[32m✅ Deployment successful!\x1b[0m\n');
        if (result.siteUrl) {
          writeToTerminal(`\x1b[36m🌐 Site URL: ${result.siteUrl}\x1b[0m\n`);
        }
        writeToTerminal('\n');
      }
    } catch (error: any) {
      console.error('Deployment error:', error);

      // Log error to terminal
      if (writeToTerminal) {
        writeToTerminal(`\x1b[31m❌ Deployment failed: ${error.message}\x1b[0m\n\n`);
      }

      setDeployResult({
        success: false,
        error: error.message || 'Deployment failed'
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleClose = () => {
    if (!isDeploying) {
      setDeployProgress(null);
      setDeployResult(null);
      setSiteName('');
      onClose();
    }
  };

  const getProgressPercentage = () => {
    return deployProgress?.progress || 0;
  };

  const getStageColor = (stage: string) => {
    if (!deployProgress) return 'text-gray-400';
    if (stage === 'error') return 'text-red-500';
    if (stage === 'ready') return 'text-green-500';
    return 'text-blue-500';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 19.5h20L12 2zm0 3.84L18.93 18H5.07L12 5.84z" fill="#00C7B7"/>
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Deploy to Netlify
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeploying}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Authentication Section */}
          {!isAuthenticated ? (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                Connect your Netlify account to deploy your project.
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium mb-1">Important:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
                      <li>A popup window will open for authorization</li>
                      <li>Make sure pop-ups are allowed for this site</li>
                      <li>Complete the authorization and don't close the popup</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={isAuthenticating}
                className="w-full bg-[#00C7B7] hover:bg-[#00B5A5] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isAuthenticating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Connect Netlify Account</span>
                  </>
                )}
              </button>
            </div>
          ) : deployResult?.success ? (
            /* Success State */
            <div className="space-y-4">
              <div className="flex items-center justify-center text-green-500">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Deployment Successful!
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Your site is now live on Netlify
                </p>
              </div>

              <div className="space-y-3">
                {deployResult.siteUrl && (
                  <a
                    href={deployResult.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-colors text-center"
                  >
                    Visit Site
                  </a>
                )}
                {deployResult.adminUrl && (
                  <a
                    href={deployResult.adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium py-3 px-4 rounded-lg transition-colors text-center"
                  >
                    View in Netlify Dashboard
                  </a>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleClose}
                  className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium py-2"
                >
                  Close
                </button>
              </div>
            </div>
          ) : deployResult?.error ? (
            /* Error State */
            <div className="space-y-4">
              <div className="flex items-center justify-center text-red-500">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Deployment Failed
                </h3>
                <p className="text-red-600 dark:text-red-400 mb-4">
                  {deployResult.error}
                </p>
              </div>
              <button
                onClick={() => setDeployResult(null)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : isDeploying ? (
            /* Deploying State */
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Deploying Your Project
                </h3>
                <p className={`${getStageColor(deployProgress?.stage || '')} mb-4`}>
                  {deployProgress?.message || 'Starting deployment...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-500 ease-out"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>

              {/* File Upload Progress */}
              {deployProgress?.filesUploaded !== undefined && deployProgress?.totalFiles !== undefined && (
                <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Uploaded {deployProgress.filesUploaded} of {deployProgress.totalFiles} files
                </div>
              )}

              {/* Stage Indicators */}
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pt-2">
                <span className={deployProgress?.stage === 'exporting' ? 'font-semibold text-blue-500' : ''}>
                  Export
                </span>
                <span className={deployProgress?.stage === 'creating_deploy' ? 'font-semibold text-blue-500' : ''}>
                  Create
                </span>
                <span className={deployProgress?.stage === 'uploading' ? 'font-semibold text-blue-500' : ''}>
                  Upload
                </span>
                <span className={deployProgress?.stage === 'building' ? 'font-semibold text-blue-500' : ''}>
                  Build
                </span>
                <span className={deployProgress?.stage === 'ready' ? 'font-semibold text-green-500' : ''}>
                  Ready
                </span>
              </div>
            </div>
          ) : (
            /* Deploy Form */
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Connected as {userEmail}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Disconnect
                </button>
              </div>

              {/* Site Association Info */}
              {siteAssociation ? (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">
                        Production Deployment
                      </p>
                      <div className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
                        <p>
                          <span className="font-medium">Site:</span>{' '}
                          <a
                            href={siteAssociation.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-purple-600"
                          >
                            {siteAssociation.siteName}
                          </a>
                        </p>
                        <p>
                          <span className="font-medium">Last deployed:</span>{' '}
                          {new Date(siteAssociation.lastDeployedAt).toLocaleString()}
                        </p>
                        <p>
                          <span className="font-medium">Total deploys:</span> {siteAssociation.deploymentCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-medium mb-1">First Deployment</p>
                      <p className="text-blue-700 dark:text-blue-300">
                        This will be your first deployment for this project. A new Netlify site will be created and linked to this project.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Site Name (optional)
                </label>
                <input
                  type="text"
                  id="siteName"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="my-awesome-site"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave empty for auto-generated name
                </p>
              </div>

              <button
                onClick={handleDeploy}
                disabled={!webContainer}
                className="w-full bg-[#00C7B7] hover:bg-[#00B5A5] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>
                  {siteAssociation
                    ? `Deploy to ${siteAssociation.siteName}`
                    : 'Deploy to Netlify'}
                </span>
              </button>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>• Your project files will be deployed to Netlify</p>
                  <p>• Only changed files will be uploaded</p>
                  <p>• Rate limit: 3 deploys per minute</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
