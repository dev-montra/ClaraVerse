const { ipcMain } = require('electron');
const log = require('electron-log');
const { getAdaptiveHealthCheckManager } = require('./adaptiveHealthCheckManager.cjs');

/**
 * Activity Tracking for Adaptive Health Checks
 * Records user and service activity to inform adaptive battery management
 */

function setupActivityTracking() {
  const adaptiveManager = getAdaptiveHealthCheckManager();

  // Track user activity when they interact with any service
  const activityHandlers = [
    // N8N activity
    { pattern: 'n8n:', service: 'n8n' },
    { pattern: 'start-n8n', service: 'n8n' },
    { pattern: 'stop-n8n', service: 'n8n' },
    
    // ComfyUI activity  
    { pattern: 'comfyui:', service: 'comfyui' },
    { pattern: 'start-comfyui', service: 'comfyui' },
    { pattern: 'stop-comfyui', service: 'comfyui' },
    
    // Python backend activity
    { pattern: 'start-python', service: 'python' },
    { pattern: 'stop-python', service: 'python' },
    { pattern: 'chat:', service: 'python' },
    { pattern: 'rag:', service: 'python' },
    { pattern: 'tts:', service: 'python' },
    { pattern: 'stt:', service: 'python' },
    
    // Clara Core activity
    { pattern: 'claracore', service: 'claracore' },
    { pattern: 'model:', service: 'claracore' },
    { pattern: 'ollama:', service: 'claracore' }
  ];

  // Wrap IPC handler to track activity
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = function(channel, handler) {
    // Check if this channel should be tracked
    const activityHandler = activityHandlers.find(h => channel.includes(h.pattern));
    
    if (activityHandler) {
      // Wrap handler to record activity
      const wrappedHandler = async function(...args) {
        // Record user activity
        adaptiveManager.recordUserActivity();
        // Record service-specific activity
        adaptiveManager.recordServiceActivity(activityHandler.service);
        
        log.debug(`📊 Activity recorded: ${activityHandler.service} via ${channel}`);
        
        // Call original handler
        return handler(...args);
      };
      
      return originalHandle(channel, wrappedHandler);
    } else {
      // No tracking needed, use original handler
      return originalHandle(channel, handler);
    }
  };

  log.info('✅ Activity tracking enabled for adaptive health checks');
}

module.exports = { setupActivityTracking };

