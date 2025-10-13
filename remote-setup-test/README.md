# Clara Remote Setup Test

Simple test to verify SSH + Docker deployment works before building the full feature.

## What This Tests

1. ✅ SSH connection to remote server
2. ✅ Docker is installed and running
3. ✅ Can deploy a container remotely
4. ✅ Can access the container from your machine
5. ✅ Container health and logs

## Setup

```bash
cd remote-setup-test
npm install
```

## Usage

```bash
node test-deploy.js <your-raspberry-pi-password>
```

Example:
```bash
node test-deploy.js mypassword
```

## What It Does

1. **Connects to your Raspberry Pi** via SSH (192.168.1.100)
2. **Checks Docker** installation
3. **Deploys nginx container** on port 8080 (lightweight, won't kill your Pi)
4. **Tests HTTP connection** from your machine
5. **Shows container logs**

## Expected Output

```
🚀 Clara Remote Docker Setup Test

✓ Connected to 192.168.1.100
✓ Docker found: Docker version 20.10.21
✓ Docker daemon is running
✓ Cleanup complete
✓ Container deployed: a1b2c3d4e5f6
✓ Container is running
✓ Container info retrieved
✓ Successfully connected to container! Status: 200
✓ Logs retrieved

✅ TEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ SSH Connection: Success
✓ Docker Available: Yes
✓ Container Deployed: Yes
✓ HTTP Connection: Success
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can access the test server at: http://192.168.1.100:8080
```

## What This Proves

If this works, then Clara can:
- SSH into any server you provide
- Deploy Docker containers automatically
- Connect to remote services
- **= Your remote backend setup will work**

## Next Steps

Once this test passes:
1. Build UI for SSH credentials in Clara
2. Replace nginx with your ClaraVerse backend containers
3. Save connection details
4. Switch URLs from localhost to remote server

## Cleanup

The script creates a container called `clara-test-nginx` on port 8080.

To remove it:
```bash
ssh raspberry@192.168.1.100 "docker stop clara-test-nginx && docker rm clara-test-nginx"
```

Or just run the test again - it auto-cleans up old containers.
