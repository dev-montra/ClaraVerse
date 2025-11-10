const { NodeSSH } = require('node-ssh');
const log = require('electron-log');

class RemoteServerService {
  constructor() {
    this.ssh = null;
  }

  /**
   * Send log to renderer process
   */
  sendLog(webContents, type, message, step = null) {
    log.info(`[RemoteServer] ${message}`);
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('remote-server:log', {
        type,
        message,
        step,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Test SSH connection
   */
  async testConnection(config) {
    const ssh = new NodeSSH();

    try {
      log.info(`Testing connection to ${config.host}...`);

      await ssh.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        tryKeyboard: true,
        readyTimeout: 30000
      });

      // Get OS info
      const osResult = await ssh.execCommand('uname -a');
      const osInfo = osResult.stdout;

      // Check Docker
      const dockerResult = await ssh.execCommand('docker --version');
      const dockerVersion = dockerResult.code === 0 ? dockerResult.stdout : null;

      // Check for running services by checking actual ports (works for Docker, bare metal, PM2, anything!)
      const runningServices = {};

      // Check ComfyUI on port 8188
      const comfyuiCheck = await ssh.execCommand('curl -s -f -o /dev/null -w "%{http_code}" http://localhost:8188 --connect-timeout 2 --max-time 3');
      if (comfyuiCheck.code === 0 && comfyuiCheck.stdout && comfyuiCheck.stdout.trim() !== '000') {
        runningServices.comfyui = {
          running: true,
          url: `http://${config.host}:8188`,
          port: 8188,
          httpStatus: comfyuiCheck.stdout.trim()
        };
      }

      // Check Python Backend on port 5001
      const pythonCheck = await ssh.execCommand('curl -s -f -o /dev/null -w "%{http_code}" http://localhost:5001 --connect-timeout 2 --max-time 3');
      if (pythonCheck.code === 0 && pythonCheck.stdout && pythonCheck.stdout.trim() !== '000') {
        runningServices.python = {
          running: true,
          url: `http://${config.host}:5001`,
          port: 5001,
          httpStatus: pythonCheck.stdout.trim()
        };
      }

      // Check N8N on port 5678
      const n8nCheck = await ssh.execCommand('curl -s -f -o /dev/null -w "%{http_code}" http://localhost:5678 --connect-timeout 2 --max-time 3');
      if (n8nCheck.code === 0 && n8nCheck.stdout && n8nCheck.stdout.trim() !== '000') {
        runningServices.n8n = {
          running: true,
          url: `http://${config.host}:5678`,
          port: 5678,
          httpStatus: n8nCheck.stdout.trim()
        };
      }

      ssh.dispose();

      return {
        success: true,
        osInfo,
        dockerVersion,
        runningServices
      };
    } catch (error) {
      log.error('Connection test failed:', error);
      if (ssh) ssh.dispose();
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deploy services to remote server
   */
  async deploy(config, webContents) {
    this.ssh = new NodeSSH();

    try {
      // Step 1: Connect
      this.sendLog(webContents, 'info', `Connecting to ${config.host}...`, 'connecting');

      await this.ssh.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        tryKeyboard: true,
        readyTimeout: 30000
      });

      this.sendLog(webContents, 'success', '✓ Connected successfully', 'checking-docker'); // Move to next step

      // Step 2: Check Docker
      this.sendLog(webContents, 'info', 'Checking Docker installation...');

      const dockerCheck = await this.ssh.execCommand('docker --version');
      if (dockerCheck.code !== 0) {
        throw new Error('Docker not found. Please install Docker on the remote server.');
      }

      this.sendLog(webContents, 'success', `✓ Docker found: ${dockerCheck.stdout}`);

      // Check if Docker daemon is running
      const dockerPs = await this.ssh.execCommand('docker ps');
      if (dockerPs.code !== 0) {
        throw new Error('Docker daemon not running. Please start Docker: sudo systemctl start docker');
      }

      this.sendLog(webContents, 'success', '✓ Docker daemon is running');

      // Step 2.5: Ensure clara_network exists and get gateway IP
      this.sendLog(webContents, 'info', 'Setting up Clara network...');

      const networkCheck = await this.ssh.execCommand('docker network ls --filter name=clara_network --format "{{.Name}}"');
      if (!networkCheck.stdout || !networkCheck.stdout.includes('clara_network')) {
        // Create clara_network with same configuration as docker-compose
        const createNetwork = await this.ssh.execCommand('docker network create clara_network --driver bridge --subnet 172.25.0.0/16');
        if (createNetwork.code === 0) {
          this.sendLog(webContents, 'success', '✓ Clara network created');
        } else {
          this.sendLog(webContents, 'warning', '⚠ Failed to create network, using existing or default');
        }
      } else {
        this.sendLog(webContents, 'success', '✓ Clara network exists');
      }

      // Get clara_network gateway IP for host.docker.internal mapping
      const gatewayResult = await this.ssh.execCommand('docker network inspect clara_network --format "{{range .IPAM.Config}}{{.Gateway}}{{end}}"');
      const claraNetworkGateway = gatewayResult.stdout ? gatewayResult.stdout.trim() : '172.25.0.1';
      this.sendLog(webContents, 'info', `Clara network gateway: ${claraNetworkGateway}`);

      // Store gateway for use in container deployment
      this.claraNetworkGateway = claraNetworkGateway;

      // Step 3: Check for existing containers
      const servicesToDeploy = Object.entries(config.services)
        .filter(([_, enabled]) => enabled)
        .map(([name, _]) => name);

      const existingServices = {};

      this.sendLog(webContents, 'info', 'Checking for existing containers...');

      for (const service of servicesToDeploy) {
        const containerName = `clara_${service}`;
        const checkResult = await this.ssh.execCommand(`docker ps -a --filter name=${containerName} --format "{{.Status}}"`);

        if (checkResult.stdout) {
          existingServices[service] = checkResult.stdout;
          if (checkResult.stdout.includes('Up')) {
            this.sendLog(webContents, 'warning', `  ⚠ ${service} is already running, stopping it first...`);
          } else {
            this.sendLog(webContents, 'info', `  → ${service} container exists but stopped, removing it...`);
          }

          // Stop and remove existing container
          await this.ssh.execCommand(`docker stop ${containerName} 2>/dev/null || true`);
          await this.ssh.execCommand(`docker rm ${containerName} 2>/dev/null || true`);
        }
      }

      this.sendLog(webContents, 'success', '✓ Ready to deploy');

      // Step 4: Pull and deploy containers
      this.sendLog(webContents, 'info', 'Pulling container images...', 'pulling-images');

      const deployedServices = {};
      let isFirstDeploy = true;

      for (const service of servicesToDeploy) {
        // Mark pulling-images as complete on first service deploy
        if (isFirstDeploy) {
          this.sendLog(webContents, 'info', `Deploying ${service}...`, 'deploying');
          isFirstDeploy = false;
        } else {
          this.sendLog(webContents, 'info', `Deploying ${service}...`);
        }

        const deployment = await this.deployService(service, webContents, config);
        if (deployment.success) {
          deployedServices[service] = {
            url: `http://${config.host}:${deployment.port}`,
            port: deployment.port,
            containerId: deployment.containerId
          };
          this.sendLog(webContents, 'success', `✓ ${service} deployed on port ${deployment.port}`);
        } else {
          this.sendLog(webContents, 'warning', `⚠ ${service} failed: ${deployment.error}`);
        }
      }

      // Step 5: Verify deployment
      this.sendLog(webContents, 'info', 'Verifying deployment...', 'verifying');

      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for containers to start

      for (const [service, info] of Object.entries(deployedServices)) {
        const status = await this.ssh.execCommand(`docker ps --filter name=clara_${service} --format "{{.Status}}"`);
        if (status.stdout.includes('Up')) {
          this.sendLog(webContents, 'success', `✓ ${service} is running`);
        } else {
          this.sendLog(webContents, 'warning', `⚠ ${service} may not be running properly`);
        }
      }

      this.ssh.dispose();
      this.ssh = null;

      return {
        success: true,
        services: deployedServices
      };

    } catch (error) {
      log.error('Deployment failed:', error);
      this.sendLog(webContents, 'error', `✗ Error: ${error.message}`, 'error');

      if (this.ssh) {
        this.ssh.dispose();
        this.ssh = null;
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deploy individual service
   */
  async deployService(serviceName, webContents, deployConfig = {}) {
    const serviceConfigs = {
      comfyui: {
        image: 'clara17verse/clara-comfyui:with-custom-nodes',
        port: 8188,
        environment: [
          'NVIDIA_VISIBLE_DEVICES=all',
          'CUDA_VISIBLE_DEVICES=0'
        ],
        runtime: '--gpus all', // Will fail gracefully on non-GPU systems
        volumes: [
          'clara_comfyui_models:/app/ComfyUI/models',
          'clara_comfyui_output:/app/ComfyUI/output',
          'clara_comfyui_input:/app/ComfyUI/input',
          'clara_comfyui_custom_nodes:/app/ComfyUI/custom_nodes',
          'clara_comfyui_temp:/app/ComfyUI/temp',
          'clara_comfyui_user:/app/ComfyUI/user'
        ]
      },
      python: {
        image: 'clara17verse/clara-backend:latest',
        port: 5001,  // External port for reference (not used in host network mode)
        environment: [
          'PYTHONUNBUFFERED=1',
          'PORT=5000',  // Host network mode - container binds to port 5000
          'HOST=0.0.0.0'
        ],
        runtime: '',
        volumes: [
          'clara_python_data:/home/clara',
          'clara_python_models:/app/models'
        ]
      },
      n8n: {
        image: 'n8nio/n8n:latest',
        port: 5678,
        environment: [
          'N8N_BASIC_AUTH_ACTIVE=true',
          'N8N_BASIC_AUTH_USER=admin',
          'N8N_BASIC_AUTH_PASSWORD=clara123',
          'N8N_HOST=0.0.0.0',
          'N8N_PORT=5678',
          'N8N_PROTOCOL=http'
          // N8N_SECURE_COOKIE will be added conditionally based on user choice
        ],
        runtime: '',
        volumes: [
          'clara_n8n_data:/home/node/.n8n'
        ]
      }
    };

    const config = serviceConfigs[serviceName];
    if (!config) {
      return { success: false, error: 'Unknown service' };
    }

    // Handle N8N secure cookie configuration
    if (serviceName === 'n8n') {
      log.info(`[RemoteServer] N8N deployment - n8nSecureCookie setting: ${deployConfig.n8nSecureCookie}`);

      // If n8nSecureCookie is explicitly false, disable secure cookies for HTTP
      // If n8nSecureCookie is true or undefined, use default (secure cookies enabled)
      if (deployConfig.n8nSecureCookie === false) {
        config.environment.push('N8N_SECURE_COOKIE=false');
        this.sendLog(webContents, 'info', `  → Configuring N8N for HTTP (secure cookies disabled)`);
      } else {
        config.environment.push('N8N_SECURE_COOKIE=true');
        this.sendLog(webContents, 'info', `  → Configuring N8N with secure cookies (HTTPS required)`);
      }
    }

    try {
      this.sendLog(webContents, 'info', `  → Pulling ${config.image}...`);

      // Pull image (this might take time)
      const pullResult = await this.ssh.execCommand(`docker pull ${config.image}`, {
        onStdout: (chunk) => {
          // Stream pull progress
          const message = chunk.toString('utf8').trim();
          if (message) {
            this.sendLog(webContents, 'info', `    ${message}`);
          }
        }
      });

      if (pullResult.code !== 0) {
        return { success: false, error: pullResult.stderr };
      }

      this.sendLog(webContents, 'success', `  ✓ Image pulled`);
      this.sendLog(webContents, 'info', `  → Starting container...`);

      // Build docker run command
      const envVars = config.environment.map(e => `-e ${e}`).join(' ');
      const runtime = config.runtime || '';
      const containerName = `clara_${serviceName}`;

      // Determine internal port (container port) - Python backend runs on 5000 internally
      const internalPort = config.port === 5001 ? 5000 : config.port;

      // Python backend uses host network to access ClaraCore via host IP
      // Other services use clara_network for container-to-container communication
      const networkMode = serviceName === 'python' ? 'host' : 'clara_network';
      const portMapping = serviceName === 'python' ? '' : `-p ${config.port}:${internalPort}`;

      // Build volume mounts for data persistence
      const volumeMounts = config.volumes ? config.volumes.map(v => `-v ${v}`).join(' ') : '';
      if (volumeMounts) {
        this.sendLog(webContents, 'info', `  → Configuring persistent storage (${config.volumes.length} volumes)`);
      }

      const runCommand = `docker run -d --name ${containerName} --network ${networkMode} ${portMapping} ${volumeMounts} ${envVars} ${runtime} --restart unless-stopped ${config.image}`;

      const runResult = await this.ssh.execCommand(runCommand);

      if (runResult.code !== 0) {
        // Try without GPU if it fails
        if (runtime.includes('gpus')) {
          this.sendLog(webContents, 'warning', `  ⚠ GPU not available, trying CPU mode...`);
          const cpuCommand = runCommand.replace('--gpus all', '');
          const cpuResult = await this.ssh.execCommand(cpuCommand);

          if (cpuResult.code !== 0) {
            return { success: false, error: cpuResult.stderr };
          }

          // For host network mode, report the actual port the service runs on
          const actualPort = serviceName === 'python' ? internalPort : config.port;
          return {
            success: true,
            port: actualPort,
            containerId: cpuResult.stdout.trim()
          };
        }

        return { success: false, error: runResult.stderr };
      }

      // For host network mode, report the actual port the service runs on
      const actualPort = serviceName === 'python' ? internalPort : config.port;
      return {
        success: true,
        port: actualPort,
        containerId: runResult.stdout.trim()
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop a service
   */
  async stopService(config, serviceName) {
    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password
      });

      const containerName = `clara_${serviceName}`;
      await ssh.execCommand(`docker stop ${containerName}`);
      await ssh.execCommand(`docker rm ${containerName}`);

      ssh.dispose();

      return { success: true };
    } catch (error) {
      if (ssh) ssh.dispose();
      return { success: false, error: error.message };
    }
  }
}

module.exports = RemoteServerService;
