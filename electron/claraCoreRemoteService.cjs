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
          await this.execCommand(conn, runCommand);

          // 6. Wait for container to be healthy
          log.info('Waiting for container to start...');
          await this.sleep(5000);

          // 7. Verify container is running
          const isRunning = await this.execCommand(conn, `docker ps -q -f name=${containerName}`);
          if (!isRunning || !isRunning.trim()) {
            throw new Error('Container failed to start');
          }

          clearTimeout(timeout);
          conn.end();

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
        log.error('SSH connection error during deployment:', err);

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
   * Build Docker run command based on hardware type
   */
  buildDockerRunCommand(hardwareType, containerName, imageName) {
    const baseCmd = `docker run -d --name ${containerName} --restart unless-stopped -p 5890:5890`;
    const volume = `-v claracore-${hardwareType}-downloads:/app/downloads`;

    switch (hardwareType) {
      case 'cuda':
        return `${baseCmd} --gpus all ${volume} ${imageName}`;

      case 'rocm':
        return `${baseCmd} --device=/dev/kfd --device=/dev/dri --group-add video --ipc=host --cap-add=SYS_PTRACE --security-opt seccomp=unconfined ${volume} ${imageName}`;

      case 'strix':
        return `${baseCmd} --device=/dev/dri --group-add video --security-opt seccomp=unconfined ${volume} ${imageName}`;

      case 'cpu':
      default:
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
   * Install Docker
   */
  async installDocker(conn) {
    const commands = [
      'sudo apt-get update',
      'sudo apt-get install -y ca-certificates curl',
      'sudo install -m 0755 -d /etc/apt/keyrings',
      'sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc',
      'sudo chmod a+r /etc/apt/keyrings/docker.asc',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
      'sudo apt-get update',
      'sudo apt-get install -y docker-ce docker-ce-cli containerd.io',
      `sudo usermod -aG docker ${this.username || 'ubuntu'}`,
      'sudo systemctl start docker',
      'sudo systemctl enable docker'
    ];

    for (const cmd of commands) {
      await this.execCommand(conn, cmd);
    }
  }

  /**
   * Setup NVIDIA CUDA
   */
  async setupCuda(conn) {
    // Check if nvidia-docker is installed
    const hasNvidiaDocker = await this.execCommand(conn, 'which nvidia-docker 2>/dev/null');

    if (!hasNvidiaDocker) {
      log.info('Installing NVIDIA Docker runtime...');
      const commands = [
        'distribution=$(. /etc/os-release;echo $ID$VERSION_ID)',
        'curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -',
        'curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list',
        'sudo apt-get update',
        'sudo apt-get install -y nvidia-docker2',
        'sudo systemctl restart docker'
      ];

      for (const cmd of commands) {
        await this.execCommand(conn, cmd);
      }
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
   * Execute command and return output
   */
  execCommand(conn, command) {
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
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
      conn.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        stream.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Command failed with code ${code}`));
          }
        });

        stream.on('data', (data) => {
          log.info(`[Remote] ${data.toString().trim()}`);
        });

        stream.stderr.on('data', (data) => {
          log.error(`[Remote Error] ${data.toString().trim()}`);
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
