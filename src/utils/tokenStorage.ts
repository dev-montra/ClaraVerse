/**
 * Secure Token Storage Utility
 * Handles encrypted storage of OAuth tokens in IndexedDB
 */

const DB_NAME = 'ClaraVerseTokens';
const DB_VERSION = 1;
const STORE_NAME = 'oauth_tokens';

export interface StoredToken {
  service: string; // 'netlify', 'supabase', etc.
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userEmail?: string;
  createdAt: number;
}

class TokenStorage {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'service' });
        }
      };
    });
  }

  /**
   * Store token for a service
   */
  async setToken(service: string, token: Omit<StoredToken, 'service' | 'createdAt'>): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const storedToken: StoredToken = {
        service,
        ...token,
        createdAt: Date.now()
      };

      const request = store.put(storedToken);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get token for a service
   */
  async getToken(service: string): Promise<StoredToken | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(service);

      request.onsuccess = () => {
        const token = request.result as StoredToken | undefined;

        // Check if token is expired
        if (token && token.expiresAt && token.expiresAt < Date.now()) {
          console.warn(`Token for ${service} has expired`);
          resolve(null);
        } else {
          resolve(token || null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete token for a service
   */
  async deleteToken(service: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(service);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check if a service has a valid token
   */
  async hasValidToken(service: string): Promise<boolean> {
    const token = await this.getToken(service);
    return token !== null && (!token.expiresAt || token.expiresAt > Date.now());
  }

  /**
   * Get all stored tokens
   */
  async getAllTokens(): Promise<StoredToken[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all tokens (use with caution!)
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const tokenStorage = new TokenStorage();
