const { ipcMain } = require('electron');
const RemoteServerService = require('./remoteServerService.cjs');
const log = require('electron-log');

const remoteServerService = new RemoteServerService();

/**
 * Setup IPC handlers for remote server management
 * @param {Electron.BrowserWindow} mainWindow - The main window
 * @param {Function} stopLocalServicesCallback - Callback to stop local services
 */
function setupRemoteServerIPC(mainWindow, stopLocalServicesCallback = null) {
  log.info('[RemoteServerIPC] Setting up IPC handlers');

  // Test SSH connection
  ipcMain.handle('remote-server:test-connection', async (event, config) => {
    log.info('[RemoteServerIPC] Testing connection to:', config.host);
    try {
      const result = await remoteServerService.testConnection(config);
      return result;
    } catch (error) {
      log.error('[RemoteServerIPC] Connection test error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Deploy backend to remote server
  ipcMain.handle('remote-server:deploy', async (event, config) => {
    log.info('[RemoteServerIPC] Starting deployment to:', config.host);

    try {
      // Stop all local services before deploying to remote
      if (stopLocalServicesCallback) {
        log.info('[RemoteServerIPC] 🛑 Stopping all local services before remote deployment...');
        
        const stopResult = await stopLocalServicesCallback();
        
        if (stopResult.stopped.length > 0) {
          log.info(`[RemoteServerIPC] ✅ Stopped: ${stopResult.stopped.join(', ')}`);
        }
        if (stopResult.errors.length > 0) {
          log.warn(`[RemoteServerIPC] ⚠️ Some services had errors during stop: ${JSON.stringify(stopResult.errors)}`);
        }
      }
      
      const webContents = event.sender;
      const result = await remoteServerService.deploy(config, webContents);
      
      if (result.success) {
        log.info('[RemoteServerIPC] ✅ Successfully deployed to remote server');
      }
      
      return result;
    } catch (error) {
      log.error('[RemoteServerIPC] Deployment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Stop a service
  ipcMain.handle('remote-server:stop-service', async (event, { config, serviceName }) => {
    log.info('[RemoteServerIPC] Stopping service:', serviceName);

    try {
      const result = await remoteServerService.stopService(config, serviceName);
      return result;
    } catch (error) {
      log.error('[RemoteServerIPC] Stop service error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  log.info('[RemoteServerIPC] IPC handlers registered');
}

module.exports = { setupRemoteServerIPC };
