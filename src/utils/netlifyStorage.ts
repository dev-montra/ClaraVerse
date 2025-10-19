/**
 * Netlify Site Association Storage
 * Manages the mapping between LumaUI projects and Netlify sites
 * Uses IndexedDB for persistent storage
 */

const DB_NAME = 'LumaUINetlifyDB';
const DB_VERSION = 1;
const STORE_NAME = 'siteAssociations';

export interface SiteMapping {
  projectId: string;          // LumaUI project ID (unique key)
  projectName: string;        // Display name
  siteId: string;             // Netlify site ID
  siteName: string;           // Netlify site name
  siteUrl: string;            // Production URL
  lastDeployedAt: string;     // ISO timestamp
  deploymentCount: number;    // How many times deployed
}

/**
 * Initialize IndexedDB
 */
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };
  });
}

/**
 * Get site mapping for a project
 */
export async function getSiteMapping(projectId: string): Promise<SiteMapping | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(projectId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting site mapping:', error);
    return null;
  }
}

/**
 * Save or update site mapping
 */
export async function saveSiteMapping(mapping: SiteMapping): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(mapping);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error saving site mapping:', error);
    throw error;
  }
}

/**
 * Delete site mapping for a project
 */
export async function deleteSiteMapping(projectId: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error deleting site mapping:', error);
    throw error;
  }
}

/**
 * Get all site mappings
 */
export async function getAllMappings(): Promise<SiteMapping[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting all mappings:', error);
    return [];
  }
}

/**
 * Check if a project has a site association
 */
export async function hasSiteMapping(projectId: string): Promise<boolean> {
  const mapping = await getSiteMapping(projectId);
  return mapping !== null;
}

/**
 * Update last deployed timestamp and increment deployment count
 */
export async function updateDeploymentInfo(projectId: string): Promise<void> {
  const mapping = await getSiteMapping(projectId);
  if (mapping) {
    mapping.lastDeployedAt = new Date().toISOString();
    mapping.deploymentCount += 1;
    await saveSiteMapping(mapping);
  }
}
