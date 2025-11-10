/**
 * Netlify Deployment Service
 * Handles OAuth authentication and project deployment to Netlify
 */

import { tokenStorage } from '../utils/tokenStorage';
import { NetlifyAPI, NetlifyAPIError, type NetlifySite, type NetlifyDeploy, type NetlifyUser } from './netlifyAPI';
import { exportProjectFiles, buildDeployManifest, filterRequiredFiles, type FileDigest } from '../utils/fileExport';
import { getSiteMapping, saveSiteMapping, deleteSiteMapping, type SiteMapping } from '../utils/netlifyStorage';
import type { WebContainer } from '@webcontainer/api';

// Netlify OAuth configuration
// NOTE: You'll need to create a Netlify OAuth app and get these values
const NETLIFY_CLIENT_ID = 'KZajKm0SCYGaHSTMRO4UV3RUe9C6RiNx6r5x9Hs4g1c'; // Replace with actual client ID
const NETLIFY_OAUTH_URL = 'https://app.netlify.com/authorize';
const NETLIFY_REDIRECT_URI = `${window.location.origin}/oauth-netlify-callback.html`;

export interface DeploymentProgress {
  stage: 'exporting' | 'creating_deploy' | 'uploading' | 'building' | 'ready' | 'error';
  message: string;
  progress: number; // 0-100
  filesUploaded?: number;
  totalFiles?: number;
}

export interface DeploymentResult {
  success: boolean;
  siteUrl?: string;
  deployUrl?: string;
  adminUrl?: string;
  error?: string;
}

export class NetlifyService {
  private api: NetlifyAPI | null = null;
  private currentUser: NetlifyUser | null = null;

  /**
   * Check if user is authenticated with Netlify
   */
  async isAuthenticated(): Promise<boolean> {
    return await tokenStorage.hasValidToken('netlify');
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<NetlifyUser | null> {
    if (this.currentUser) return this.currentUser;

    const token = await tokenStorage.getToken('netlify');
    if (!token) return null;

    try {
      this.api = new NetlifyAPI(token.accessToken);
      this.currentUser = await this.api.getCurrentUser();
      return this.currentUser;
    } catch (error) {
      console.error('Failed to get current user:', error);
      // Token might be invalid, clear it
      await this.logout();
      return null;
    }
  }

  /**
   * Initiate OAuth authentication flow
   */
  async authenticate(): Promise<boolean> {
    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: NETLIFY_CLIENT_ID,
      response_type: 'token',
      redirect_uri: NETLIFY_REDIRECT_URI
    });

    const oauthUrl = `${NETLIFY_OAUTH_URL}?${params.toString()}`;

    try {
      // Check if running in Electron
      if (window.electron?.netlifyOAuth) {
        // Use Electron IPC for OAuth
        const result = await window.electron.netlifyOAuth.authenticate(oauthUrl);

        if (!result.success) {
          throw new Error(result.error || 'OAuth authentication failed');
        }

        const accessToken = result.accessToken;

        if (!accessToken) {
          throw new Error('No access token received');
        }

        // Get user info to verify token
        const api = new NetlifyAPI(accessToken);
        const user = await api.getCurrentUser();

        // Store token
        await tokenStorage.setToken('netlify', {
          accessToken: accessToken,
          userEmail: user.email
        });

        this.api = api;
        this.currentUser = user;

        return true;
      } else {
        // Fallback to web-based popup (for development in browser)
        return this.authenticateWithPopup(oauthUrl);
      }
    } catch (error) {
      console.error('OAuth authentication failed:', error);
      throw error;
    }
  }

  /**
   * Web-based popup authentication (fallback for browser)
   */
  private async authenticateWithPopup(oauthUrl: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Open popup window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        oauthUrl,
        'Netlify OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        reject(new Error('Failed to open OAuth popup. Please allow popups for this site.'));
        return;
      }

      // Listen for OAuth callback
      const handleMessage = async (event: MessageEvent) => {
        if (event.data.type === 'netlify-oauth-success') {
          const { access_token } = event.data;

          if (access_token) {
            try {
              const api = new NetlifyAPI(access_token);
              const user = await api.getCurrentUser();

              await tokenStorage.setToken('netlify', {
                accessToken: access_token,
                userEmail: user.email
              });

              this.api = api;
              this.currentUser = user;

              window.removeEventListener('message', handleMessage);
              clearInterval(checkPopup);
              popup.close();
              resolve(true);
            } catch (error) {
              window.removeEventListener('message', handleMessage);
              clearInterval(checkPopup);
              popup.close();
              reject(error);
            }
          }
        } else if (event.data.type === 'netlify-oauth-error') {
          window.removeEventListener('message', handleMessage);
          clearInterval(checkPopup);
          popup.close();
          reject(new Error(event.data.error || 'OAuth authentication failed'));
        }
      };

      window.addEventListener('message', handleMessage);

      // Handle popup closed without completing auth
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          window.removeEventListener('message', handleMessage);
          reject(new Error('OAuth popup was closed before authentication completed'));
        }
      }, 500);
    });
  }

  /**
   * Logout and clear stored tokens
   */
  async logout(): Promise<void> {
    await tokenStorage.deleteToken('netlify');
    this.api = null;
    this.currentUser = null;
  }

  /**
   * Get site association for a project
   */
  async getSiteAssociation(projectId: string): Promise<SiteMapping | null> {
    return await getSiteMapping(projectId);
  }

  /**
   * Create or find existing site
   * Smart logic to avoid creating duplicate sites
   */
  private async createOrFindSite(siteName?: string, writeToTerminal?: (data: string) => void): Promise<NetlifySite> {
    if (!this.api) {
      throw new Error('API not initialized');
    }

    if (siteName) {
      // Check if site with this name already exists in user's account
      try {
        const sites = await this.api.listSites();
        const existing = sites.find(s => s.name === siteName);

        if (existing) {
          writeToTerminal?.(`\x1b[36m✅ Found existing site: ${siteName}\x1b[0m\n`);
          console.log(`✅ Using existing site: ${siteName} (${existing.id})`);
          return existing;
        }
      } catch (error) {
        console.warn('Could not list sites:', error);
        // Continue to create new site
      }

      // Try to create site with the specified name
      try {
        const site = await this.api.createSite(siteName);
        writeToTerminal?.(`\x1b[32m🎉 Created new site: ${site.name}\x1b[0m\n`);
        console.log(`🎉 Created new site: ${site.name} (${site.id})`);
        return site;
      } catch (error: any) {
        // Name might be taken, fall through to auto-generated name
        if (error.status === 422) {
          writeToTerminal?.(`\x1b[33m⚠️  Site name "${siteName}" is taken, generating random name...\x1b[0m\n`);
          console.log(`Site name ${siteName} taken, creating with auto-generated name`);
        } else {
          throw error;
        }
      }
    }

    // Create with auto-generated name
    const site = await this.api.createSite();
    writeToTerminal?.(`\x1b[32m🎉 Created site: ${site.name}\x1b[0m\n`);
    console.log(`🎉 Created site with auto-generated name: ${site.name} (${site.id})`);
    return site;
  }

  /**
   * Deploy project to Netlify
   */
  async deployProject(
    webContainer: WebContainer,
    projectId: string,
    projectName: string,
    siteName?: string,
    onProgress?: (progress: DeploymentProgress) => void,
    writeToTerminal?: (data: string) => void
  ): Promise<DeploymentResult> {
    try {
      // Ensure authenticated
      const token = await tokenStorage.getToken('netlify');
      if (!token) {
        throw new Error('Not authenticated with Netlify. Please connect your account first.');
      }

      if (!this.api) {
        this.api = new NetlifyAPI(token.accessToken);
      }

      // Step 1: Check if project has a build script
      onProgress?.({
        stage: 'exporting',
        message: 'Checking project...',
        progress: 5
      });

      let hasBuildScript = false;
      try {
        const packageJsonContent = await webContainer.fs.readFile('/package.json', 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        hasBuildScript = packageJson.scripts?.build !== undefined;
        console.log(`📋 Build script ${hasBuildScript ? 'found' : 'not found'}`);
      } catch (error) {
        console.log('⚠️  Could not read package.json');
      }

      // Step 2: Build if needed
      if (hasBuildScript) {
        onProgress?.({
          stage: 'exporting',
          message: 'Building project...',
          progress: 10
        });

        writeToTerminal?.('\x1b[33m🔨 Running npm run build...\x1b[0m\n');

        try {
          const buildProcess = await webContainer.spawn('npm', ['run', 'build']);

          // Stream build output to both console and terminal
          buildProcess.output.pipeTo(new WritableStream({
            write(data) {
              console.log(data);
              // Write to terminal if available
              if (writeToTerminal) {
                writeToTerminal(data);
              }
            }
          }));

          const buildExit = await buildProcess.exit;

          if (buildExit !== 0) {
            writeToTerminal?.('\x1b[31m❌ Build failed\x1b[0m\n');
            throw new Error('Build failed. Check the terminal output above for details.');
          }

          writeToTerminal?.('\x1b[32m✅ Build completed successfully\x1b[0m\n\n');
        } catch (error: any) {
          throw new Error('Build failed: ' + (error.message || 'Unknown error'));
        }
      } else {
        writeToTerminal?.('\x1b[36m📦 No build script found, deploying as static site\x1b[0m\n');
      }

      // Step 3: Export files
      onProgress?.({
        stage: 'exporting',
        message: 'Exporting files...',
        progress: 20
      });

      const exportedProject = await exportProjectFiles(webContainer);

      console.log(`📦 Exported ${exportedProject.fileCount} files (${(exportedProject.totalSize / 1024).toFixed(2)} KB)`);

      // Step 2: Get or create site (with smart association)
      onProgress?.({
        stage: 'creating_deploy',
        message: 'Preparing site...',
        progress: 20
      });

      // Check for existing site association
      const association = await getSiteMapping(projectId);
      let site: NetlifySite;

      if (association) {
        // Try to use existing associated site
        writeToTerminal?.(`\x1b[36m🔗 Found site association: ${association.siteName}\x1b[0m\n`);
        console.log(`🔗 Found existing association: ${association.siteName} (${association.siteId})`);

        try {
          // Verify the site still exists
          site = await this.api.getSite(association.siteId);
          writeToTerminal?.(`\x1b[32m✅ Deploying to existing site: ${site.name}\x1b[0m\n`);
          writeToTerminal?.(`\x1b[90m📊 Deployment #${association.deploymentCount + 1} for this project\x1b[0m\n\n`);
          console.log(`✅ Using existing site: ${site.name} (deployment #${association.deploymentCount + 1})`);
        } catch (error) {
          // Site was deleted from Netlify!
          writeToTerminal?.(`\x1b[33m⚠️  Site "${association.siteName}" no longer exists on Netlify\x1b[0m\n`);
          writeToTerminal?.(`\x1b[90m📝 Creating new site...\x1b[0m\n`);
          console.warn(`Site ${association.siteId} not found, creating new one`);

          // Delete the stale association
          await deleteSiteMapping(projectId);

          // Create new site
          site = await this.createOrFindSite(siteName, writeToTerminal);
        }
      } else {
        // No association - first time deployment
        writeToTerminal?.(`\x1b[36m🎉 First deployment for this project\x1b[0m\n`);
        console.log('No existing association, creating/finding site');
        site = await this.createOrFindSite(siteName, writeToTerminal);
      }

      // Step 3: Create deploy with file manifest
      const manifest = buildDeployManifest(exportedProject.files);

      onProgress?.({
        stage: 'creating_deploy',
        message: 'Creating deployment manifest...',
        progress: 30
      });

      const deploy = await this.api.createDeploy(site.id, manifest);

      console.log(`📤 Deploy created: ${deploy.id}`);
      console.log(`📋 ${deploy.required?.length || 0} files need to be uploaded`);

      // Step 4: Upload required files
      if (deploy.required && deploy.required.length > 0) {
        const filesToUpload = filterRequiredFiles(exportedProject.files, deploy.required);

        onProgress?.({
          stage: 'uploading',
          message: `Uploading ${filesToUpload.length} files...`,
          progress: 40,
          filesUploaded: 0,
          totalFiles: filesToUpload.length
        });

        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];

          try {
            await this.api.uploadFile(deploy.id, file.path, file.content);

            onProgress?.({
              stage: 'uploading',
              message: `Uploading files... (${i + 1}/${filesToUpload.length})`,
              progress: 40 + ((i + 1) / filesToUpload.length) * 50,
              filesUploaded: i + 1,
              totalFiles: filesToUpload.length
            });
          } catch (error) {
            console.error(`Failed to upload ${file.path}:`, error);
            throw new Error(`Failed to upload ${file.path}: ${error}`);
          }
        }
      }

      // Step 5: Wait for deployment to complete
      onProgress?.({
        stage: 'building',
        message: 'Building and deploying...',
        progress: 90
      });

      let finalDeploy = await this.waitForDeploy(deploy.id, 60000); // 60 second timeout

      onProgress?.({
        stage: 'ready',
        message: 'Deployment successful!',
        progress: 100
      });

      // Step 6: Save or update site association
      await saveSiteMapping({
        projectId,
        projectName,
        siteId: site.id,
        siteName: site.name,
        siteUrl: site.ssl_url || site.url,
        lastDeployedAt: new Date().toISOString(),
        deploymentCount: association ? association.deploymentCount + 1 : 1
      });

      console.log(`💾 Saved site association: ${projectName} → ${site.name}`);
      writeToTerminal?.(`\x1b[90m💾 Site association saved for future deployments\x1b[0m\n`);

      return {
        success: true,
        siteUrl: site.ssl_url || site.url,
        deployUrl: finalDeploy.deploy_url,
        adminUrl: finalDeploy.admin_url
      };

    } catch (error: any) {
      console.error('Deployment failed:', error);

      onProgress?.({
        stage: 'error',
        message: error.message || 'Deployment failed',
        progress: 0
      });

      return {
        success: false,
        error: error.message || 'Unknown deployment error'
      };
    }
  }

  /**
   * Wait for deploy to complete
   */
  private async waitForDeploy(deployId: string, timeout: number = 60000): Promise<NetlifyDeploy> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds

    while (Date.now() - startTime < timeout) {
      const deploy = await this.api!.getDeploy(deployId);

      if (deploy.state === 'ready') {
        return deploy;
      } else if (deploy.state === 'error') {
        throw new Error(deploy.error_message || 'Deployment failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Deployment timeout - taking longer than expected');
  }

  /**
   * List user's sites
   */
  async listSites(): Promise<NetlifySite[]> {
    const token = await tokenStorage.getToken('netlify');
    if (!token) return [];

    if (!this.api) {
      this.api = new NetlifyAPI(token.accessToken);
    }

    try {
      return await this.api.listSites();
    } catch (error) {
      console.error('Failed to list sites:', error);
      return [];
    }
  }

  /**
   * Get deployment history for a site
   */
  async getDeployments(siteId: string, limit: number = 10): Promise<NetlifyDeploy[]> {
    const token = await tokenStorage.getToken('netlify');
    if (!token) return [];

    if (!this.api) {
      this.api = new NetlifyAPI(token.accessToken);
    }

    try {
      return await this.api.listDeploys(siteId, limit);
    } catch (error) {
      console.error('Failed to get deployments:', error);
      return [];
    }
  }
}

// Singleton instance
export const netlifyService = new NetlifyService();
