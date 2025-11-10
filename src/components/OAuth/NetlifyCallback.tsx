/**
 * Netlify OAuth Callback Handler
 * This page receives the OAuth redirect and sends the token to the parent window
 */

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const NetlifyCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');

  useEffect(() => {
    // Parse OAuth callback from URL hash
    const hash = window.location.hash.substring(1); // Remove #
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || error);

      // Send error to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'netlify-oauth-error',
          error: errorDescription || error
        }, window.location.origin);
      }

      // Auto-close after 3 seconds
      setTimeout(() => {
        window.close();
      }, 3000);

    } else if (accessToken) {
      setStatus('success');
      setMessage('Successfully connected to Netlify!');

      // Send token to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'netlify-oauth-success',
          access_token: accessToken
        }, window.location.origin);
      }

      // Auto-close after 1.5 seconds
      setTimeout(() => {
        window.close();
      }, 1500);

    } else {
      setStatus('error');
      setMessage('No access token received');

      setTimeout(() => {
        window.close();
      }, 3000);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="glassmorphic-card p-8 max-w-md text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-blue-500 animate-spin" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">
              Connecting to Netlify
            </h2>
            <p className="text-gray-400 text-sm">
              {message}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">
              Success!
            </h2>
            <p className="text-gray-400 text-sm">
              {message}
            </p>
            <p className="text-gray-500 text-xs mt-4">
              This window will close automatically...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">
              Connection Failed
            </h2>
            <p className="text-gray-400 text-sm">
              {message}
            </p>
            <p className="text-gray-500 text-xs mt-4">
              This window will close automatically...
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default NetlifyCallback;
