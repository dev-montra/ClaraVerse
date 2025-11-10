const { NodeSSH } = require('node-ssh');
const chalk = require('chalk');
const ora = require('ora');
const http = require('http');

// Configuration
const SSH_CONFIG = {
  host: '192.168.1.100',
  username: 'raspberry',
  password: '', // You'll enter this when running
  port: 22
};

const TEST_CONTAINER_NAME = 'clara-test-nginx';
const TEST_PORT = 8080;

class RemoteDockerTest {
  constructor(sshConfig) {
    this.ssh = new NodeSSH();
    this.config = sshConfig;
  }

  async connect() {
    const spinner = ora('Connecting to remote server...').start();
    try {
      await this.ssh.connect(this.config);
      spinner.succeed(chalk.green(`Connected to ${this.config.host}`));
      return true;
    } catch (error) {
      spinner.fail(chalk.red(`Failed to connect: ${error.message}`));
      return false;
    }
  }

  async checkDocker() {
    const spinner = ora('Checking Docker installation...').start();
    try {
      const result = await this.ssh.execCommand('docker --version');
      if (result.code === 0) {
        spinner.succeed(chalk.green(`Docker found: ${result.stdout}`));
        return true;
      } else {
        spinner.fail(chalk.red('Docker not found'));
        console.log(chalk.yellow('Install Docker with: curl -fsSL https://get.docker.com | sh'));
        return false;
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error checking Docker: ${error.message}`));
      return false;
    }
  }

  async checkDockerRunning() {
    const spinner = ora('Checking if Docker daemon is running...').start();
    try {
      const result = await this.ssh.execCommand('docker ps');
      if (result.code === 0) {
        spinner.succeed(chalk.green('Docker daemon is running'));
        return true;
      } else {
        spinner.fail(chalk.red('Docker daemon not running'));
        console.log(chalk.yellow('Start Docker with: sudo systemctl start docker'));
        return false;
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      return false;
    }
  }

  async cleanupOldContainer() {
    const spinner = ora('Cleaning up old test container...').start();
    try {
      // Stop if running
      await this.ssh.execCommand(`docker stop ${TEST_CONTAINER_NAME} 2>/dev/null || true`);
      // Remove if exists
      await this.ssh.execCommand(`docker rm ${TEST_CONTAINER_NAME} 2>/dev/null || true`);
      spinner.succeed(chalk.green('Cleanup complete'));
    } catch (error) {
      spinner.warn(chalk.yellow('Cleanup had issues (probably fine)'));
    }
  }

  async deployTestContainer() {
    const spinner = ora('Deploying test container (nginx)...').start();
    try {
      // Run a simple nginx container
      const command = `docker run -d --name ${TEST_CONTAINER_NAME} -p ${TEST_PORT}:80 nginx:alpine`;
      const result = await this.ssh.execCommand(command);

      if (result.code === 0) {
        const containerId = result.stdout.trim();
        spinner.succeed(chalk.green(`Container deployed: ${containerId.substring(0, 12)}`));
        return containerId;
      } else {
        spinner.fail(chalk.red(`Deployment failed: ${result.stderr}`));
        return null;
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error deploying: ${error.message}`));
      return null;
    }
  }

  async getContainerInfo() {
    const spinner = ora('Getting container details...').start();
    try {
      const result = await this.ssh.execCommand(
        `docker inspect ${TEST_CONTAINER_NAME} --format='{{.State.Status}} {{range .NetworkSettings.Ports}}{{.}}{{end}}'`
      );

      if (result.code === 0) {
        spinner.succeed(chalk.green('Container info retrieved'));
        console.log(chalk.cyan('Container details:'), result.stdout);
        return result.stdout;
      } else {
        spinner.fail(chalk.red('Failed to get container info'));
        return null;
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      return null;
    }
  }

  async checkContainerHealth() {
    const spinner = ora('Checking container health...').start();
    try {
      // Wait a bit for container to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await this.ssh.execCommand(`docker ps --filter name=${TEST_CONTAINER_NAME} --format "{{.Status}}"`);

      if (result.code === 0 && result.stdout.includes('Up')) {
        spinner.succeed(chalk.green('Container is running'));
        return true;
      } else {
        spinner.fail(chalk.red('Container not running'));
        return false;
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      return false;
    }
  }

  async testHTTPConnection() {
    const spinner = ora(`Testing HTTP connection to ${this.config.host}:${TEST_PORT}...`).start();

    return new Promise((resolve) => {
      const options = {
        hostname: this.config.host,
        port: TEST_PORT,
        path: '/',
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          spinner.succeed(chalk.green(`Successfully connected to container! Status: ${res.statusCode}`));
          resolve(true);
        } else {
          spinner.warn(chalk.yellow(`Connected but got status: ${res.statusCode}`));
          resolve(true);
        }
      });

      req.on('error', (error) => {
        spinner.fail(chalk.red(`Connection failed: ${error.message}`));
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        spinner.fail(chalk.red('Connection timeout'));
        resolve(false);
      });

      req.end();
    });
  }

  async getContainerLogs() {
    const spinner = ora('Fetching container logs...').start();
    try {
      const result = await this.ssh.execCommand(`docker logs ${TEST_CONTAINER_NAME} --tail 20`);
      spinner.succeed(chalk.green('Logs retrieved'));
      console.log(chalk.cyan('\nContainer logs:'));
      console.log(result.stdout || result.stderr);
    } catch (error) {
      spinner.fail(chalk.red(`Error getting logs: ${error.message}`));
    }
  }

  disconnect() {
    this.ssh.dispose();
    console.log(chalk.blue('\nSSH connection closed'));
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.blue('\n🚀 Clara Remote Docker Setup Test\n'));

  // Get password from command line or prompt
  const password = process.argv[2];
  if (!password) {
    console.log(chalk.red('Usage: node test-deploy.js <password>'));
    console.log(chalk.yellow('Example: node test-deploy.js yourpassword'));
    process.exit(1);
  }

  SSH_CONFIG.password = password;

  const tester = new RemoteDockerTest(SSH_CONFIG);

  try {
    // Step 1: Connect
    if (!await tester.connect()) {
      process.exit(1);
    }

    // Step 2: Check Docker
    if (!await tester.checkDocker()) {
      process.exit(1);
    }

    // Step 3: Check Docker daemon
    if (!await tester.checkDockerRunning()) {
      process.exit(1);
    }

    // Step 4: Cleanup old test
    await tester.cleanupOldContainer();

    // Step 5: Deploy test container
    const containerId = await tester.deployTestContainer();
    if (!containerId) {
      process.exit(1);
    }

    // Step 6: Check container health
    if (!await tester.checkContainerHealth()) {
      await tester.getContainerLogs();
      process.exit(1);
    }

    // Step 7: Get container info
    await tester.getContainerInfo();

    // Step 8: Test HTTP connection
    const connected = await tester.testHTTPConnection();

    // Step 9: Show logs
    await tester.getContainerLogs();

    // Summary
    console.log(chalk.bold.green('\n✅ TEST SUMMARY'));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green('✓ SSH Connection: Success'));
    console.log(chalk.green('✓ Docker Available: Yes'));
    console.log(chalk.green('✓ Container Deployed: Yes'));
    console.log(connected ? chalk.green('✓ HTTP Connection: Success') : chalk.red('✗ HTTP Connection: Failed'));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.cyan(`\nYou can access the test server at: http://${SSH_CONFIG.host}:${TEST_PORT}`));
    console.log(chalk.yellow(`\nTo cleanup: ssh ${SSH_CONFIG.username}@${SSH_CONFIG.host} "docker stop ${TEST_CONTAINER_NAME} && docker rm ${TEST_CONTAINER_NAME}"`));

  } catch (error) {
    console.error(chalk.red('\n❌ Unexpected error:'), error.message);
  } finally {
    tester.disconnect();
  }
}

main();
