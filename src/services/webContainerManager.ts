import { WebContainer } from '@webcontainer/api';
import type { FileSystemTree } from '../components/lumaui_components/types';
import { LumauiProjectStorage } from './lumauiProjectStorage';

// CRITICAL: Global window storage for WebContainer instance
// This survives component remounts, hot reloads, and helps us find zombie instances!
declare global {
  interface Window {
    __webcontainerInstance?: WebContainer;
    __webcontainerProjectId?: string;
  }
}

// Utility to process WebContainer output streams
const processOutputData = (data: string): string[] => {
  // Clean ANSI codes and control characters
  const cleaned = data
    .replace(/\x1b\[[0-9;]*[mGKHJC]/g, '') // Remove ANSI color codes
    .replace(/\x1b\[[0-9]*[ABCD]/g, '') // Remove cursor movements
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n'); // Convert remaining carriage returns
  
  // Split into lines and filter out empty ones
  return cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => {
      // Filter out server status boxes and redundant messages
      if (line.includes('┌───') || line.includes('└───') || line.includes('│')) return false;
      if (line.includes('- Local:') || line.includes('- Network:')) return false;
      if (line.includes('Serving!')) return false;
      if (line.includes('Cannot copy server address')) return false;
      return true;
    });
};

export interface ContainerInfo {
  projectId: string;
  container: WebContainer;
  status: 'booting' | 'ready' | 'running' | 'error';
  port?: number;
  previewUrl?: string;
  process?: any;
  createdAt: Date;
}

export class WebContainerManager {
  private static instance: WebContainerManager;
  private currentContainer: WebContainer | null = null;
  private currentProjectId: string | null = null;
  private isBooting: boolean = false;
  private bootPromise: Promise<WebContainer> | null = null;
  private runningProcesses: any[] = [];
  private shellProcess: any = null;
  private containerInfo: ContainerInfo | null = null;
  private isInitialized = false;
  private onContainerDestroyed: (() => void) | null = null;

  static getInstance(): WebContainerManager {
    if (!WebContainerManager.instance) {
      WebContainerManager.instance = new WebContainerManager();
    }
    return WebContainerManager.instance;
  }

  /**
   * Set a callback for when container is destroyed
   */
  setDestroyCallback(callback: () => void): void {
    this.onContainerDestroyed = callback;
  }

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Check cross-origin isolation
    if (!window.crossOriginIsolated) {
      throw new Error('WebContainers require cross-origin isolation. Please ensure proper headers are set.');
    }

    this.isInitialized = true;
    console.log('✅ WebContainerManager initialized - ONE INSTANCE MODE');
  }

  /**
   * Check if a container is currently active
   */
  hasActiveContainer(): boolean {
    return this.currentContainer !== null;
  }

  /**
   * Get the current project ID
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /**
   * Register a running process for tracking
   */
  registerProcess(process: any): void {
    this.runningProcesses.push(process);
  }

  /**
   * Register the shell process
   */
  registerShell(shell: any): void {
    this.shellProcess = shell;
  }

  /**
   * Kill all running processes
   */
  private async killAllProcesses(onLog?: (msg: string) => void): Promise<void> {
    // Kill shell process first
    if (this.shellProcess) {
      try {
        this.shellProcess.kill();
        this.shellProcess = null;
        onLog?.('\x1b[33m⚡ Shell process terminated\x1b[0m\n');
      } catch (error) {
        console.warn('[WebContainerManager] Error killing shell:', error);
      }
    }

    // Kill all registered processes
    if (this.runningProcesses.length > 0) {
      onLog?.(`\x1b[33m⏹️ Terminating ${this.runningProcesses.length} processes...\x1b[0m\n`);

      for (const process of this.runningProcesses) {
        try {
          if (process && process.kill) {
            process.kill();
          }
        } catch (error) {
          console.warn('[WebContainerManager] Error killing process:', error);
        }
      }

      this.runningProcesses = [];
      onLog?.('\x1b[32m✅ All processes terminated\x1b[0m\n');
    }
  }

  /**
   * Cleanup the current container
   */
  private async cleanupContainer(onLog?: (msg: string) => void): Promise<void> {
    if (!this.currentContainer) return;

    onLog?.('\x1b[33m🧹 Cleaning up WebContainer...\x1b[0m\n');

    // Kill all processes first
    await this.killAllProcesses(onLog);

    // Teardown container
    try {
      await this.currentContainer.teardown();
      onLog?.('\x1b[32m✅ WebContainer cleaned up successfully\x1b[0m\n');
    } catch (error) {
      onLog?.('\x1b[33m⚠️ Warning: Error during teardown, forcing cleanup...\x1b[0m\n');
      console.error('[WebContainerManager] Teardown error:', error);
    }

    this.currentContainer = null;
    this.currentProjectId = null;
    this.containerInfo = null;

    // Notify listeners that container was destroyed
    if (this.onContainerDestroyed) {
      this.onContainerDestroyed();
    }

    // Wait for resources to be fully released
    onLog?.('\x1b[90m⏳ Waiting for resources to be released...\x1b[0m\n');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  /**
   * Boot a new WebContainer with automatic cleanup
   * Only ONE container can exist at a time globally
   */
  async bootContainer(
    projectId: string,
    onLog?: (msg: string) => void,
    forceNew: boolean = false
  ): Promise<WebContainer> {
    const log = (msg: string) => {
      if (onLog) onLog(msg);
      console.log('[WebContainerManager]', msg.replace(/\x1b\[[0-9;]*m/g, ''));
    };

    // If already booting, wait for it
    if (this.isBooting && this.bootPromise && !forceNew) {
      log('⏳ Boot already in progress, waiting...\n');
      return this.bootPromise;
    }

    // If container exists for same project and not forcing new, return it
    if (this.currentContainer && this.currentProjectId === projectId && !forceNew) {
      log(`✅ Reusing existing WebContainer for ${projectId}\n`);
      return this.currentContainer;
    }

    // AUTOMATIC CLEANUP - If container exists for different project or forcing new
    if (this.currentContainer) {
      log(`🔄 WebContainer exists for "${this.currentProjectId}", switching to "${projectId}"\n`);
      log('💡 Note: WebContainer allows only ONE instance at a time\n');
      await this.cleanupContainer(onLog);
    }

    // Start boot process
    this.isBooting = true;
    this.currentProjectId = projectId;
    this.bootPromise = this._bootWithRetry(log);

    try {
      this.currentContainer = await this.bootPromise;
      this.containerInfo = {
        projectId,
        container: this.currentContainer,
        status: 'ready',
        createdAt: new Date()
      };

      // CRITICAL: Store in GLOBAL window storage!
      window.__webcontainerInstance = this.currentContainer;
      window.__webcontainerProjectId = projectId;

      log('\x1b[32m✅ WebContainer booted successfully\x1b[0m\n');
      log('\x1b[90m🌍 Stored in global window storage\x1b[0m\n');
      return this.currentContainer;
    } catch (error) {
      this.currentContainer = null;
      this.currentProjectId = null;
      this.containerInfo = null;
      window.__webcontainerInstance = undefined;
      window.__webcontainerProjectId = undefined;
      throw error;
    } finally {
      this.isBooting = false;
      this.bootPromise = null;
    }
  }

  /**
   * Boot with retry logic
   */
  private async _bootWithRetry(
    log: (msg: string) => void,
    maxAttempts: number = 3
  ): Promise<WebContainer> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log(`\x1b[33m🔧 Booting WebContainer (attempt ${attempt}/${maxAttempts})...\x1b[0m\n`);

        const container = await WebContainer.boot();

        // Wait a bit to ensure boot is stable
        await new Promise(resolve => setTimeout(resolve, 500));

        return container;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log(`\x1b[31m❌ Boot attempt ${attempt} failed: ${lastError.message}\x1b[0m\n`);

        if (attempt < maxAttempts) {
          const delay = 2000 * attempt; // Exponential backoff
          log(`\x1b[33m⏳ Waiting ${delay}ms before retry...\x1b[0m\n`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Failed to boot WebContainer after ${maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown'}. Please refresh the page and try again.`
    );
  }

  /**
   * Get the current active container
   */
  getContainer(): WebContainer | null {
    return this.currentContainer;
  }

  /**
   * Get or boot container - REUSE if exists!
   * Checks GLOBAL window storage first (bulletproof singleton!)
   */
  async getOrBootContainer(onLog?: (msg: string) => void): Promise<WebContainer> {
    const log = (msg: string) => {
      if (onLog) onLog(msg);
      console.log('[WebContainerManager]', msg.replace(/\x1b\[[0-9;]*m/g, ''));
    };

    // CRITICAL: Check GLOBAL window storage first!
    if (window.__webcontainerInstance) {
      // Check if the container is still alive by trying to access it
      try {
        // Simple check - if this doesn't throw, container is alive
        await window.__webcontainerInstance.fs.readdir('/');
        log('✅ Reusing WebContainer instance from global storage\n');
        this.currentContainer = window.__webcontainerInstance;
        return window.__webcontainerInstance;
      } catch (error) {
        // Container is dead! Clear it and boot new one
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Proxy has been released') || errorMsg.includes('not useable')) {
          log('⚠️ Global container is dead (proxy released), clearing and booting new one...\n');
          window.__webcontainerInstance = undefined;
          window.__webcontainerProjectId = undefined;
          this.currentContainer = null;
        } else {
          // Some other error, maybe it's still usable
          throw error;
        }
      }
    }

    // Check manager storage second
    if (this.currentContainer) {
      try {
        // Verify it's alive
        await this.currentContainer.fs.readdir('/');
        log('✅ Reusing WebContainer instance from manager\n');
        window.__webcontainerInstance = this.currentContainer; // Sync to global
        return this.currentContainer;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Proxy has been released') || errorMsg.includes('not useable')) {
          log('⚠️ Manager container is dead (proxy released), clearing...\n');
          this.currentContainer = null;
        } else {
          throw error;
        }
      }
    }

    // Boot for the first time
    log('🚀 Booting WebContainer for the first time...\n');
    const container = await this.bootContainer('shared-container', onLog, false);

    // CRITICAL: Store in GLOBAL window storage!
    window.__webcontainerInstance = container;
    window.__webcontainerProjectId = 'shared-container';
    log('🌍 Stored instance in global window storage\n');

    return container;
  }

  /**
   * Switch projects by cleaning file system and remounting
   * DOES NOT destroy the container - much faster!
   */
  async switchProject(
    projectId: string,
    files: any,
    onLog?: (msg: string) => void
  ): Promise<void> {
    const log = (msg: string) => {
      if (onLog) onLog(msg);
      console.log('[WebContainerManager]', msg.replace(/\x1b\[[0-9;]*m/g, ''));
    };

    // Get or boot container
    const container = await this.getOrBootContainer(onLog);

    log(`\x1b[36m🔄 Switching to project: ${projectId}\x1b[0m\n`);

    // Kill running processes first
    await this.killAllProcesses(onLog);

    // Clear file system (keep tmp directory)
    log('\x1b[33m🧹 Clearing file system...\x1b[0m\n');
    try {
      const entries = await container.fs.readdir('/');
      for (const entry of entries) {
        // Keep system directories
        if (entry !== 'tmp' && entry !== 'proc' && entry !== 'dev') {
          try {
            await container.fs.rm(`/${entry}`, { recursive: true, force: true });
          } catch (error) {
            console.warn(`Failed to remove /${entry}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Error clearing file system:', error);
    }

    // Mount new files
    log('\x1b[33m📁 Mounting new project files...\x1b[0m\n');
    await container.mount(files);

    this.currentProjectId = projectId;

    if (this.containerInfo) {
      this.containerInfo.projectId = projectId;
      this.containerInfo.status = 'ready';
    }

    log('\x1b[32m✅ Project switched successfully\x1b[0m\n');
  }

  /**
   * Start a project (install dependencies and run dev server)
   */
  async startProject(
    projectId: string, 
    framework: 'react' | 'vanilla-html',
    onOutput?: (message: string, type: 'output' | 'error' | 'info') => void
  ): Promise<{ url?: string; port?: number }> {
    
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo || containerInfo.status !== 'ready') {
      throw new Error('Container not ready for project ' + projectId);
    }

    const { container } = containerInfo;
    
    try {
      containerInfo.status = 'running';
      
      if (framework === 'vanilla-html') {
        // For vanilla HTML, use WebContainer's built-in static server
        onOutput?.('📄 Starting static file server...', 'info');
        
        // Create a minimal package.json for serving
        await container.fs.writeFile('/package.json', JSON.stringify({
          name: 'static-server',
          version: '1.0.0',
          scripts: {
            serve: 'npx serve -s . -p 3000'
          }
        }, null, 2));
        
        // Install serve package
        onOutput?.('📦 Installing serve package...', 'info');
        const installProcess = await container.spawn('npm', ['install', 'serve']);
        
        installProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error('Failed to install serve package');
        }
        
        // Start the static server
        onOutput?.('🌐 Starting static server...', 'info');
        const serverProcess = await container.spawn('npx', ['serve', '-s', '.', '-p', '3000']);
        containerInfo.process = serverProcess;
        
        serverProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        // Listen for server ready event
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Static server startup timeout'));
          }, 15000); // 15 second timeout
          
          container.on('server-ready', async (port, url) => {
            clearTimeout(timeout);
            
            containerInfo.port = port;
            containerInfo.previewUrl = url;
            
            // Update persistent storage
            await LumauiProjectStorage.updateProjectStatus(projectId, 'running', url, port);
            
            onOutput?.(`🎉 Static server ready at ${url}`, 'info');
            resolve({ url, port });
          });
          
          // Also check manually after a delay as fallback
          setTimeout(async () => {
            if (!containerInfo.previewUrl) {
              try {
                // Try to detect the server manually
                const port = 3000;
                const url = `${window.location.protocol}//${window.location.hostname}:${port}`;
                
                containerInfo.port = port;
                containerInfo.previewUrl = url;
                
                await LumauiProjectStorage.updateProjectStatus(projectId, 'running', url, port);
                
                clearTimeout(timeout);
                onOutput?.(`🎉 Static server ready at ${url}`, 'info');
                resolve({ url, port });
              } catch (error) {
                // Will be handled by timeout
              }
            }
          }, 3000);
        });
        
      } else {
        // For React projects, install dependencies and run dev server
        onOutput?.('📦 Installing dependencies...', 'info');
        
        const installProcess = await container.spawn('npm', ['install']);
        
        installProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error('Failed to install dependencies');
        }
        
        onOutput?.('🌐 Starting development server...', 'info');
        
        const devProcess = await container.spawn('npm', ['run', 'dev']);
        containerInfo.process = devProcess;
        
        devProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        // Listen for server ready event
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Server startup timeout'));
          }, 30000); // 30 second timeout
          
          container.on('server-ready', async (port, url) => {
            clearTimeout(timeout);
            
            containerInfo.port = port;
            containerInfo.previewUrl = url;
            
            // Update persistent storage
            await LumauiProjectStorage.updateProjectStatus(projectId, 'running', url, port);
            
            onOutput?.(`🎉 Server ready at ${url}`, 'info');
            resolve({ url, port });
          });
        });
      }
      
    } catch (error) {
      containerInfo.status = 'error';
      await LumauiProjectStorage.updateProjectStatus(projectId, 'error');
      throw error;
    }
  }

  /**
   * Stop the current project
   */
  async stopProject(onLog?: (msg: string) => void): Promise<void> {
    if (!this.containerInfo) return;

    try {
      await this.killAllProcesses(onLog);

      if (this.containerInfo) {
        this.containerInfo.status = 'ready';
        this.containerInfo.port = undefined;
        this.containerInfo.previewUrl = undefined;

        // Update persistent storage
        if (this.currentProjectId) {
          await LumauiProjectStorage.updateProjectStatus(this.currentProjectId, 'idle');
        }
      }

      onLog?.(`\x1b[32m⏹️ Stopped project ${this.currentProjectId}\x1b[0m\n`);
      console.log(`⏹️ Stopped project ${this.currentProjectId}`);
    } catch (error) {
      console.error('Error stopping project:', error);
    }
  }

  /**
   * Destroy the current container completely
   */
  async destroyContainer(onLog?: (msg: string) => void): Promise<void> {
    const projectId = this.currentProjectId;

    try {
      await this.cleanupContainer(onLog);

      // Update persistent storage
      if (projectId) {
        await LumauiProjectStorage.updateProjectStatus(projectId, 'idle');
      }

      onLog?.(`\x1b[32m🗑️ Destroyed container for project ${projectId}\x1b[0m\n`);
      console.log(`🗑️ Destroyed container for project ${projectId}`);
    } catch (error) {
      console.error('Error destroying container:', error);
    }
  }

  /**
   * Get container status
   */
  getContainerStatus(): ContainerInfo | null {
    return this.containerInfo;
  }

  /**
   * Cleanup for app shutdown
   */
  async cleanup(onLog?: (msg: string) => void): Promise<void> {
    await this.destroyContainer(onLog);

    // Clear global window storage
    window.__webcontainerInstance = undefined;
    window.__webcontainerProjectId = undefined;

    console.log('🧹 WebContainerManager cleanup complete');
  }

  /**
   * Force cleanup - use when things are stuck
   * Checks GLOBAL window storage first (survives component remounts!)
   */
  async forceCleanup(onLog?: (msg: string) => void): Promise<void> {
    const log = (msg: string) => {
      if (onLog) onLog(msg);
      console.log('[WebContainerManager]', msg.replace(/\x1b\[[0-9;]*m/g, ''));
    };

    log('\x1b[31m🔨 Force cleanup initiated...\x1b[0m\n');

    // Reset all internal state
    this.shellProcess = null;
    this.runningProcesses = [];
    this.isBooting = false;
    this.bootPromise = null;
    this.containerInfo = null;
    this.currentProjectId = null;

    // CRITICAL: Check GLOBAL window storage first!
    if (window.__webcontainerInstance) {
      log('\x1b[33m🌍 Found instance in global window storage, tearing down...\x1b[0m\n');
      try {
        await window.__webcontainerInstance.teardown();
        window.__webcontainerInstance = undefined;
        window.__webcontainerProjectId = undefined;
        log('\x1b[32m✅ Global instance destroyed\x1b[0m\n');
      } catch (error) {
        console.error('[WebContainerManager] Error tearing down global instance:', error);
        log('\x1b[33m⚠️ Error during global teardown, clearing reference...\x1b[0m\n');
        window.__webcontainerInstance = undefined;
        window.__webcontainerProjectId = undefined;
      }
    }

    // If we have a container reference in manager, tear it down
    if (this.currentContainer) {
      log('\x1b[33m📦 Tearing down manager-tracked container...\x1b[0m\n');
      try {
        await this.currentContainer.teardown();
      } catch (error) {
        console.error('[WebContainerManager] Force cleanup error:', error);
      }
      this.currentContainer = null;
    }

    // Wait for teardown to complete
    log('\x1b[90m⏳ Waiting for cleanup to complete...\x1b[0m\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // NUCLEAR: Try to detect if zombie still exists by attempting boot
    log('\x1b[33m🔍 Checking for remaining zombie instances...\x1b[0m\n');
    try {
      const testContainer = await WebContainer.boot();
      log('\x1b[32m✅ No zombie detected - boot successful\x1b[0m\n');
      // Immediately teardown the test container
      await testContainer.teardown();
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('single WebContainer instance')) {
        log('\x1b[31m💀 ZOMBIE STILL EXISTS! Cannot be cleaned up!\x1b[0m\n');
        log('\x1b[33m⚠️ You MUST close and reopen the Electron app!\x1b[0m\n');
        log('\x1b[90m   The zombie instance was created before global storage was implemented.\x1b[0m\n');
      }
    }

    log('\x1b[32m✅ Force cleanup complete\x1b[0m\n');
  }

  /**
   * Get stats about current state
   */
  getStats(): {
    hasContainer: boolean;
    isBooting: boolean;
    processCount: number;
    hasShell: boolean;
    currentProjectId: string | null;
  } {
    return {
      hasContainer: this.currentContainer !== null,
      isBooting: this.isBooting,
      processCount: this.runningProcesses.length,
      hasShell: this.shellProcess !== null,
      currentProjectId: this.currentProjectId,
    };
  }
}

// Export singleton instance
export const webContainerManager = WebContainerManager.getInstance(); 