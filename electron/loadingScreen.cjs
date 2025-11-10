const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

class LoadingScreen {
  constructor() {
    const isDev = process.env.NODE_ENV === 'development';
    
    // Check fullscreen startup preference
    let shouldStartFullscreen = false;
    try {
      const userDataPath = app.getPath('userData');
      const startupSettingsPath = path.join(userDataPath, 'clara-startup-settings.json');
      const legacySettingsPath = path.join(userDataPath, 'clara-settings.json');
      const veryLegacySettingsPath = path.join(userDataPath, 'settings.json');

      if (fs.existsSync(startupSettingsPath)) {
        const startupSettings = JSON.parse(fs.readFileSync(startupSettingsPath, 'utf8'));
        shouldStartFullscreen = !!startupSettings.startFullscreen;
      } else if (fs.existsSync(legacySettingsPath)) {
        const legacySettings = JSON.parse(fs.readFileSync(legacySettingsPath, 'utf8'));
        const legacyStartup = legacySettings.startup || {};
        shouldStartFullscreen = legacyStartup.startFullscreen ?? legacySettings.fullscreen_startup ?? false;
      } else if (fs.existsSync(veryLegacySettingsPath)) {
        const veryLegacySettings = JSON.parse(fs.readFileSync(veryLegacySettingsPath, 'utf8'));
        shouldStartFullscreen = veryLegacySettings.startup?.startFullscreen ?? veryLegacySettings.fullscreen_startup ?? false;
      }
    } catch (error) {
      console.error('Error reading fullscreen startup preference:', error);
    }
    
    this.window = new BrowserWindow({
      fullscreen: shouldStartFullscreen,
      frame: false,
      transparent: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      skipTaskbar: true,
      resizable: false,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#667eea'
    });

    // Show window when ready to prevent flash
    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    // Log any errors
    this.window.webContents.on('crashed', (e) => {
      console.error('Loading screen crashed:', e);
    });

    this.window.webContents.on('did-fail-load', (event, code, description) => {
      console.error('Failed to load loading screen:', code, description);
    });

    const htmlPath = isDev 
      ? path.join(__dirname, 'loading.html')
      : path.join(app.getAppPath(), 'electron', 'loading.html');

    console.log('Loading screen from:', htmlPath);
    this.window.loadFile(htmlPath);
  }

  setStatus(message, type = 'info', progress = null) {
    if (!this.window) return;
    
    const data = {
      message: message,
      type: type,
      progress: progress,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[Loading] Setting status:`, data);
    this.window.webContents.send('status', data);
  }

  // Notify that main window is ready
  notifyMainWindowReady() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('main-window-ready');
    }
  }

  // Hide the loading screen
  hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('hide-loading');
    }
  }

  // Set always on top property
  setAlwaysOnTop(alwaysOnTop) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setAlwaysOnTop(alwaysOnTop);
    }
  }

  // Close the loading screen
  close() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
  }

  // Check if window exists and is not destroyed
  isValid() {
    return this.window && !this.window.isDestroyed();
  }
}

module.exports = LoadingScreen; 