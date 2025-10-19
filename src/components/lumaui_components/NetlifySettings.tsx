/**
 * Netlify Settings Component
 * Manage Netlify account connection and view deployment history
 */

import React, { useState, useEffect } from 'react';
import { netlifyService } from '../../services/netlifyService';
import type { NetlifySite, NetlifyDeploy } from '../../services/netlifyAPI';

export const NetlifySettings: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [sites, setSites] = useState<NetlifySite[]>([]);
  const [selectedSite, setSelectedSite] = useState<NetlifySite | null>(null);
  const [deployments, setDeployments] = useState<NetlifyDeploy[]>([]);
  const [loadingDeployments, setLoadingDeployments] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      const authenticated = await netlifyService.isAuthenticated();
      setIsAuthenticated(authenticated);

      if (authenticated) {
        const user = await netlifyService.getCurrentUser();
        if (user) {
          setUserEmail(user.email);
          await loadSites();
        }
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSites = async () => {
    try {
      const userSites = await netlifyService.listSites();
      setSites(userSites);
    } catch (error) {
      console.error('Failed to load sites:', error);
    }
  };

  const loadDeployments = async (siteId: string) => {
    setLoadingDeployments(true);
    try {
      const deploys = await netlifyService.getDeployments(siteId, 10);
      setDeployments(deploys);
    } catch (error) {
      console.error('Failed to load deployments:', error);
      setDeployments([]);
    } finally {
      setLoadingDeployments(false);
    }
  };

  const handleConnect = async () => {
    setIsAuthenticating(true);
    try {
      const success = await netlifyService.authenticate();
      if (success) {
        await checkAuthStatus();
      }
    } catch (error: any) {
      console.error('Authentication failed:', error);
      alert(error.message || 'Failed to connect to Netlify. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to disconnect your Netlify account?')) {
      await netlifyService.logout();
      setIsAuthenticated(false);
      setUserEmail('');
      setSites([]);
      setSelectedSite(null);
      setDeployments([]);
    }
  };

  const handleSiteClick = async (site: NetlifySite) => {
    setSelectedSite(site);
    await loadDeployments(site.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const getDeployStatusColor = (state: string) => {
    switch (state) {
      case 'ready':
        return 'text-green-500 bg-green-100 dark:bg-green-900/20';
      case 'building':
      case 'processing':
        return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
      case 'error':
        return 'text-red-500 bg-red-100 dark:bg-red-900/20';
      default:
        return 'text-gray-500 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <svg className="w-20 h-20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 19.5h20L12 2zm0 3.84L18.93 18H5.07L12 5.84z" fill="#00C7B7"/>
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Connect to Netlify
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Deploy your projects directly to Netlify from LumaUI
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-left">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              What you can do:
            </h3>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Deploy projects with one click</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Manage your Netlify sites</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>View deployment history</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Efficient updates (only changed files)</span>
              </li>
            </ul>
          </div>

          <button
            onClick={handleConnect}
            disabled={isAuthenticating}
            className="inline-flex items-center space-x-2 bg-[#00C7B7] hover:bg-[#00B5A5] text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Your credentials are stored securely in your browser
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Account Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-[#00C7B7] rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 19.5h20L12 2zm0 3.84L18.93 18H5.07L12 5.84z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Netlify Account
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {userEmail}
              </p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sites List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Your Sites ({sites.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
            {sites.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No sites yet. Deploy your first project!
              </div>
            ) : (
              sites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => handleSiteClick(site)}
                  className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedSite?.id === site.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {site.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {site.ssl_url || site.url}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Deployment History */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {selectedSite ? `Deployments for ${selectedSite.name}` : 'Deployment History'}
            </h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
            {!selectedSite ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                Select a site to view deployments
              </div>
            ) : loadingDeployments ? (
              <div className="p-6 flex justify-center">
                <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : deployments.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No deployments found
              </div>
            ) : (
              deployments.map((deploy) => (
                <div key={deploy.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getDeployStatusColor(deploy.state)}`}>
                          {deploy.state}
                        </span>
                        {deploy.context && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {deploy.context}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(deploy.created_at)}
                      </p>
                    </div>
                    {deploy.deploy_url && (
                      <a
                        href={deploy.deploy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 ml-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                  {deploy.title && (
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {deploy.title}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Rate Limit Info */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">Netlify Rate Limits</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
              <li>3 deploys per minute</li>
              <li>100 deploys per day</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
