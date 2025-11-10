/**
 * Netlify OAuth Handler for Electron
 * Handles OAuth flow using BrowserWindow instead of popup
 */

const { BrowserWindow } = require('electron');
const url = require('url');

class NetlifyOAuthHandler {
  constructor() {
    this.authWindow = null;
  }

  /**
   * Start OAuth flow
   * @param {string} authUrl - The Netlify OAuth URL
   * @returns {Promise<string>} - Access token
   */
  async authenticate(authUrl) {
    return new Promise((resolve, reject) => {
      // Close existing auth window if any
      if (this.authWindow) {
        this.authWindow.close();
        this.authWindow = null;
      }

      // Create auth window
      this.authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false
        },
        title: 'Connect to Netlify',
        autoHideMenuBar: true
      });

      // Load the OAuth URL
      this.authWindow.loadURL(authUrl);

      // Show window when ready
      this.authWindow.once('ready-to-show', () => {
        this.authWindow.show();
      });

      // Handle navigation to extract token
      this.authWindow.webContents.on('will-redirect', (event, redirectUrl) => {
        this.handleCallback(redirectUrl, resolve, reject);
      });

      // Also check on did-navigate for some OAuth providers
      this.authWindow.webContents.on('did-navigate', (event, navigateUrl) => {
        this.handleCallback(navigateUrl, resolve, reject);
      });

      // Handle window closed
      this.authWindow.on('closed', () => {
        this.authWindow = null;
        reject(new Error('OAuth window was closed before authentication completed'));
      });

      // Handle errors
      this.authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('OAuth window failed to load:', errorCode, errorDescription);
      });
    });
  }

  /**
   * Handle OAuth callback URL
   */
  handleCallback(callbackUrl, resolve, reject) {
    const parsedUrl = url.parse(callbackUrl, true);

    // Check if this is the callback URL
    if (callbackUrl.includes('/oauth-netlify-callback.html') ||
        parsedUrl.hash ||
        callbackUrl.includes('access_token')) {

      // Extract hash fragment (Netlify uses implicit flow with #access_token)
      const hash = parsedUrl.hash ? parsedUrl.hash.substring(1) : '';

      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (error) {
          this.cleanup();
          reject(new Error(errorDescription || error));
          return;
        }

        if (accessToken) {
          this.cleanup();
          resolve(accessToken);
          return;
        }
      }
    }
  }

  /**
   * Cleanup auth window
   */
  cleanup() {
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }

  /**
   * Cancel ongoing authentication
   */
  cancel() {
    this.cleanup();
  }
}

module.exports = NetlifyOAuthHandler;
