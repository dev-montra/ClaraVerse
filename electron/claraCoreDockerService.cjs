const Docker = require('dockerode');
const { execSync } = require('child_process');
const log = require('electron-log');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * ClaraCore Docker Service Manager
 * Manages ClaraCore in Docker with GPU detection and acceleration support
 */
class ClaraCoreDockerService {
  constructor() {
    this.docker = new Docker();
    this.containerName = 'clara_core';
    this.isRunning = false;
    this.gpuType = null;
    this.detectedImage = null;
  }

  /**
   * Detect GPU type and determine appropriate Docker image
   */
  async detectGPU() {
    const platform = os.platform();
    
    log.info('🔍 Detecting GPU for ClaraCore Docker...');

    try {
      // Check for NVIDIA GPU
      if (platform === 'win32') {
        try {
          const nvidiaCheck = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          
          if (nvidiaCheck && nvidiaCheck.trim()) {
            log.info(`✅ NVIDIA GPU detected: ${nvidiaCheck.trim()}`);
            this.gpuType = 'cuda';
            this.detectedImage = 'clara17verse/claracore:cuda';
            return { type: 'cuda', name: nvidiaCheck.trim() };
          }
        } catch (error) {
          log.info('NVIDIA GPU not detected or nvidia-smi not available');
        }
      } else if (platform === 'linux') {
        // Linux: Check for NVIDIA
        try {
          const nvidiaCheck = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          
          if (nvidiaCheck && nvidiaCheck.trim()) {
            log.info(`✅ NVIDIA GPU detected: ${nvidiaCheck.trim()}`);
            this.gpuType = 'cuda';
            this.detectedImage = 'clara17verse/claracore:cuda';
            return { type: 'cuda', name: nvidiaCheck.trim() };
          }
        } catch (error) {
          log.info('NVIDIA GPU not detected');
        }

        // Linux: Check for AMD ROCm
        try {
          const rocmCheck = execSync('rocm-smi --showproductname', {
            encoding: 'utf8',
            timeout: 5000
          });

          if (rocmCheck && rocmCheck.includes('GPU')) {
            log.info(`✅ AMD ROCm GPU detected`);
            this.gpuType = 'rocm';
            this.detectedImage = 'clara17verse/claracore:rocm';
            return { type: 'rocm', name: 'AMD GPU (ROCm)' };
          }
        } catch (error) {
          log.info('AMD ROCm GPU not detected');
        }
      } else if (platform === 'win32') {
        // Windows: Check for AMD GPU via WSL2
        // ROCm on Windows requires Docker Desktop in WSL2 mode + AMD Radeon Software 25.8.1+
        try {
          const wslCheck = execSync('wsl -l -v', {
            encoding: 'utf8',
            timeout: 5000
          });

          // Check if WSL2 is available
          if (wslCheck && wslCheck.includes('Version 2')) {
            // Try to detect AMD GPU through WSL
            try {
              const amdCheck = execSync('wsl lspci | findstr "AMD"', {
                encoding: 'utf8',
                timeout: 5000
              });

              if (amdCheck && (amdCheck.includes('Radeon') || amdCheck.includes('AMD'))) {
                log.info(`✅ AMD GPU detected in WSL2 - ROCm may be available`);
                log.warn('⚠️ ROCm on Windows requires: Windows 11 + AMD Radeon Software 25.8.1+ + WSL2');
                log.warn('⚠️ Docker Desktop must be in WSL2 mode (not Hyper-V)');
                // Note: We don't auto-select ROCm on Windows due to complexity
                // User should manually select it if they have it properly configured
              }
            } catch (amdError) {
              log.info('AMD GPU not detected in WSL2');
            }
          }
        } catch (error) {
          log.info('WSL2 not available or not configured');
        }
      }

      // Check for Vulkan support (fallback for AMD/Intel on Linux)
      if (platform === 'linux') {
        try {
          const vulkanCheck = execSync('vulkaninfo --summary', {
            encoding: 'utf8',
            timeout: 5000
          });

          if (vulkanCheck && vulkanCheck.includes('Vulkan')) {
            log.info(`✅ Vulkan GPU support detected`);
            this.gpuType = 'vulkan';
            this.detectedImage = 'clara17verse/claracore:vulkan';
            return { type: 'vulkan', name: 'Vulkan-compatible GPU' };
          }
        } catch (error) {
          log.info('Vulkan support not detected');
        }
      }

      // Fallback to CPU
      log.info('⚠️ No GPU detected, using CPU mode');
      this.gpuType = 'cpu';
      this.detectedImage = 'clara17verse/claracore:cpu';
      return { type: 'cpu', name: 'CPU Only' };

    } catch (error) {
      log.error('Error during GPU detection:', error);
      this.gpuType = 'cpu';
      this.detectedImage = 'clara17verse/claracore:cpu';
      return { type: 'cpu', name: 'CPU Only (detection failed)' };
    }
  }

  /**
   * Ensure Docker is running
   */
  async ensureDockerRunning() {
    try {
      await this.docker.ping();
      log.info('✅ Docker daemon is running');
      return true;
    } catch (error) {
      log.error('❌ Docker daemon is not running:', error.message);

      // On Windows, provide specific instructions
      if (os.platform() === 'win32') {
        throw new Error(
          'Docker Desktop is not running or not responding.\n\n' +
          'Please try:\n' +
          '1. Open Docker Desktop from Start Menu\n' +
          '2. Wait for Docker to fully start (whale icon in system tray should be steady)\n' +
          '3. If Docker is already running, restart it: Right-click whale icon → Restart\n' +
          '4. If that fails, completely quit Docker Desktop and start it again\n\n' +
          'Error: ' + error.message
        );
      }

      throw new Error('Docker is not running. Please start Docker Desktop and try again.');
    }
  }

  /**
   * Check if container exists
   */
  async containerExists() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.some(c => c.Names.includes(`/${this.containerName}`));
    } catch (error) {
      log.error('Error checking container existence:', error);
      return false;
    }
  }

  /**
   * Get container instance
   */
  async getContainer() {
    return this.docker.getContainer(this.containerName);
  }

  /**
   * Pull Docker image
   */
  async pullImage(imageName) {
    log.info(`🔽 Pulling Docker image: ${imageName}`);
    
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err, stream) => {
        if (err) {
          log.error(`Failed to pull image ${imageName}:`, err);
          return reject(err);
        }

        this.docker.modem.followProgress(stream, 
          (err, output) => {
            if (err) {
              log.error('Error during image pull:', err);
              return reject(err);
            }
            log.info(`✅ Successfully pulled image: ${imageName}`);
            resolve(output);
          },
          (event) => {
            // Progress logging
            if (event.status === 'Downloading' || event.status === 'Extracting') {
              log.info(`${event.status}: ${event.progress || ''}`);
            }
          }
        );
      });
    });
  }

  /**
   * Check if port 8091 is in use and kill the process
   */
  async killProcessOnPort8091() {
    const platform = os.platform();
    
    try {
      log.info('🔍 Checking if port 8091 is in use...');
      
      if (platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          const netstatOutput = execSync('netstat -ano | findstr :8091 | findstr LISTENING', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          
          if (netstatOutput) {
            const lines = netstatOutput.trim().split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              
              if (pid && !isNaN(pid)) {
                log.warn(`⚠️ Port 8091 is in use by process ${pid}. Attempting to kill...`);
                try {
                  execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8', timeout: 5000 });
                  log.info(`✅ Killed process ${pid} on port 8091`);
                  // Wait for port to be released
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (killError) {
                  log.error(`❌ Failed to kill process ${pid}:`, killError.message);
                }
              }
            }
          } else {
            log.info('✅ Port 8091 is free');
          }
        } catch (error) {
          // No process on port, which is good
          log.info('✅ Port 8091 is free');
        }
      } else {
        // Linux/Mac: Use lsof
        const { execSync } = require('child_process');
        try {
          const lsofOutput = execSync('lsof -ti:8091', { encoding: 'utf8', timeout: 5000 }).trim();
          
          if (lsofOutput) {
            const pids = lsofOutput.split('\n').filter(pid => pid);
            for (const pid of pids) {
              log.warn(`⚠️ Port 8091 is in use by process ${pid}. Attempting to kill...`);
              try {
                execSync(`kill -9 ${pid}`, { encoding: 'utf8', timeout: 5000 });
                log.info(`✅ Killed process ${pid} on port 8091`);
                // Wait for port to be released
                await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (killError) {
                log.error(`❌ Failed to kill process ${pid}:`, killError.message);
              }
            }
          } else {
            log.info('✅ Port 8091 is free');
          }
        } catch (error) {
          // No process on port, which is good
          log.info('✅ Port 8091 is free');
        }
      }
    } catch (error) {
      log.warn('Error checking port 8091:', error.message);
    }
  }

  /**
   * Cleanup stuck or corrupted containers (Windows-specific)
   */
  async cleanupStuckContainers() {
    try {
      log.info('🔍 Checking for stuck containers...');

      const containers = await this.docker.listContainers({ all: true });
      const claraCoreContainers = containers.filter(c =>
        c.Names.some(name => name.includes('clara_core'))
      );

      for (const containerInfo of claraCoreContainers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          const info = await container.inspect();

          // Check if container is in a problematic state
          if (info.State.Status === 'dead' ||
              info.State.Status === 'exited' && info.State.ExitCode !== 0 ||
              info.State.Error) {
            log.warn(`⚠️ Found stuck container ${containerInfo.Names[0]} in state: ${info.State.Status}`);

            // Try to remove it
            try {
              if (info.State.Running) {
                await container.stop({ t: 5 });
              }
              await container.remove({ force: true });
              log.info(`✅ Cleaned up stuck container ${containerInfo.Names[0]}`);
            } catch (removeError) {
              log.error(`Failed to remove stuck container: ${removeError.message}`);
            }
          }
        } catch (inspectError) {
          log.error(`Error inspecting container: ${inspectError.message}`);
        }
      }
    } catch (error) {
      log.warn('Error during cleanup check:', error.message);
      // Don't throw - this is a best-effort cleanup
    }
  }

  /**
   * Create and start Clara Core container
   */
  async start(options = {}) {
    try {
      await this.ensureDockerRunning();

      // Kill any process using port 8091 (including local ClaraCore binary)
      await this.killProcessOnPort8091();

      // On Windows, check if there are any stuck/corrupted containers and clean them
      if (os.platform() === 'win32') {
        await this.cleanupStuckContainers();
      }

      // Auto-detect GPU if not specified
      let gpuInfo;
      if (!options.gpuType) {
        gpuInfo = await this.detectGPU();
        log.info(`Auto-detected GPU: ${gpuInfo.type} - ${gpuInfo.name}`);
      } else {
        this.gpuType = options.gpuType;
        this.detectedImage = `clara17verse/claracore:${options.gpuType}`;
        gpuInfo = { type: this.gpuType, name: `Manual: ${this.gpuType}` };
      }

      // Check if container already exists
      const exists = await this.containerExists();
      
      if (exists) {
        log.info('Container exists, checking if it\'s running...');
        const container = await this.getContainer();
        const info = await container.inspect();
        
        if (info.State.Running) {
          log.info('✅ ClaraCore container is already running');
          this.isRunning = true;
          return { success: true, message: 'Container already running', gpuType: this.gpuType };
        } else {
          log.info('Starting existing container...');
          await container.start();
          this.isRunning = true;
          return { success: true, message: 'Container started', gpuType: this.gpuType };
        }
      }

      // Pull image if not present
      const images = await this.docker.listImages();
      const imageExists = images.some(img => 
        img.RepoTags && img.RepoTags.includes(this.detectedImage)
      );

      if (!imageExists) {
        log.info(`Image ${this.detectedImage} not found locally, pulling...`);
        await this.pullImage(this.detectedImage);
      }

      // Base container configuration
      // Container runs on port 5890 internally, mapped to host port 8091
      // Only need a single volume for downloads (models are managed internally)
      const containerConfig = {
        Image: this.detectedImage,
        name: this.containerName,
        Hostname: 'clara-core',
        ExposedPorts: {
          '5890/tcp': {}
        },
        Env: [
          'NODE_ENV=production',
          'CLARA_PORT=5890'
        ],
        HostConfig: {
          PortBindings: {
            '5890/tcp': [{ HostPort: '8091' }]
          },
          // Use named volume for downloads persistence
          Binds: [
            'claracore:/app/downloads'
          ],
          RestartPolicy: {
            Name: 'unless-stopped'
          }
        }
      };

      // Add GPU-specific configurations
      if (this.gpuType === 'cuda') {
        containerConfig.Env.push('NVIDIA_VISIBLE_DEVICES=all');
        containerConfig.Env.push('NVIDIA_DRIVER_CAPABILITIES=compute,utility');

        // Platform-specific GPU configuration
        // Windows: Use Runtime property (DeviceRequests causes Docker daemon crashes on Windows)
        // Linux: Use DeviceRequests for better compatibility
        if (os.platform() === 'win32') {
          containerConfig.HostConfig.Runtime = 'nvidia';
        } else {
          // Linux: Use modern DeviceRequests API
          containerConfig.HostConfig.DeviceRequests = [{
            Driver: 'nvidia',
            Count: -1, // All GPUs
            Capabilities: [['gpu', 'compute', 'utility']]
          }];
        }
      } else if (this.gpuType === 'rocm') {
        // ROCm works on Windows ONLY through WSL2
        // Docker Desktop must be running in WSL2 mode (not Hyper-V)
        if (os.platform() === 'win32') {
          log.warn('⚠️ ROCm on Windows requires Docker Desktop in WSL2 mode');
          log.warn('Ensure: Windows 11 + AMD Radeon Software 25.8.1+ + WSL2 with Ubuntu');
        }

        containerConfig.HostConfig.Devices = [
          { PathOnHost: '/dev/kfd', PathInContainer: '/dev/kfd', CgroupPermissions: 'rwm' },
          { PathOnHost: '/dev/dri', PathInContainer: '/dev/dri', CgroupPermissions: 'rwm' }
        ];
        containerConfig.Env.push('HSA_OVERRIDE_GFX_VERSION=10.3.0');
      } else if (this.gpuType === 'vulkan') {
        containerConfig.HostConfig.Devices = [
          { PathOnHost: '/dev/dri', PathInContainer: '/dev/dri', CgroupPermissions: 'rwm' }
        ];
        containerConfig.Env.push('VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json');
      }

      log.info('Creating ClaraCore container with config:', JSON.stringify(containerConfig, null, 2));

      // Create and start container
      let container;
      try {
        container = await this.docker.createContainer(containerConfig);
      } catch (createError) {
        // If CUDA/GPU creation fails on Windows, fall back to CPU mode
        if (this.gpuType === 'cuda' && os.platform() === 'win32' &&
            (createError.message.includes('runtime') || createError.message.includes('nvidia') || createError.message.includes('gpu'))) {
          log.warn('⚠️ Failed to create container with GPU support, falling back to CPU mode');
          log.warn('GPU Error:', createError.message);

          // Retry with CPU image
          this.gpuType = 'cpu';
          this.detectedImage = 'clara17verse/claracore:cpu';
          containerConfig.Image = this.detectedImage;

          // Remove GPU configurations
          delete containerConfig.HostConfig.Runtime;
          delete containerConfig.HostConfig.DeviceRequests;
          containerConfig.Env = containerConfig.Env.filter(env =>
            !env.startsWith('NVIDIA_')
          );

          log.info('Retrying with CPU configuration...');
          container = await this.docker.createContainer(containerConfig);
        } else {
          throw createError;
        }
      }

      await container.start();

      log.info('✅ ClaraCore container created and started successfully');
      this.isRunning = true;

      // Wait for service to be ready
      await this.waitForHealthy();

      return { 
        success: true, 
        message: 'ClaraCore started in Docker', 
        gpuType: this.gpuType,
        image: this.detectedImage
      };

    } catch (error) {
      log.error('❌ Failed to start ClaraCore Docker container:', error);
      this.isRunning = false;
      
      // Provide user-friendly error message for port conflicts
      if (error.message && error.message.includes('port') && error.message.includes('8091')) {
        const friendlyError = new Error(
          'Port 8091 is still in use. Please:\n' +
          '1. Stop any running ClaraCore instances (Local mode)\n' +
          '2. Check Task Manager for processes using port 8091\n' +
          '3. Try restarting the application'
        );
        friendlyError.originalError = error;
        throw friendlyError;
      }
      
      throw error;
    }
  }

  /**
   * Stop Clara Core container
   */
  async stop() {
    try {
      const exists = await this.containerExists();
      
      if (!exists) {
        log.info('Container does not exist, nothing to stop');
        this.isRunning = false;
        return { success: true, message: 'Container not found' };
      }

      const container = await this.getContainer();
      const info = await container.inspect();

      if (info.State.Running) {
        log.info('Stopping ClaraCore container...');
        await container.stop({ t: 10 }); // 10 second graceful shutdown
        log.info('✅ ClaraCore container stopped');
      } else {
        log.info('Container is not running');
      }

      this.isRunning = false;
      return { success: true, message: 'Container stopped' };

    } catch (error) {
      log.error('❌ Failed to stop ClaraCore container:', error);
      throw error;
    }
  }

  /**
   * Restart Clara Core container
   */
  async restart() {
    log.info('Restarting ClaraCore container...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return await this.start();
  }

  /**
   * Remove Clara Core container
   */
  async remove() {
    try {
      const exists = await this.containerExists();
      
      if (!exists) {
        log.info('Container does not exist, nothing to remove');
        return { success: true, message: 'Container not found' };
      }

      const container = await this.getContainer();
      const info = await container.inspect();

      // Stop if running
      if (info.State.Running) {
        await container.stop({ t: 10 });
      }

      // Remove container
      await container.remove();
      log.info('✅ ClaraCore container removed');

      this.isRunning = false;
      return { success: true, message: 'Container removed' };

    } catch (error) {
      log.error('❌ Failed to remove ClaraCore container:', error);
      throw error;
    }
  }

  /**
   * Wait for container to be healthy
   */
  async waitForHealthy(maxAttempts = 30, interval = 2000) {
    const http = require('http');
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const isHealthy = await new Promise((resolve) => {
          const req = http.get('http://localhost:8091/health', (res) => {
            resolve(res.statusCode === 200);
          });
          
          req.on('error', () => resolve(false));
          req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
          });
        });

        if (isHealthy) {
          log.info('✅ ClaraCore is healthy and ready');
          return true;
        }
      } catch (error) {
        // Ignore errors during health check attempts
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    log.warn('⚠️ ClaraCore health check timeout, but container is running');
    return false;
  }

  /**
   * Check container health
   */
  async checkHealth() {
    const http = require('http');
    
    return new Promise((resolve) => {
      const req = http.get('http://localhost:8091/health', (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Get container status
   */
  async getStatus() {
    try {
      const exists = await this.containerExists();
      
      if (!exists) {
        return {
          exists: false,
          running: false,
          gpuType: this.gpuType,
          image: this.detectedImage
        };
      }

      const container = await this.getContainer();
      const info = await container.inspect();

      return {
        exists: true,
        running: info.State.Running,
        status: info.State.Status,
        started: info.State.StartedAt,
        gpuType: this.gpuType,
        image: info.Config.Image,
        ports: info.NetworkSettings.Ports
      };

    } catch (error) {
      log.error('Error getting container status:', error);
      return {
        exists: false,
        running: false,
        error: error.message
      };
    }
  }

  /**
   * Get container logs
   */
  async getLogs(options = { tail: 100 }) {
    try {
      const container = await this.getContainer();
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        timestamps: true
      });

      return logs.toString('utf8');
    } catch (error) {
      log.error('Error getting container logs:', error);
      throw error;
    }
  }
}

module.exports = ClaraCoreDockerService;
