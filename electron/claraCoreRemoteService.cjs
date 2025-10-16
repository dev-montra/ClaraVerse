const { Client } = require('ssh2');
const log = require('electron-log');

/**
 * ClaraCore Remote Deployment Service
 * Handles SSH connection, hardware detection, and Docker deployment
 */
class ClaraCoreRemoteService {
  constructor() {
    this.conn = null;
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

      // Determine recommendation
      let detected = 'cpu';
      let confidence = 'high';

      if (details.nvidia) {
        detected = 'cuda';
        confidence = details.cudaVersion ? 'high' : 'medium';
      } else if (details.strix) {
        detected = 'strix';
        confidence = 'high';
      } else if (details.rocm) {
        detected = 'rocm';
        confidence = 'high';
      }

      return {
        detected,
        confidence,
        details
      };

    } catch (error) {
      log.error('Hardware detection error:', error);
      throw error;
    }
  }

  /**
   * Deploy ClaraCore container
   */
  async deploy(config) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let isResolved = false;
      
      // Store password for sudo commands
      this.sudoPassword = config.password;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          reject(new Error('Deployment timeout after 5 minutes'));
        }
      }, 300000); // 5 minutes

      conn.on('ready', async () => {
        log.info('SSH connection established for deployment');

        try {
          const { hardwareType } = config;
          const imageName = `clara17verse/claracore:${hardwareType}`;
          const containerName = `claracore-${hardwareType}`;

          log.info(`Deploying ${imageName}...`);

          // 1. Check if Docker is installed
          const hasDocker = await this.checkDocker(conn);
          if (!hasDocker) {
            log.info('Installing Docker...');
            await this.installDocker(conn);
          }

          // 2. Install hardware-specific prerequisites
          if (hardwareType === 'cuda') {
            await this.setupCuda(conn);
          } else if (hardwareType === 'rocm') {
            await this.setupRocm(conn);
          } else if (hardwareType === 'strix') {
            await this.setupStrix(conn);
          }

          // 3. Stop and remove existing container
          log.info('Cleaning up existing containers...');
          await this.execCommand(conn, `docker stop ${containerName} 2>/dev/null || true`);
          await this.execCommand(conn, `docker rm ${containerName} 2>/dev/null || true`);

          // 4. Pull the image
          log.info(`Pulling image ${imageName}...`);
          await this.execCommandWithOutput(conn, `docker pull ${imageName}`);

          // 5. Run the container with appropriate flags
          log.info(`Starting container ${containerName}...`);
          const runCommand = this.buildDockerRunCommand(hardwareType, containerName, imageName);
          const runResult = await this.execCommand(conn, runCommand);

          // 6. Wait for container to be healthy
          log.info('Waiting for container to start...');
          await this.sleep(5000);

          // 7. Verify container is running
          const isRunning = await this.execCommand(conn, `docker ps -q -f name=${containerName}`);
          if (!isRunning || !isRunning.trim()) {
            // Get container logs for debugging
            const logs = await this.execCommand(conn, `docker logs ${containerName} 2>&1 || echo "No logs available"`);
            const inspectResult = await this.execCommand(conn, `docker inspect ${containerName} --format='{{.State.Status}}: {{.State.Error}}' 2>&1 || echo "Container not found"`);
            
            throw new Error(`Container failed to start.\n\nStatus: ${inspectResult}\n\nLogs:\n${logs.substring(0, 500)}`);
          }
          
          log.info('[Remote] Container started successfully!');
          
          // 8. Check if service is responding (optional but recommended)
          log.info('[Remote] Verifying service health...');
          const healthCheck = await this.execCommand(conn, `curl -sf http://localhost:5890/health 2>&1 || echo "Health check not available"`);
          if (healthCheck.includes('Health check not available')) {
            log.warn('[Remote] Service health endpoint not available, but container is running');
          } else {
            log.info('[Remote] Service is healthy and responding');
          }

          clearTimeout(timeout);
          conn.end();
          
          // Clear password from memory
          this.sudoPassword = null;

          if (!isResolved) {
            isResolved = true;
            resolve({
              success: true,
              url: `http://${config.host}:5890`,
              containerName
            });
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
        readyTimeout: 30000
      });
    });
  }

  /**
   * Build Docker run command based on hardware type
   * Handles different contexts (Docker Desktop vs Docker Engine)
   */
  buildDockerRunCommand(hardwareType, containerName, imageName) {
    const baseCmd = `docker run -d --name ${containerName} --restart unless-stopped -p 5890:5890`;
    const volume = `-v claracore-${hardwareType}-downloads:/app/downloads`;

    switch (hardwareType) {
      case 'cuda':
        // For CUDA, try --gpus all (requires nvidia runtime)
        // If using Docker Engine with proper setup, this should work
        return `${baseCmd} --gpus all ${volume} ${imageName}`;

      case 'rocm':
        // AMD ROCm requires specific device access
        return `${baseCmd} --device=/dev/kfd --device=/dev/dri --group-add video --ipc=host --cap-add=SYS_PTRACE --security-opt seccomp=unconfined ${volume} ${imageName}`;

      case 'strix':
        // Strix Halo (Ryzen AI Max) uses iGPU
        return `${baseCmd} --device=/dev/dri --group-add video --security-opt seccomp=unconfined ${volume} ${imageName}`;

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
    // Ensure user is in video and render groups
    await this.execCommand(conn, 'sudo usermod -a -G video,render $USER');
  }

  /**
   * Setup Strix Halo
   */
  async setupStrix(conn) {
    // Create udev rules for GPU access
    const udevRules = `SUBSYSTEM=="kfd", GROUP="render", MODE="0666", OPTIONS+="last_rule"
SUBSYSTEM=="drm", KERNEL=="card[0-9]*", GROUP="render", MODE="0666", OPTIONS+="last_rule"`;

    await this.execCommand(conn, `echo '${udevRules}' | sudo tee /etc/udev/rules.d/99-amd-kfd.rules`);
    await this.execCommand(conn, 'sudo udevadm control --reload-rules');
    await this.execCommand(conn, 'sudo udevadm trigger');
    await this.execCommand(conn, 'sudo usermod -a -G video,render $USER');
  }

  /**
   * Execute command with sudo support (using stored password)
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
   * Execute command and stream output (for long-running commands)
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

        stream.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Command failed with code ${code}`));
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
          // Filter out sudo password prompts and sudo warnings
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
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ClaraCoreRemoteService;
