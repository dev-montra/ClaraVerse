const { powerMonitor } = require('electron');
const log = require('electron-log');

/**
 * Adaptive Health Check Manager
 * Intelligently adjusts health check intervals based on system activity and service usage
 * Dramatically reduces battery drain during idle periods
 */
class AdaptiveHealthCheckManager {
  constructor() {
    // Health check intervals (in milliseconds)
    this.intervals = {
      ACTIVE: 30000,           // 30 seconds - when actively using services
      LIGHT_IDLE: 2 * 60000,   // 2 minutes - light idle (< 5 min)
      MEDIUM_IDLE: 5 * 60000,  // 5 minutes - medium idle (5-15 min)
      DEEP_IDLE: 10 * 60000,   // 10 minutes - deep idle (15-30 min)
      SLEEP: 30 * 60000        // 30 minutes - extended idle (> 30 min)
    };

    // Activity tracking
    this.lastUserActivity = Date.now();
    this.lastServiceActivity = new Map(); // Track per-service activity
    this.systemIdleTime = 0;
    this.currentMode = 'ACTIVE';
    
    // Service activity thresholds (minutes)
    this.thresholds = {
      LIGHT_IDLE: 5,
      MEDIUM_IDLE: 15,
      DEEP_IDLE: 30
    };

    // Monitoring state
    this.isMonitoring = false;
    this.activityCheckInterval = null;
    
    // Battery state awareness
    this.isOnBattery = false;
    this.batteryLevel = 100;
    
    log.info('🔋 Adaptive Health Check Manager initialized');
  }

  /**
   * Start monitoring system activity and battery state
   */
  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    
    // Monitor system idle state
    this.activityCheckInterval = setInterval(() => {
      this.checkSystemIdle();
    }, 30000); // Check every 30 seconds

    // Monitor battery state if available
    if (powerMonitor) {
      try {
        // Check if on battery power
        this.isOnBattery = powerMonitor.isOnBatteryPower?.() || false;
        
        // Listen for power state changes
        powerMonitor.on?.('on-battery', () => {
          this.isOnBattery = true;
          log.info('🔋 Switched to battery power - enabling aggressive power saving');
          this.updateHealthCheckMode();
        });

        powerMonitor.on?.('on-ac', () => {
          this.isOnBattery = false;
          log.info('🔌 Plugged in - using standard health check intervals');
          this.updateHealthCheckMode();
        });

        // Monitor system resume from sleep
        powerMonitor.on?.('resume', () => {
          log.info('💤 System resumed from sleep - resetting activity timers');
          this.recordUserActivity();
        });

        // Monitor system suspend
        powerMonitor.on?.('suspend', () => {
          log.info('💤 System suspending - pausing health checks');
        });

        // Monitor for user activity (keyboard/mouse)
        powerMonitor.on?.('user-did-become-active', () => {
          this.recordUserActivity();
        });

        log.info('✅ Battery and power monitoring enabled');
      } catch (error) {
        log.warn('⚠️ Power monitoring not available:', error.message);
      }
    }

    log.info('✅ Adaptive health check monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
    this.isMonitoring = false;
    log.info('🛑 Adaptive health check monitoring stopped');
  }

  /**
   * Check system idle time
   */
  async checkSystemIdle() {
    try {
      if (powerMonitor && powerMonitor.getSystemIdleTime) {
        this.systemIdleTime = powerMonitor.getSystemIdleTime();
        
        // If user becomes active, record it
        if (this.systemIdleTime < 10) { // Less than 10 seconds idle
          this.recordUserActivity();
        }
      }
      
      this.updateHealthCheckMode();
    } catch (error) {
      log.debug('Could not get system idle time:', error.message);
    }
  }

  /**
   * Record user activity
   */
  recordUserActivity() {
    const now = Date.now();
    const wasIdle = this.currentMode !== 'ACTIVE';
    
    this.lastUserActivity = now;
    this.updateHealthCheckMode();

    if (wasIdle) {
      log.info('👤 User activity detected - returning to active monitoring mode');
    }
  }

  /**
   * Record service activity (service was used)
   */
  recordServiceActivity(serviceName) {
    this.lastServiceActivity.set(serviceName, Date.now());
    
    // Any service activity counts as user activity
    this.recordUserActivity();
    
    log.debug(`📊 Service activity recorded: ${serviceName}`);
  }

  /**
   * Get time since last activity for a service
   */
  getServiceIdleTime(serviceName) {
    const lastActivity = this.lastServiceActivity.get(serviceName);
    if (!lastActivity) return Infinity;
    
    return Date.now() - lastActivity;
  }

  /**
   * Update health check mode based on activity
   */
  updateHealthCheckMode() {
    const minutesSinceActivity = (Date.now() - this.lastUserActivity) / 60000;
    let newMode = 'ACTIVE';

    // Determine mode based on idle time
    if (minutesSinceActivity > this.thresholds.DEEP_IDLE) {
      newMode = 'SLEEP';
    } else if (minutesSinceActivity > this.thresholds.MEDIUM_IDLE) {
      newMode = 'DEEP_IDLE';
    } else if (minutesSinceActivity > this.thresholds.LIGHT_IDLE) {
      newMode = 'MEDIUM_IDLE';
    } else if (minutesSinceActivity > 1) {
      newMode = 'LIGHT_IDLE';
    }

    // Be more aggressive on battery power
    if (this.isOnBattery) {
      // Accelerate idle mode progression on battery
      if (minutesSinceActivity > 10 && newMode === 'LIGHT_IDLE') {
        newMode = 'MEDIUM_IDLE';
      } else if (minutesSinceActivity > 20 && newMode === 'MEDIUM_IDLE') {
        newMode = 'DEEP_IDLE';
      }
    }

    // Log mode changes
    if (newMode !== this.currentMode) {
      const interval = this.intervals[newMode];
      log.info(`🔄 Health check mode: ${this.currentMode} → ${newMode} (interval: ${interval / 1000}s)`);
      this.currentMode = newMode;
    }
  }

  /**
   * Get current health check interval for a service
   */
  getHealthCheckInterval(serviceName, baseInterval = 30000) {
    // If service was used recently, use more frequent checks
    const serviceIdleTime = this.getServiceIdleTime(serviceName);
    const serviceIdleMinutes = serviceIdleTime / 60000;

    // If service is actively being used (< 2 minutes), use base interval
    if (serviceIdleMinutes < 2) {
      return baseInterval;
    }

    // Otherwise, use adaptive interval based on system-wide activity
    const adaptiveInterval = this.intervals[this.currentMode];
    
    // On battery, use longer intervals
    if (this.isOnBattery) {
      return Math.max(adaptiveInterval, baseInterval * 2);
    }

    return Math.max(adaptiveInterval, baseInterval);
  }

  /**
   * Should we skip health check? (during very deep idle)
   */
  shouldSkipHealthCheck(serviceName) {
    // Never skip if actively using the service
    const serviceIdleMinutes = this.getServiceIdleTime(serviceName) / 60000;
    if (serviceIdleMinutes < 2) {
      return false;
    }

    // In SLEEP mode on battery, only check critical services
    if (this.currentMode === 'SLEEP' && this.isOnBattery) {
      // Define critical services that always need checking
      const criticalServices = ['claracore'];
      return !criticalServices.includes(serviceName);
    }

    return false;
  }

  /**
   * Get battery-aware configuration
   */
  getBatteryAwareConfig() {
    return {
      isOnBattery: this.isOnBattery,
      currentMode: this.currentMode,
      minutesIdle: (Date.now() - this.lastUserActivity) / 60000,
      recommendedInterval: this.intervals[this.currentMode],
      aggressiveSaving: this.isOnBattery && this.currentMode !== 'ACTIVE'
    };
  }

  /**
   * Get status for logging
   */
  getStatus() {
    return {
      mode: this.currentMode,
      isOnBattery: this.isOnBattery,
      batteryLevel: this.batteryLevel,
      minutesSinceActivity: Math.round((Date.now() - this.lastUserActivity) / 60000),
      systemIdleTime: this.systemIdleTime,
      currentInterval: this.intervals[this.currentMode],
      activeServices: this.lastServiceActivity.size
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getAdaptiveHealthCheckManager: () => {
    if (!instance) {
      instance = new AdaptiveHealthCheckManager();
    }
    return instance;
  }
};

