const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { app } = require('electron');
const os = require('os');

/**
 * ClaraCore Service Manager
 * Manages the ClaraCore AI Engine binary service
 * Supports local, remote, and docker deployment modes
 */
class ClaraCoreService {
  constructor() {
    this.process = null;
    this.isRunning = false;
    this.startTime = null;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.lastError = null;
    this.isStarting = false; // Prevent concurrent start attempts
    this.isIntentionallyStopped = false; // Track intentional stops
    this.restartTimer = null; // Track auto-restart timer
  }

  /**
   * Get the platform-specific binary path
   */
  getBinaryPath() {
    const platform = os.platform();
    const arch = os.arch();

    let binaryName;

    if (platform === 'win32') {
      binaryName = 'claracore-windows-amd64.exe';
    } else if (platform === 'darwin') {
      binaryName = arch === 'arm64'
        ? 'claracore-darwin-arm64'
        : 'claracore-darwin-amd64';
    } else if (platform === 'linux') {
      binaryName = arch === 'arm64'
        ? 'claracore-linux-arm64'
        : 'claracore-linux-amd64';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Multiple paths to try (in order of preference)
    const pathsToTry = [];

    // 1. Production: electron app resources
    if (process.resourcesPath) {
      pathsToTry.push(path.join(process.resourcesPath, 'electron', 'claracore', binaryName));
      pathsToTry.push(path.join(process.resourcesPath, 'claracore', binaryName));
    }

    // 2. Development: relative to electron directory
    pathsToTry.push(path.join(__dirname, 'claracore', binaryName));

    // 3. Development: relative to project root
    const projectRoot = path.resolve(__dirname, '..');
    pathsToTry.push(path.join(projectRoot, 'electron', 'claracore', binaryName));
    pathsToTry.push(path.join(projectRoot, 'claracore', binaryName));

    // Check which path exists
    for (const tryPath of pathsToTry) {
      if (fs.existsSync(tryPath)) {
        log.info(`ClaraCore binary found at: ${tryPath}`);
        return tryPath;
      }
    }

    // If none found, log all tried paths for debugging
    log.error(`ClaraCore binary not found. Tried paths: ${pathsToTry.join(', ')}`);
    throw new Error(`ClaraCore binary not found. Tried ${pathsToTry.length} paths.`);
  }

  /**
   * Check if a port is in use
   */
  async isPortInUse(port) {
    const net = require('net');

    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true); // Port is in use
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(false); // Port is available
      });

      server.listen(port);
    });
  }

  /**
   * Check if ClaraCore is running on the port by hitting its API
   */
  async isClaraCoreRunningOnPort() {
    try {
      const http = require('http');

      return new Promise((resolve) => {
        const options = {
          hostname: 'localhost',
          port: 8091,
          path: '/health',
          method: 'GET',
          timeout: 2000
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            // If we get a response, assume it's ClaraCore
            resolve(true);
          });
        });

        req.on('error', () => {
          // Can't reach the service, probably not ClaraCore
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.end();
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Kill any existing ClaraCore process running on port 8091
   */
  async killExistingClaraCore() {
    try {
      log.info('Attempting to kill existing ClaraCore process on port 8091...');

      if (os.platform() === 'win32') {
        // Windows: Find PID using netstat and kill it
        const { execSync } = require('child_process');
        const netstatOutput = execSync('netstat -ano | findstr :8091 | findstr LISTENING', { encoding: 'utf8' });

        if (netstatOutput) {
          // Extract PID from netstat output
          const lines = netstatOutput.trim().split('\n');

          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];

            if (pid && !isNaN(pid)) {
              try {
                execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
                log.info(`✅ Killed existing ClaraCore process (PID: ${pid})`);

                // Wait a bit for the port to be released
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
              } catch (killError) {
                log.warn(`Failed to kill process ${pid}:`, killError.message);
              }
            }
          }
        }
      } else {
        // Unix-like systems: Use lsof
        const { execSync } = require('child_process');
        const lsofOutput = execSync('lsof -ti:8091', { encoding: 'utf8' }).trim();

        if (lsofOutput) {
          const pids = lsofOutput.split('\n').filter(pid => pid);
          for (const pid of pids) {
            try {
              execSync(`kill -9 ${pid}`, { encoding: 'utf8' });
              log.info(`✅ Killed existing ClaraCore process (PID: ${pid})`);

              // Wait a bit for the port to be released
              await new Promise(resolve => setTimeout(resolve, 1000));
              return true;
            } catch (killError) {
              log.warn(`Failed to kill process ${pid}:`, killError.message);
            }
          }
        }
      }

      return false;
    } catch (error) {
      log.warn('Error while trying to kill existing ClaraCore:', error.message);
      return false;
    }
  }

  /**
   * Start the ClaraCore service
   */
  async start() {
    if (this.isRunning) {
      log.warn('ClaraCore service is already running');
      return;
    }

    if (this.isStarting) {
      log.warn('ClaraCore service is already starting, skipping duplicate start attempt');
      return;
    }

    this.isStarting = true;
    this.isIntentionallyStopped = false;

    // Check if port 8091 is already in use
    const portInUse = await this.isPortInUse(8091);
    if (portInUse) {
      log.warn('⚠️ Port 8091 is already in use. Checking if it\'s ClaraCore...');

      // Check if it's ClaraCore running on the port
      const isClaraCore = await this.isClaraCoreRunningOnPort();

      if (isClaraCore) {
        log.info('🔄 Detected existing ClaraCore instance. Attempting to kill and restart...');
        const killed = await this.killExistingClaraCore();

        if (!killed) {
          throw new Error('❌ ClaraCore is already running on port 8091, but failed to kill the existing instance. Please manually stop it and try again.');
        }

        // Double-check the port is now free
        const stillInUse = await this.isPortInUse(8091);
        if (stillInUse) {
          throw new Error('❌ Port 8091 is still in use after killing the process. Please wait a moment and try again.');
        }

        log.info('✅ Successfully killed existing ClaraCore instance. Starting new instance...');
      } else {
        // Not ClaraCore - some other service is using the port
        throw new Error('❌ ClaraCore cannot start: Port 8091 is already in use by another service. Please free up the port and try again.');
      }
    }

    try {
      const binaryPath = this.getBinaryPath();
      const args = ['-listen', ':8091'];

      log.info(`Starting ClaraCore service: ${binaryPath} ${args.join(' ')}`);

      // Ensure binary has execute permissions on Unix-like systems
      if (os.platform() !== 'win32') {
        try {
          fs.chmodSync(binaryPath, '755');
          log.info('Set execute permissions on ClaraCore binary');
        } catch (chmodError) {
          log.warn('Failed to set execute permissions:', chmodError);
        }
      }

      // Spawn the ClaraCore process
      this.process = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true
      });

      this.isRunning = true;
      this.startTime = Date.now();
      this.restartAttempts = 0;

      // Handle process events
      this.process.on('spawn', () => {
        log.info('ClaraCore service spawned successfully');
        log.info(`ClaraCore PID: ${this.process.pid}`);
      });

      this.process.on('error', (error) => {
        log.error('ClaraCore service error:', error);
        this.isRunning = false;
        this.process = null;
      });

      this.process.on('exit', (code, signal) => {
        log.info(`ClaraCore service exited with code ${code}, signal ${signal}`);
        this.isRunning = false;
        this.process = null;
        this.isStarting = false;

        // Don't auto-restart if it was intentionally stopped
        if (this.isIntentionallyStopped) {
          log.info('ClaraCore was intentionally stopped, skipping auto-restart');
          return;
        }

        // Check if the error was due to port binding - don't auto-restart in this case
        const isPortBindingError = this.lastError && (
          this.lastError.includes('bind:') ||
          this.lastError.includes('address already in use') ||
          this.lastError.includes('Only one usage of each socket address')
        );

        if (isPortBindingError) {
          log.error('❌ ClaraCore failed to start due to port 8091 being in use. Auto-restart disabled. Please manually stop any conflicting services.');
          this.restartAttempts = this.maxRestartAttempts; // Prevent further restart attempts
          return;
        }

        // Auto-restart if it wasn't a clean shutdown
        if (code !== 0 && code !== null && this.restartAttempts < this.maxRestartAttempts) {
          this.restartAttempts++;
          log.info(`Auto-restarting ClaraCore service (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);
          // Store the timer so it can be cleared if stop() is called
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.start();
          }, 5000); // Wait 5 seconds before restart
        }
      });

      // Handle stdout
      this.process.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          log.info(`[ClaraCore] ${output}`);
        }
      });

      // Handle stderr
      this.process.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          log.error(`[ClaraCore Error] ${output}`);
          // Track last error for detecting port binding issues
          this.lastError = output;
        }
      });

      // Wait a bit to ensure the service starts properly
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify the service is healthy
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        this.isStarting = false;
        throw new Error('ClaraCore service failed health check after startup');
      }

      log.info('ClaraCore service started successfully and is healthy');
      this.isStarting = false; // Clear starting flag on success

    } catch (error) {
      log.error('Failed to start ClaraCore service:', error);
      this.isRunning = false;
      this.process = null;
      this.isStarting = false; // Clear starting flag on error
      throw error;
    }
  }

  /**
   * Stop the ClaraCore service
   */
  async stop() {
    // Always set intentionally stopped flag FIRST, before any checks
    this.isIntentionallyStopped = true;

    // Clear any pending auto-restart timer
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
      log.info('Cleared pending auto-restart timer');
    }

    try {
      log.info('Stopping ClaraCore service...');

      // ALWAYS try to kill any process on port 8091, regardless of internal state
      // This ensures we actually stop ClaraCore even if our state tracking is wrong
      const portInUse = await this.isPortInUse(8091);

      if (!portInUse && !this.isRunning && !this.process) {
        log.info('ClaraCore service is not running (port 8091 is free)');
        this.isRunning = false;
        this.process = null;
        return;
      }

      if (portInUse) {
        log.info('Port 8091 is in use, attempting to kill process...');
      }

      // On Windows, SIGTERM doesn't work reliably, so force kill
      if (os.platform() === 'win32') {
        const killed = await this.killExistingClaraCore();

        // Wait a moment for the process to fully terminate
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the port is actually free now
        const stillRunning = await this.isPortInUse(8091);

        if (stillRunning) {
          log.warn('⚠️ Port 8091 still in use after first kill attempt, retrying...');
          // Try one more time
          await this.killExistingClaraCore();
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Final check
          const finalCheck = await this.isPortInUse(8091);

          if (finalCheck) {
            log.error('❌ Failed to free port 8091 even after multiple kill attempts');
            throw new Error('Failed to stop ClaraCore - port 8091 still in use');
          }
        }

        this.isRunning = false;
        this.process = null;
        log.info('✅ ClaraCore service stopped successfully (verified port is free)');
        return;
      }

      // For Unix systems or if killExistingClaraCore failed, try process.kill
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          log.warn('ClaraCore service did not stop gracefully, force killing...');
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          this.isRunning = false;
          this.process = null;
          resolve();
        }, 5000); // 5 second timeout

        if (this.process) {
          this.process.on('exit', () => {
            clearTimeout(timeout);
            this.isRunning = false;
            this.process = null;
            log.info('ClaraCore service stopped successfully');
            resolve();
          });

          // Send SIGTERM for graceful shutdown
          this.process.kill('SIGTERM');
        } else {
          clearTimeout(timeout);
          this.isRunning = false;
          this.process = null;
          resolve();
        }
      });

    } catch (error) {
      log.error('❌ Error stopping ClaraCore service:', error);
      this.isRunning = false;
      this.process = null;
      throw error;
    }
  }

  /**
   * Restart the ClaraCore service
   */
  async restart() {
    log.info('Restarting ClaraCore service...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.start();
  }

  /**
   * Check if the service is healthy
   */
  async checkHealth() {
    const http = require('http');

    return new Promise((resolve) => {
      const req = http.get('http://localhost:8091/health', (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pid: this.process?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      restartAttempts: this.restartAttempts
    };
  }
}

module.exports = ClaraCoreService;
