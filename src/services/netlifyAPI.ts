/**
 * Netlify API Client
 * Low-level REST API wrapper for Netlify deployments
 */

const NETLIFY_API_BASE = 'https://api.netlify.com/api/v1';

export interface NetlifySite {
  id: string;
  name: string;
  url: string;
  ssl_url: string;
  admin_url: string;
  created_at: string;
  updated_at: string;
}

export interface NetlifyDeploy {
  id: string;
  site_id: string;
  state: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'error';
  url: string;
  deploy_url: string;
  admin_url: string;
  created_at: string;
  published_at?: string;
  error_message?: string;
  required?: string[]; // Files that need to be uploaded
}

export interface NetlifyUser {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export class NetlifyAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'NetlifyAPIError';
  }
}

export class NetlifyAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${NETLIFY_API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      ...((options.headers as Record<string, string>) || {})
    };

    // Add Content-Type for JSON requests
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      let errorMessage = `Netlify API error: ${response.status} ${response.statusText}`;
      let errorData;

      try {
        errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // Response wasn't JSON
      }

      throw new NetlifyAPIError(errorMessage, response.status, errorData);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<NetlifyUser> {
    return this.request<NetlifyUser>('/user');
  }

  /**
   * Create a new site
   */
  async createSite(name?: string, customDomain?: string): Promise<NetlifySite> {
    const body: any = {};

    if (name) {
      body.name = name;
    }

    if (customDomain) {
      body.custom_domain = customDomain;
    }

    return this.request<NetlifySite>('/sites', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Get site by ID
   */
  async getSite(siteId: string): Promise<NetlifySite> {
    return this.request<NetlifySite>(`/sites/${siteId}`);
  }

  /**
   * List all sites
   */
  async listSites(): Promise<NetlifySite[]> {
    return this.request<NetlifySite[]>('/sites');
  }

  /**
   * Delete a site
   */
  async deleteSite(siteId: string): Promise<void> {
    await this.request(`/sites/${siteId}`, { method: 'DELETE' });
  }

  /**
   * Create a new deploy with file manifest
   */
  async createDeploy(
    siteId: string,
    files: Record<string, string> // { path: sha1_hash }
  ): Promise<NetlifyDeploy> {
    return this.request<NetlifyDeploy>(`/sites/${siteId}/deploys`, {
      method: 'POST',
      body: JSON.stringify({ files })
    });
  }

  /**
   * Upload a file to a deploy
   */
  async uploadFile(
    deployId: string,
    filePath: string,
    content: string | Blob
  ): Promise<void> {
    const url = `${NETLIFY_API_BASE}/deploys/${deployId}/files/${encodeURIComponent(filePath)}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: content
    });

    if (!response.ok) {
      throw new NetlifyAPIError(
        `Failed to upload file ${filePath}: ${response.statusText}`,
        response.status
      );
    }
  }

  /**
   * Get deploy status
   */
  async getDeploy(deployId: string): Promise<NetlifyDeploy> {
    return this.request<NetlifyDeploy>(`/deploys/${deployId}`);
  }

  /**
   * List deploys for a site
   */
  async listDeploys(siteId: string, limit: number = 10): Promise<NetlifyDeploy[]> {
    return this.request<NetlifyDeploy[]>(`/sites/${siteId}/deploys?per_page=${limit}`);
  }

  /**
   * Deploy using ZIP file (alternative method)
   */
  async deployZip(siteId: string, zipBlob: Blob): Promise<NetlifyDeploy> {
    const url = `${NETLIFY_API_BASE}/sites/${siteId}/deploys`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/zip'
      },
      body: zipBlob
    });

    if (!response.ok) {
      throw new NetlifyAPIError(
        `Failed to deploy ZIP: ${response.statusText}`,
        response.status
      );
    }

    return response.json();
  }

  /**
   * Update site configuration
   */
  async updateSite(siteId: string, config: Partial<NetlifySite>): Promise<NetlifySite> {
    return this.request<NetlifySite>(`/sites/${siteId}`, {
      method: 'PATCH',
      body: JSON.stringify(config)
    });
  }
}
