const { Client } = require('ssh2');
const log = require('electron-log');

/**
 * ClaraCore Remote Deployment Service
 * Handles SSH connection, hardware detection, and Docker deployment
 */
class ClaraCoreRemoteService {
  constructor() {
    this.conn = null;
    // SECURITY NOTE: sudoPassword is only stored temporarily during deployment
    // It is:
    // 1. Set at deployment start
    // 2. Used only for sudo operations during deployment
    // 3. Cleared immediately after deployment (success or failure)
    // 4. Never persisted to disk or logs
    // 5. Transmitted only over encrypted SSH connection
    this.sudoPassword = null;
  }

  /**
   * Test SSH connection and detect hardware
   */
  async testSetup(config) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let isResolved = false;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          reject(new Error('Connection timeout after 30 seconds'));
        }
      }, 30000);

      conn.on('ready', async () => {
        log.info('SSH connection established');

        try {
          // Detect hardware
          const hardware = await this.detectHardware(conn);

          clearTimeout(timeout);
          conn.end();

          if (!isResolved) {
            isResolved = true;
            resolve({
              success: true,
              hardware
            });
          }
        } catch (error) {
          clearTimeout(timeout);
          conn.end();

          if (!isResolved) {
            isResolved = true;
            resolve({
              success: false,
              error: error.message
            });
          }
        }
      });

      // Handle keyboard-interactive authentication (required for Raspberry Pi and similar SSH servers)
      conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
        finish([config.password]);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        log.error('SSH connection error:', err);

        if (!isResolved) {
          isResolved = true;
          resolve({
            success: false,
            error: err.message
          });
        }
      });

      // Connect
      conn.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        tryKeyboard: true, // Enable keyboard-interactive auth (required for some SSH servers like Raspberry Pi)
        readyTimeout: 30000
      });
    });
  }

  /**
   * Detect hardware and recommend container image
   */
  async detectHardware(conn) {
    const details = {
      docker: false,
      nvidia: false,
      rocm: false,
      vulkan: false,
      strix: false,
      architecture: 'unknown'
    };

    try {
      // Check CPU Architecture
      const archInfo = await this.execCommand(conn, 'uname -m');
      if (archInfo) {
        details.architecture = archInfo.trim();
        log.info(`Detected architecture: ${details.architecture}`);
      }

      // Check Docker
      const dockerVersion = await this.execCommand(conn, 'docker --version 2>/dev/null');
      if (dockerVersion && !dockerVersion.includes('command not found')) {
        details.docker = true;
        details.dockerVersion = dockerVersion.trim();
      }

      // Check NVIDIA GPU
      const nvidiaInfo = await this.execCommand(conn, 'nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null');
      if (nvidiaInfo && !nvidiaInfo.includes('command not found') && nvidiaInfo.trim()) {
        details.nvidia = true;
        details.gpuInfo = nvidiaInfo.trim();

        // Check CUDA version
        const cudaVersion = await this.execCommand(conn, 'nvcc --version 2>/dev/null | grep "release" | awk \'{print $5}\'');
        if (cudaVersion && cudaVersion.trim()) {
          details.cudaVersion = cudaVersion.trim().replace(',', '');
        }
      }

      // Check AMD ROCm
      const rocmInfo = await this.execCommand(conn, 'rocm-smi --showproductname 2>/dev/null');
      if (rocmInfo && !rocmInfo.includes('command not found') && rocmInfo.trim()) {
        details.rocm = true;

        const rocmVersion = await this.execCommand(conn, 'cat /opt/rocm/.info/version 2>/dev/null');
        if (rocmVersion && rocmVersion.trim()) {
          details.rocmVersion = rocmVersion.trim();
        }

        // Check if ROCm devices are accessible (critical for container usage)
        const kfdCheck = await this.execCommand(conn, 'test -e /dev/kfd && echo "exists" || echo "missing"');
        details.rocmDeviceAccessible = (kfdCheck.trim() === 'exists');

        log.info(`[Remote] ROCm detected: v${details.rocmVersion || 'unknown'}, /dev/kfd: ${details.rocmDeviceAccessible ? 'available' : 'MISSING'}`);
      }

      // Check for Vulkan support (fallback for AMD GPUs when ROCm devices unavailable)
      // First check if /dev/dri exists (this is what matters for container GPU access)
      const driCheck = await this.execCommand(conn, 'test -e /dev/dri && echo "exists" || echo "missing"');
      details.vulkanDeviceAccessible = (driCheck.trim() === 'exists');

      // Then check if vulkaninfo is installed
      const vulkanCheck = await this.execCommand(conn, 'vulkaninfo --summary 2>/dev/null | grep -i "Vulkan Instance Version"');
      if (vulkanCheck && !vulkanCheck.includes('command not found') && vulkanCheck.trim()) {
        details.vulkan = true;
        details.vulkanInstalled = true;

        // Try to get Vulkan device name
        const vulkanDevice = await this.execCommand(conn, 'vulkaninfo 2>/dev/null | grep "deviceName" | head -1');
        if (vulkanDevice && vulkanDevice.trim()) {
          details.vulkanDevice = vulkanDevice.replace(/.*deviceName\s*=\s*/, '').trim();
        }
      } else if (details.vulkanDeviceAccessible) {
        // /dev/dri exists but vulkaninfo not installed - we can still use Vulkan!
        // setupVulkan will install the necessary packages
        details.vulkan = true;
        details.vulkanInstalled = false;
        log.info('[Remote] Vulkan: /dev/dri available, vulkaninfo not installed (will be installed during setup)');
      }

      if (details.vulkanDeviceAccessible) {
        log.info(`[Remote] Vulkan compatible: YES (/dev/dri available, installed: ${details.vulkanInstalled ? 'YES' : 'NO'})`);
      }

      // Check for Strix Halo (Ryzen AI Max)
      const cpuInfo = await this.execCommand(conn, 'lscpu | grep "Model name"');
      if (cpuInfo) {
        details.cpuModel = cpuInfo.replace('Model name:', '').trim();

        // Check for Strix Halo keywords
        if (cpuInfo.includes('Ryzen AI Max') || cpuInfo.includes('Strix') || cpuInfo.includes('8040')) {
          details.strix = true;
        }
      }

      // Check if ARM architecture (not supported yet)
      const isARM = details.architecture.includes('arm') ||
                    details.architecture.includes('aarch');

      if (isARM) {
        return {
          detected: 'unsupported',
          confidence: 'high',
          details,
          error: `ARM architecture (${details.architecture}) is not supported yet. ClaraCore Docker images are currently only available for x86_64/amd64 architecture.`,
          unsupportedReason: 'arm'
        };
      }

      // Determine recommendation with smart fallback logic
      let detected = 'cpu';
      let confidence = 'high';
      let fallbackReason = null;

      if (details.nvidia) {
        detected = 'cuda';
        confidence = details.cudaVersion ? 'high' : 'medium';
      } else if (details.strix) {
        detected = 'strix';
        confidence = 'high';
      } else if (details.rocm && details.rocmDeviceAccessible) {
        // ROCm is available AND devices are accessible
        detected = 'rocm';
        confidence = 'high';
      } else if (details.rocm && !details.rocmDeviceAccessible && details.vulkan && details.vulkanDeviceAccessible) {
        // ROCm installed but /dev/kfd missing, fall back to Vulkan
        detected = 'vulkan';
        confidence = 'high'; // Changed to high since we know /dev/dri works
        fallbackReason = 'ROCm detected but /dev/kfd not accessible. Using Vulkan as fallback for GPU acceleration.';
        log.warn(`[Remote] ⚠️  ${fallbackReason}`);
        log.info(`[Remote] ℹ️  ROCm version: ${details.rocmVersion || 'unknown'}`);
        log.info(`[Remote] ℹ️  /dev/kfd: missing`);
        log.info(`[Remote] ℹ️  /dev/dri: available`);
        log.info(`[Remote] ✅ Vulkan will provide GPU acceleration without requiring /dev/kfd`);
      } else if (details.vulkan && details.vulkanDeviceAccessible) {
        // Vulkan available (no ROCm or ROCm not accessible)
        detected = 'vulkan';
        confidence = 'high';
        log.info(`[Remote] ℹ️  Vulkan GPU acceleration available via /dev/dri`);
      }

      return {
        detected,
        confidence,
        details,
        fallbackReason
      };

    } catch (error) {
      log.error('Hardware detection error:', error);
      throw error;
    }
  }

  /**
   * Deploy ClaraCore using native installation script
   * For ROCm, Vulkan, Strix Halo, and CPU modes
   * Uses port 5800
   */
  async deployNative(conn, config, hardwareType) {
    try {
      log.info(`[Remote] Starting native ClaraCore installation for ${hardwareType.toUpperCase()}...`);

      // 1. Download install.sh script
      log.info('[Remote] Downloading ClaraCore installation script...');
      await this.execCommand(conn, 'curl -fsSL https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/install.sh -o /tmp/claracore-install.sh');

      // 2. Make executable
      await this.execCommand(conn, 'chmod +x /tmp/claracore-install.sh');

      // 3. Execute installation script
      log.info('[Remote] Running ClaraCore installation (this may take a few minutes)...');
      try {
        await this.execCommandWithOutput(conn, 'sudo bash /tmp/claracore-install.sh');
      } catch (installError) {
        // Check if error is just due to script output or actual failure
        log.warn(`[Remote] Installation script completed with warnings: ${installError.message}`);
      }

      // 4. Wait for service to start
      log.info('[Remote] Waiting for ClaraCore service to start...');
      await this.sleep(8000); // Give systemd time to start the service

      // 5. Check if service is running via systemd
      const serviceStatus = await this.execCommand(conn, 'systemctl --user is-active claracore 2>&1 || echo "not-active"');

      if (serviceStatus.includes('active')) {
        log.info('[Remote] ✅ ClaraCore service is active');
      } else {
        log.warn('[Remote] ⚠️  Service may not be active yet. Status: ' + serviceStatus.trim());

        // Try to start it manually
        log.info('[Remote] Attempting to start service manually...');
        await this.execCommand(conn, 'systemctl --user start claracore 2>&1 || true');
        await this.sleep(5000);
      }

      // 6. Verify service is responding on port 5800
      log.info('[Remote] Verifying ClaraCore is responding on port 5800...');
      let healthCheckSuccess = false;

      for (let i = 0; i < 10; i++) {
        const healthCheck = await this.execCommand(conn, 'curl -sf http://localhost:5800/ 2>&1 || echo "not-ready"');

        if (!healthCheck.includes('not-ready') && !healthCheck.includes('Connection refused')) {
          healthCheckSuccess = true;
          log.info('[Remote] ✅ ClaraCore is responding on port 5800');
          break;
        }

        log.info(`[Remote] Waiting for service to respond... (attempt ${i + 1}/10)`);
        await this.sleep(3000);
      }

      if (!healthCheckSuccess) {
        // Get service logs for debugging
        const serviceLogs = await this.execCommand(conn, 'systemctl --user status claracore 2>&1 || journalctl --user -u claracore -n 20 2>&1 || echo "No logs available"');
        log.warn(`[Remote] Service logs:\n${serviceLogs}`);

        throw new Error('ClaraCore service did not respond on port 5800 after installation. Check service logs.');
      }

      // 7. Clean up installation script
      await this.execCommand(conn, 'rm -f /tmp/claracore-install.sh');

      log.info(`[Remote] ✅ Native ClaraCore installation completed successfully (${hardwareType.toUpperCase()})`);

      return {
        success: true,
        url: `http://${config.host}:5800`,
        port: 5800,
        deploymentMethod: 'native',
        hardwareType: hardwareType,
        message: `Successfully deployed ClaraCore via native installation (${hardwareType.toUpperCase()})`,
        containerName: null // No container for native installation
      };

    } catch (error) {
      log.error('[Remote] Native installation failed:', error);
      throw error;
    }
  }

  /**
   * Manage native ClaraCore service via systemd
   * @param {Object} conn - SSH connection
   * @param {string} action - Action: 'start', 'stop', 'restart', 'status', 'logs'
   * @returns {Promise<Object>} - Action result
   */
  async manageNativeService(conn, action) {
    try {
      log.info(`[Remote] Managing ClaraCore service: ${action}`);

      let command;
      switch (action) {
        case 'start':
          command = 'systemctl --user start claracore';
          break;
        case 'stop':
          command = 'systemctl --user stop claracore';
          break;
        case 'restart':
          command = 'systemctl --user restart claracore';
          break;
        case 'status':
          command = 'systemctl --user status claracore';
          break;
        case 'logs':
          command = 'journalctl --user -u claracore -n 50 --no-pager';
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      const result = await this.execCommand(conn, command);

      if (action === 'status') {
        // Parse status output
        const isActive = result.includes('active (running)');
        const isEnabled = result.includes('enabled');

        return {
          success: true,
          action,
          isActive,
          isEnabled,
          output: result
        };
      } else if (action === 'logs') {
        return {
          success: true,
          action,
          logs: result
        };
      } else {
        // start, stop, restart
        return {
          success: true,
          action,
          message: `Service ${action} completed successfully`
        };
      }
    } catch (error) {
      log.error(`[Remote] Service ${action} failed:`, error);
      return {
        success: false,
        action,
        error: error.message
      };
    }
  }

  /**
   * Deploy ClaraCore using Docker container
   * For CUDA mode only
   * Uses port 5890
   */
  async deployDocker(conn, config, hardwareType) {
    try {
      const imageName = `clara17verse/claracore:${hardwareType}`;
      const containerName = `claracore-${hardwareType}`;

      log.info(`[Remote] Deploying ${imageName} via Docker...`);

      // 1. Check if Docker is installed
      const hasDocker = await this.checkDocker(conn);
      if (!hasDocker) {
        log.info('[Remote] Installing Docker...');
        await this.installDocker(conn);
      }

      // 1.5. Ensure clara_network exists
      log.info('[Remote] Setting up Clara network...');
      const networkCheck = await this.execCommand(conn, 'docker network ls --filter name=clara_network --format "{{.Name}}"');
      if (!networkCheck || !networkCheck.includes('clara_network')) {
        await this.execCommand(conn, 'docker network create clara_network --driver bridge --subnet 172.25.0.0/16');
        log.info('[Remote] ✓ Clara network created');
      } else {
        log.info('[Remote] ✓ Clara network exists');
      }

      // 2. Install CUDA prerequisites (only for CUDA)
      if (hardwareType === 'cuda') {
        await this.setupCuda(conn);
      }

      // 3. Stop and remove existing container
      log.info('[Remote] Cleaning up existing containers...');
      await this.execCommand(conn, `docker stop ${containerName} 2>/dev/null || true`);
      await this.execCommand(conn, `docker rm ${containerName} 2>/dev/null || true`);

      // 4. Pull the image
      log.info(`[Remote] Pulling image ${imageName}...`);
      await this.execCommandWithOutput(conn, `docker pull ${imageName}`);

      // 5. Run the container with CUDA flags
      log.info(`[Remote] Starting container ${containerName}...`);
      const runCommand = this.buildDockerRunCommand(hardwareType, containerName, imageName, []);

      try {
        await this.execCommand(conn, runCommand);
      } catch (runError) {
        log.error(`[Remote] Docker run command failed: ${runError.message}`);
        throw new Error(`Failed to start container: ${runError.message}`);
      }

      // 6. Wait for container to be healthy
      log.info('[Remote] Waiting for container to start...');
      await this.sleep(5000);

      // 7. Verify container is running
      const isRunning = await this.execCommand(conn, `docker ps -q -f name=${containerName}`);
      if (!isRunning || !isRunning.trim()) {
        const logs = await this.execCommand(conn, `docker logs ${containerName} 2>&1 || echo "No logs available"`);
        const inspectResult = await this.execCommand(conn, `docker inspect ${containerName} --format='{{.State.Status}}: {{.State.Error}}' 2>&1 || echo "Container not found"`);
        throw new Error(`Container failed to start.\n\nStatus: ${inspectResult}\n\nLogs:\n${logs.substring(0, 500)}`);
      }

      log.info('[Remote] ✅ Container started successfully!');

      // 8. Check if service is responding
      log.info('[Remote] Verifying service health...');
      const healthCheck = await this.execCommand(conn, `curl -sf http://localhost:5890/health 2>&1 || echo "Health check not available"`);
      if (healthCheck.includes('Health check not available')) {
        log.warn('[Remote] Service health endpoint not available, but container is running');
      } else {
        log.info('[Remote] ✅ Service is healthy and responding');
      }

      return {
        success: true,
        url: `http://${config.host}:5890`,
        port: 5890,
        deploymentMethod: 'docker',
        containerName: containerName,
        hardwareType: hardwareType,
        message: `Successfully deployed ClaraCore via Docker (${hardwareType.toUpperCase()})`
      };

    } catch (error) {
      log.error('[Remote] Docker deployment failed:', error);
      throw error;
    }
  }

  /**
   * Deploy ClaraCore - routes to Docker or Native installation based on hardware type
   * - CUDA: Uses Docker (port 5890)
   * - ROCm, Vulkan, Strix, CPU: Uses Native installation (port 5800)
   */
  async deploy(config) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let isResolved = false;

      // Store password temporarily for this deployment session only
      // It will be cleared in all exit paths (success/failure/timeout)
      this.sudoPassword = config.password;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          this.sudoPassword = null;
          reject(new Error('Deployment timeout after 5 minutes'));
        }
      }, 300000); // 5 minutes

      conn.on('ready', async () => {
        log.info('SSH connection established for deployment');

        try {
          const { hardwareType } = config;

          // Choose deployment method based on hardware type
          let result;
          if (hardwareType === 'cuda') {
            log.info('[Remote] Using Docker deployment for CUDA');
            result = await this.deployDocker(conn, config, hardwareType);
          } else {
            log.info(`[Remote] Using native installation for ${hardwareType.toUpperCase()}`);
            result = await this.deployNative(conn, config, hardwareType);
          }

          // Deployment successful - clean up and resolve
          clearTimeout(timeout);
          conn.end();

          // Clear password from memory
          this.sudoPassword = null;

          if (!isResolved) {
            isResolved = true;
            resolve(result);
          }

        } catch (error) {
          log.error('Deployment error:', error);
          clearTimeout(timeout);
          conn.end();
          
          // Clear password from memory
          this.sudoPassword = null;

          if (!isResolved) {
            isResolved = true;
            
            // Provide better error messages
            let errorMessage = error.message;
            if (errorMessage.includes('incorrect password')) {
              errorMessage = 'Incorrect sudo password. Please verify your SSH password and try again.';
            } else if (errorMessage.includes('Permission denied')) {
              errorMessage = 'SSH authentication failed. Please check your credentials.';
            }
            
            resolve({
              success: false,
              error: errorMessage
            });
          }
        }
      });

      // Handle keyboard-interactive authentication (required for Raspberry Pi and similar SSH servers)
      conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
        finish([config.password]);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        log.error('SSH connection error during deployment:', err);

        // Clear password from memory
        this.sudoPassword = null;

        if (!isResolved) {
          isResolved = true;
          
          let errorMessage = err.message;
          if (err.level === 'client-authentication') {
            errorMessage = 'SSH authentication failed. Please check your username and password.';
          } else if (err.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused. Please check the host and port.';
          } else if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
            errorMessage = 'Connection timeout. Please check the host address and your network connection.';
          }
          
          resolve({
            success: false,
            error: errorMessage
          });
        }
      });

      // Connect
      conn.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        tryKeyboard: true, // Enable keyboard-interactive auth (required for some SSH servers like Raspberry Pi)
        readyTimeout: 30000
      });
    });
  }

  /**
   * Detect available DRI devices on the remote server
   */
  async detectDRIDevices(conn) {
    try {
      // List all devices in /dev/dri/
      const devices = await this.execCommand(conn, 'ls -1 /dev/dri/ 2>/dev/null | grep -E "^(card|renderD)" || echo ""');

      if (!devices || !devices.trim()) {
        log.warn('[Remote] No DRI devices found in /dev/dri/');
        return [];
      }

      // Parse device list and create full paths
      const deviceList = devices.trim().split('\n')
        .filter(d => d.trim())
        .map(d => `/dev/dri/${d.trim()}`);

      return deviceList;
    } catch (error) {
      log.error('[Remote] Error detecting DRI devices:', error.message);
      return [];
    }
  }

  /**
   * Build Docker run command based on hardware type
   * Handles different contexts (Docker Desktop vs Docker Engine)
   */
  buildDockerRunCommand(hardwareType, containerName, imageName, availableDevices = []) {
    // Use clara_network and expose on both ports (8091 standard, 5890 legacy)
    // Use 172.17.0.1 (default bridge gateway) to access host services from custom network
    const baseCmd = `docker run -d --name ${containerName} --network clara_network --restart unless-stopped -p 8091:5890 -p 5890:5890 --add-host=host.docker.internal:172.17.0.1`;
    const volume = `-v claracore-${hardwareType}-downloads:/app/downloads`;

    switch (hardwareType) {
      case 'cuda':
        // For CUDA, try --gpus all (requires nvidia runtime)
        // If using Docker Engine with proper setup, this should work
        return `${baseCmd} --gpus all ${volume} ${imageName}`;

      case 'rocm':
        // AMD ROCm requires specific device access (/dev/kfd + DRI render devices)
        // Use dynamically detected devices
        const rocmDevices = availableDevices.map(d => `--device=${d}`).join(' ');
        return `${baseCmd} --device=/dev/kfd ${rocmDevices} --group-add video --group-add render --ipc=host --cap-add=SYS_PTRACE --security-opt seccomp=unconfined ${volume} ${imageName}`;

      case 'vulkan':
        // Vulkan only requires DRI render devices (no /dev/kfd needed)
        // Use privileged mode if Docker can't see individual devices (namespace issue)
        if (availableDevices.length === 0) {
          log.warn('[Remote] No DRI devices detected, using --privileged mode for full device access');
          return `${baseCmd} --privileged --group-add video --group-add render -e VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json ${volume} ${imageName}`;
        }
        const vulkanDevices = availableDevices.map(d => `--device=${d}`).join(' ');
        return `${baseCmd} ${vulkanDevices} --group-add video --group-add render --security-opt seccomp=unconfined -e VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json ${volume} ${imageName}`;

      case 'strix':
        // Strix Halo (Ryzen AI Max) uses iGPU with Vulkan
        // Use privileged mode if Docker can't see individual devices
        if (availableDevices.length === 0) {
          log.warn('[Remote] No DRI devices detected, using --privileged mode for full device access');
          return `${baseCmd} --privileged --group-add video --group-add render ${volume} ${imageName}`;
        }
        const strixDevices = availableDevices.map(d => `--device=${d}`).join(' ');
        return `${baseCmd} ${strixDevices} --group-add video --group-add render --security-opt seccomp=unconfined ${volume} ${imageName}`;

      case 'cpu':
      default:
        // CPU-only version
        return `${baseCmd} ${volume} ${imageName}`;
    }
  }

  /**
   * Check if Docker is installed
   */
  async checkDocker(conn) {
    try {
      const result = await this.execCommand(conn, 'docker --version 2>/dev/null');
      return result && !result.includes('command not found');
    } catch {
      return false;
    }
  }

  /**
   * Install Docker using official convenience script
   * This is more reliable and works across all major Linux distributions
   */
  async installDocker(conn) {
    try {
      log.info('[Remote] Detecting Linux distribution...');
      
      // Detect the distribution
      const osRelease = await this.execCommand(conn, 'cat /etc/os-release');
      const distro = this.detectDistro(osRelease);
      
      log.info(`[Remote] Detected distribution: ${distro}`);
      
      // For simplicity and reliability, use Docker's official convenience script
      // This works across Ubuntu, Debian, Fedora, CentOS, and other distros
      log.info('[Remote] Downloading Docker installation script...');
      await this.execCommand(conn, 'curl -fsSL https://get.docker.com -o /tmp/get-docker.sh');
      
      log.info('[Remote] Installing Docker (this may take a few minutes)...');
      await this.execCommandWithOutput(conn, 'sudo sh /tmp/get-docker.sh');
      
      // Clean up
      await this.execCommand(conn, 'rm /tmp/get-docker.sh');
      
      // Get current username
      const username = await this.execCommand(conn, 'whoami');
      const user = username.trim() || 'ubuntu';
      
      log.info(`[Remote] Adding user ${user} to docker group...`);
      await this.execCommand(conn, `sudo usermod -aG docker ${user}`);
      
      log.info('[Remote] Starting Docker service...');
      await this.execCommand(conn, 'sudo systemctl start docker');
      await this.execCommand(conn, 'sudo systemctl enable docker');
      
      log.info('[Remote] Docker installed successfully');
      
      // Important: Warn about group membership
      log.info('[Remote] Note: User needs to log out and back in for docker group to take effect');
      
    } catch (error) {
      log.error('[Remote] Docker installation failed:', error);
      throw new Error(`Failed to install Docker: ${error.message}`);
    }
  }
  
  /**
   * Detect Linux distribution from /etc/os-release
   */
  detectDistro(osRelease) {
    if (osRelease.includes('Ubuntu')) return 'Ubuntu';
    if (osRelease.includes('Debian')) return 'Debian';
    if (osRelease.includes('Fedora')) return 'Fedora';
    if (osRelease.includes('CentOS')) return 'CentOS';
    if (osRelease.includes('Red Hat')) return 'RHEL';
    if (osRelease.includes('Arch')) return 'Arch Linux';
    return 'Unknown Linux';
  }

  /**
   * Setup NVIDIA CUDA with proper runtime configuration
   */
  async setupCuda(conn) {
    try {
      // Check if nvidia-smi works (GPU drivers installed)
      const nvidiaCheck = await this.execCommand(conn, 'nvidia-smi 2>/dev/null');
      if (!nvidiaCheck || nvidiaCheck.includes('command not found')) {
        throw new Error('NVIDIA drivers not found. Please install NVIDIA drivers first.');
      }
      
      log.info('[Remote] NVIDIA drivers detected');
      
      // Check if nvidia-container-toolkit is installed
      const hasToolkit = await this.execCommand(conn, 'which nvidia-ctk 2>/dev/null');
      
      if (!hasToolkit || !hasToolkit.trim()) {
        log.info('[Remote] Installing NVIDIA Container Toolkit...');
        
        // Detect package manager and distro
        const hasApt = await this.execCommand(conn, 'which apt-get 2>/dev/null');
        const hasYum = await this.execCommand(conn, 'which yum 2>/dev/null');
        
        if (hasApt && hasApt.trim()) {
          await this.installNvidiaToolkitApt(conn);
        } else if (hasYum && hasYum.trim()) {
          await this.installNvidiaToolkitYum(conn);
        } else {
          throw new Error('Unsupported package manager. Only apt and yum are supported.');
        }
      } else {
        log.info('[Remote] NVIDIA Container Toolkit already installed');
      }
      
      // Configure Docker runtime
      log.info('[Remote] Configuring NVIDIA runtime for Docker...');
      await this.execCommand(conn, 'sudo nvidia-ctk runtime configure --runtime=docker');
      
      // Reload systemd and restart Docker
      log.info('[Remote] Restarting Docker service...');
      await this.execCommand(conn, 'sudo systemctl daemon-reload');
      await this.execCommand(conn, 'sudo systemctl restart docker');
      
      // Wait for Docker to be ready
      await this.sleep(3000);
      
      // Check if Docker context needs to be switched from desktop-linux to default
      const dockerContext = await this.execCommand(conn, 'docker context show 2>/dev/null');
      if (dockerContext && dockerContext.includes('desktop-linux')) {
        log.info('[Remote] Switching from Docker Desktop to Docker Engine context...');
        await this.execCommand(conn, 'docker context use default');
        
        // Get current user and ensure they're in docker group
        const username = await this.execCommand(conn, 'whoami');
        const user = username.trim();
        await this.execCommand(conn, `sudo usermod -aG docker ${user}`);
        
        log.info('[Remote] Note: User may need to log out and back in for docker group to take effect');
      }
      
      // Verify NVIDIA runtime is available
      const runtimeCheck = await this.execCommand(conn, 'docker info 2>/dev/null | grep -i runtime');
      if (runtimeCheck && runtimeCheck.includes('nvidia')) {
        log.info('[Remote] NVIDIA Container Toolkit configured successfully');
      } else {
        log.warn('[Remote] NVIDIA runtime may not be properly configured. Container may need manual intervention.');
      }
      
    } catch (error) {
      log.error('[Remote] CUDA setup failed:', error);
      throw error;
    }
  }
  
  /**
   * Install NVIDIA Container Toolkit on Debian/Ubuntu (apt-based)
   */
  async installNvidiaToolkitApt(conn) {
    const commands = [
      // Add NVIDIA GPG key
      {
        cmd: 'curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg',
        desc: 'Adding NVIDIA GPG key'
      },
      // Add repository
      {
        cmd: 'curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed \'s#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g\' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list',
        desc: 'Adding NVIDIA repository'
      },
      // Update and install
      { cmd: 'sudo apt-get update', desc: 'Updating package lists' },
      { cmd: 'sudo apt-get install -y nvidia-container-toolkit', desc: 'Installing NVIDIA Container Toolkit' }
    ];

    for (const { cmd, desc } of commands) {
      log.info(`[Remote] ${desc}...`);
      await this.execCommandWithOutput(conn, cmd);
    }
  }
  
  /**
   * Install NVIDIA Container Toolkit on RHEL/CentOS/Fedora (yum-based)
   */
  async installNvidiaToolkitYum(conn) {
    const commands = [
      {
        cmd: 'curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo',
        desc: 'Adding NVIDIA repository'
      },
      { cmd: 'sudo yum install -y nvidia-container-toolkit', desc: 'Installing NVIDIA Container Toolkit' }
    ];

    for (const { cmd, desc } of commands) {
      log.info(`[Remote] ${desc}...`);
      await this.execCommandWithOutput(conn, cmd);
    }
  }

  /**
   * Setup AMD ROCm
   */
  async setupRocm(conn) {
    try {
      log.info('[Remote] Validating ROCm device access...');

      // More thorough check: verify /dev/kfd is actually a character device
      const kfdCheck = await this.execCommand(conn, 'ls -la /dev/kfd 2>&1');
      log.info(`[Remote] DEBUG: ls -la /dev/kfd output:\n${kfdCheck}`);

      // Check if it's a character device (starts with 'c')
      if (!kfdCheck || kfdCheck.includes('No such file') || kfdCheck.includes('cannot access')) {
        throw new Error('ROCm device /dev/kfd not found. ROCm kernel drivers may not be loaded.\n\nTry loading the module: sudo modprobe amdgpu\nOr install ROCm drivers: https://rocmdocs.amd.com/en/latest/Installation_Guide/Installation-Guide.html');
      }

      if (!kfdCheck.startsWith('c')) {
        throw new Error('/dev/kfd exists but is not a character device. ROCm kernel module (amdkfd) may not be loaded.\n\nTry: sudo modprobe amdgpu');
      }

      // Check if /dev/dri exists and is accessible
      const driCheck = await this.execCommand(conn, 'ls -la /dev/dri 2>&1');
      log.info(`[Remote] DEBUG: ls -la /dev/dri output:\n${driCheck}`);

      if (!driCheck || driCheck.includes('No such file') || driCheck.includes('cannot access')) {
        throw new Error('Device /dev/dri not found. AMD GPU drivers may not be installed correctly.');
      }

      log.info('[Remote] ✅ ROCm devices validated: /dev/kfd and /dev/dri are accessible');

      // Ensure user is in video and render groups
      const username = await this.execCommand(conn, 'whoami');
      const user = username.trim();
      log.info(`[Remote] Adding user ${user} to video and render groups...`);
      await this.execCommand(conn, `sudo usermod -a -G video,render ${user}`);

      log.info('[Remote] ROCm setup complete. Note: User may need to log out and back in for group changes to take effect.');
    } catch (error) {
      log.error('[Remote] ROCm setup failed:', error);
      throw error;
    }
  }

  /**
   * Setup Vulkan GPU acceleration (Fallback for AMD GPUs when ROCm unavailable)
   * Only requires /dev/dri, no ROCm kernel drivers needed
   */
  async setupVulkan(conn) {
    try {
      log.info('[Remote] Setting up Vulkan GPU acceleration...');

      // 1. Validate DRI device (required for GPU access)
      log.info('[Remote] Checking GPU device access...');
      const driCheck = await this.execCommand(conn, 'test -e /dev/dri && echo "exists" || echo "missing"');
      if (driCheck.trim() === 'missing') {
        throw new Error('Device /dev/dri not found. AMD GPU drivers (amdgpu) may not be installed.\n\nPlease ensure the Linux kernel has amdgpu drivers loaded.');
      }
      log.info('[Remote] ✓ GPU device found: /dev/dri');

      // 2. Check for Vulkan support (critical for GPU acceleration)
      log.info('[Remote] Checking Vulkan support...');
      const vulkanCheck = await this.execCommand(conn, 'which vulkaninfo 2>/dev/null');

      if (!vulkanCheck || !vulkanCheck.trim()) {
        // Vulkan not found - need to install
        log.info('[Remote] Vulkan not found. Installing Vulkan drivers...');

        // Detect distro
        const osRelease = await this.execCommand(conn, 'cat /etc/os-release');
        const distro = this.detectDistro(osRelease);
        log.info(`[Remote] Detected distribution: ${distro}`);

        // Install based on distro
        if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
          log.info('[Remote] Installing Vulkan packages for Ubuntu/Debian...');
          await this.execCommandWithOutput(conn, 'sudo apt-get update');
          await this.execCommandWithOutput(conn, 'sudo apt-get install -y mesa-vulkan-drivers vulkan-tools libvulkan1');
        } else if (osRelease.includes('Fedora') || osRelease.includes('Red Hat') || osRelease.includes('CentOS')) {
          log.info('[Remote] Installing Vulkan packages for Fedora/RHEL...');
          await this.execCommandWithOutput(conn, 'sudo dnf install -y mesa-vulkan-drivers vulkan-tools vulkan-loader');
        } else if (osRelease.includes('Arch')) {
          log.info('[Remote] Installing Vulkan packages for Arch Linux...');
          await this.execCommandWithOutput(conn, 'sudo pacman -S --noconfirm vulkan-radeon vulkan-tools');
        } else {
          throw new Error(`Unsupported distribution: ${distro}. Please install mesa-vulkan-drivers and vulkan-tools manually.`);
        }

        // Verify Vulkan installation
        log.info('[Remote] Verifying Vulkan installation...');
        const vulkanVerify = await this.execCommand(conn, 'vulkaninfo --summary 2>&1 | grep -i "Vulkan Instance Version" || echo "failed"');
        if (vulkanVerify.includes('failed')) {
          throw new Error('Vulkan installation verification failed. Please check the installation logs.');
        }
        log.info('[Remote] ✓ Vulkan installed successfully');
      } else {
        log.info('[Remote] ✓ Vulkan is already installed');
      }

      // 3. Verify Vulkan can detect GPU
      log.info('[Remote] Verifying Vulkan GPU detection...');
      const vulkanDevices = await this.execCommand(conn, 'vulkaninfo 2>/dev/null | grep "deviceName" | head -1 || echo "No GPU detected"');
      if (vulkanDevices.includes('No GPU detected')) {
        throw new Error('Vulkan is installed but cannot detect any GPU. Please check AMD GPU drivers.');
      }
      log.info(`[Remote] ✓ Vulkan GPU detected: ${vulkanDevices.trim()}`);

      // 4. Ensure user is in video and render groups (required for GPU access)
      const username = await this.execCommand(conn, 'whoami');
      const user = username.trim();
      log.info(`[Remote] Adding user ${user} to video and render groups...`);
      await this.execCommand(conn, `sudo usermod -a -G video,render ${user}`);

      log.info('[Remote] ✅ Vulkan GPU acceleration setup complete!');
      log.info('[Remote] Note: This provides good GPU performance without requiring ROCm kernel drivers.');
    } catch (error) {
      log.error('[Remote] Vulkan setup failed:', error);
      throw error;
    }
  }

  /**
   * Setup Strix Halo (Ryzen AI Max with integrated GPU)
   * Focuses on Vulkan support for GPU acceleration
   */
  async setupStrix(conn) {
    try {
      log.info('[Remote] Setting up Strix Halo (Ryzen AI Max) with Vulkan support...');

      // 1. Validate DRI device (required for GPU access)
      log.info('[Remote] Checking GPU device access...');
      const driCheck = await this.execCommand(conn, 'test -e /dev/dri && echo "exists" || echo "missing"');
      if (driCheck.trim() === 'missing') {
        throw new Error('Device /dev/dri not found. AMD GPU drivers (amdgpu) may not be installed.\n\nPlease ensure the Linux kernel has amdgpu drivers loaded.');
      }
      log.info('[Remote] ✓ GPU device found: /dev/dri');

      // 2. Check for Vulkan support (critical for GPU acceleration)
      log.info('[Remote] Checking Vulkan support...');
      const vulkanCheck = await this.execCommand(conn, 'which vulkaninfo 2>/dev/null');

      if (!vulkanCheck || !vulkanCheck.trim()) {
        // Vulkan not found - need to install
        log.info('[Remote] Vulkan not found. Installing Vulkan drivers...');

        // Detect distro
        const osRelease = await this.execCommand(conn, 'cat /etc/os-release');
        const distro = this.detectDistro(osRelease);
        log.info(`[Remote] Detected distribution: ${distro}`);

        // Install based on distro
        if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
          log.info('[Remote] Installing Vulkan packages for Ubuntu/Debian...');
          await this.execCommandWithOutput(conn, 'sudo apt-get update');
          await this.execCommandWithOutput(conn, 'sudo apt-get install -y mesa-vulkan-drivers vulkan-tools libvulkan1');
        } else if (osRelease.includes('Fedora') || osRelease.includes('Red Hat') || osRelease.includes('CentOS')) {
          log.info('[Remote] Installing Vulkan packages for Fedora/RHEL...');
          await this.execCommandWithOutput(conn, 'sudo dnf install -y mesa-vulkan-drivers vulkan-tools vulkan-loader');
        } else if (osRelease.includes('Arch')) {
          log.info('[Remote] Installing Vulkan packages for Arch Linux...');
          await this.execCommandWithOutput(conn, 'sudo pacman -S --noconfirm vulkan-radeon vulkan-tools');
        } else {
          throw new Error(`Unsupported distribution: ${distro}. Please install mesa-vulkan-drivers and vulkan-tools manually.`);
        }

        // Verify Vulkan installation
        log.info('[Remote] Verifying Vulkan installation...');
        const vulkanVerify = await this.execCommand(conn, 'vulkaninfo --summary 2>&1 | grep -i "Vulkan Instance Version" || echo "failed"');
        if (!vulkanVerify.includes('failed')) {
          log.info('[Remote] ✓ Vulkan installed and detected successfully');
        } else {
          log.warn('[Remote] ⚠ Vulkan installed but may not be functioning. A system reboot might be required.');
        }
      } else {
        log.info('[Remote] ✓ Vulkan already installed');

        // Quick Vulkan validation
        const vulkanDevices = await this.execCommand(conn, 'vulkaninfo --summary 2>&1 | grep -i "deviceName" || echo "none"');
        if (!vulkanDevices.includes('none')) {
          log.info(`[Remote] ✓ Vulkan GPU detected: ${vulkanDevices.trim()}`);
        }
      }

      // 3. Set up user permissions for GPU access
      const username = await this.execCommand(conn, 'whoami');
      const user = username.trim();
      log.info(`[Remote] Adding user ${user} to video and render groups...`);
      await this.execCommand(conn, `sudo usermod -a -G video,render ${user}`);

      log.info('[Remote] ✓ Strix Halo setup complete! GPU will be available via Vulkan.');
      log.info('[Remote] Note: User may need to log out and back in for group changes to take effect.');

    } catch (error) {
      log.error('[Remote] Strix Halo setup failed:', error);
      throw error;
    }
  }

  /**
   * Execute command with sudo support (using temporarily stored password)
   */
  execCommand(conn, command) {
    return new Promise((resolve, reject) => {
      // Handle sudo commands with password properly
      let execCommand = command;

      if (this.sudoPassword && command.includes('sudo')) {
        // Escape password for shell
        const escapedPassword = this.sudoPassword.replace(/'/g, "'\\''");
        
        // For commands with pipes that contain sudo
        if (command.includes('|') && command.includes('sudo')) {
          const escapedCommand = command.replace(/'/g, "'\\''");
          execCommand = `bash -c "echo '${escapedPassword}' | ${command.replace(/sudo/g, 'sudo -S')}"`;
        } else if (command.trim().startsWith('sudo ')) {
          // Simple sudo command at start
          execCommand = `echo '${escapedPassword}' | ${command.replace(/^sudo\s+/, 'sudo -S ')}`;
        }
      }
      
      conn.exec(execCommand, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('close', (code) => {
          if (code !== 0 && errorOutput) {
            log.warn(`Command failed (code ${code}): ${command}`);
            log.warn(`Error: ${errorOutput}`);
          }
          resolve(output || errorOutput);
        });

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      });
    });
  }

  /**
   * Execute command and stream output (for long-running commands, using temporarily stored password)
   */
  execCommandWithOutput(conn, command) {
    return new Promise((resolve, reject) => {
      // Handle sudo commands with password properly
      let execCommand = command;

      if (this.sudoPassword && command.includes('sudo')) {
        // For commands with pipes that contain sudo, we need to handle it specially
        // Replace all instances of 'sudo' with proper password handling
        if (command.includes('|') && command.includes('sudo')) {
          // Wrap the entire command in a bash -c with password provided via -S
          const escapedPassword = this.sudoPassword.replace(/'/g, "'\\''");
          const escapedCommand = command.replace(/'/g, "'\\''");
          execCommand = `bash -c "echo '${escapedPassword}' | ${command.replace(/sudo/g, 'sudo -S')}"`;
        } else if (command.trim().startsWith('sudo ')) {
          // Simple sudo command at start
          const escapedPassword = this.sudoPassword.replace(/'/g, "'\\''");
          execCommand = `echo '${escapedPassword}' | ${command.replace(/^sudo\s+/, 'sudo -S ')}`;
        }
      }
      
      conn.exec(execCommand, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let hasOutput = false;

        let stderrOutput = '';

        stream.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            const errorMsg = stderrOutput ?
              `Command failed with code ${code}: ${stderrOutput}` :
              `Command failed with code ${code}`;
            reject(new Error(errorMsg));
          }
        });

        stream.on('data', (data) => {
          const output = data.toString().trim();
          if (output && !output.includes('[sudo] password') && !output.includes('Sorry, try again')) {
            hasOutput = true;
            log.info(`[Remote] ${output}`);
          }
        });

        stream.stderr.on('data', (data) => {
          const output = data.toString().trim();
          // Capture stderr for error reporting
          if (output) {
            stderrOutput += output + '\n';
          }
          // Filter out sudo password prompts and sudo warnings for logging
          if (output &&
              !output.includes('[sudo] password') &&
              !output.includes('Sorry, try again') &&
              !output.includes('sudo: a password is required')) {
            log.info(`[Remote] ${output}`);
          }
        });
      });
    });
  }

  /**
   * Monitor remote ClaraCore services
   * Returns status of all ClaraCore containers running on remote server
   */
  async monitorRemoteServices(config) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let isResolved = false;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          reject(new Error('Monitor timeout after 15 seconds'));
        }
      }, 15000);

      conn.on('ready', async () => {
        try {
          // List all claracore containers
          const containerListCmd = 'docker ps -a --filter "name=claracore-" --format "{{.Names}}|{{.Status}}|{{.Ports}}"';
          const containerList = await this.execCommand(conn, containerListCmd);

          const services = [];

          if (containerList && containerList.trim()) {
            const lines = containerList.trim().split('\n');

            for (const line of lines) {
              const [name, status, ports] = line.split('|');

              // Extract hardware type from container name (claracore-cuda, claracore-rocm, etc.)
              const hardwareType = name.replace('claracore-', '');
              const isRunning = status.toLowerCase().includes('up');

              // Check health if running
              let isHealthy = false;
              if (isRunning) {
                try {
                  const healthCheck = await this.execCommand(conn, `curl -sf http://localhost:5890/health 2>&1`);
                  isHealthy = healthCheck && !healthCheck.includes('Failed to connect');
                } catch {
                  isHealthy = false;
                }
              }

              services.push({
                name,
                hardwareType,
                status: isRunning ? 'running' : 'stopped',
                isHealthy: isRunning ? isHealthy : false,
                ports: ports || 'N/A',
                url: isRunning ? `http://${config.host}:5890` : null
              });
            }
          }

          clearTimeout(timeout);
          conn.end();

          if (!isResolved) {
            isResolved = true;
            resolve({
              success: true,
              host: config.host,
              services,
              totalServices: services.length,
              runningServices: services.filter(s => s.status === 'running').length,
              healthyServices: services.filter(s => s.isHealthy).length,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          log.error('Monitor error:', error);
          clearTimeout(timeout);
          conn.end();

          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        }
      });

      // Handle keyboard-interactive authentication (required for Raspberry Pi and similar SSH servers)
      conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
        finish([config.password]);
      });

      conn.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      conn.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        tryKeyboard: true, // Enable keyboard-interactive auth (required for some SSH servers like Raspberry Pi)
        readyTimeout: 15000
      });
    });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ClaraCoreRemoteService;
