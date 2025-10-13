# Remote Server Setup Integration Guide

## What We Built

A complete remote server deployment system with:
- ✅ UI Component (`src/components/Settings/RemoteServerSetup.tsx`)
- ✅ Electron Service (`electron/remoteServerService.cjs`)
- ✅ IPC Handlers (`electron/remoteServerIPC.cjs`)
- ✅ Preload API (already added to `electron/preload.cjs`)
- ✅ TypeScript types (`src/types/remoteServer.ts`)
- ✅ Test script (works! tested with your Raspberry Pi)

## To Complete Integration

### Step 1: Add to `electron/main.cjs`

Find where services are initialized (around line 30-40) and add:

```javascript
const { setupRemoteServerIPC } = require('./remoteServerIPC.cjs');
```

Then find where IPC handlers are set up (search for `ipcMain.handle`) and add:

```javascript
// Setup remote server IPC handlers
setupRemoteServerIPC(mainWindow);
```

### Step 2: Add to Settings Component

In `src/components/Settings.tsx`, import and add the RemoteServerSetup:

```typescript
import RemoteServerSetup from './Settings/RemoteServerSetup';

// Then add a new section in the settings:
<Section title="Remote Server">
  <RemoteServerSetup />
</Section>
```

## How It Works

### User Flow:
1. User opens Settings → Remote Server
2. Enters SSH details (IP, username, password)
3. Clicks "Test Connection" (optional but recommended)
4. Clicks "Deploy Backend"
5. **LIVE LOGS STREAM** showing what's happening
6. Services deploy to remote server
7. Clara automatically switches to use remote URLs

### Technical Flow:
```
Frontend (RemoteServerSetup.tsx)
    ↓ window.remoteServer.deploy()
Preload (preload.cjs)
    ↓ IPC invoke
IPC Handler (remoteServerIPC.cjs)
    ↓
Service (remoteServerService.cjs)
    ↓ SSH + Docker commands
Remote Server
```

### Live Log Streaming:
```javascript
// Service sends logs during deployment
webContents.send('remote-server:log', {
  type: 'info',
  message: 'Deploying ComfyUI...',
  step: 'deploying'
});

// UI receives and displays instantly
window.remoteServer.onLog((log) => {
  addLog(log.type, log.message);
});
```

## What Gets Deployed

Based on user selection:
- **ComfyUI**: `clara17verse/clara-comfyui:with-custom-nodes` on port 8188
- **Python Backend**: `clara17verse/clara-backend:latest` on port 5001
- **N8N**: `n8nio/n8n:latest` on port 5678

## Saved Configuration

After deployment, saves to electron-store:
```json
{
  "serverMode": "remote",
  "remoteServer": {
    "host": "192.168.1.100",
    "username": "raspberry",
    "services": {
      "comfyui": {
        "url": "http://192.168.1.100:8188",
        "port": 8188,
        "containerId": "abc123..."
      }
    },
    "isConnected": true
  }
}
```

## Next: Make Clara Use Remote URLs

After this works, we need to update Clara's API calls to check `serverMode`:

```typescript
// Instead of hardcoded localhost
const comfyURL = 'http://localhost:8188';

// Use helper function
const getServiceURL = async (service: string) => {
  const mode = await window.electron.store.get('serverMode');
  if (mode === 'remote') {
    const config = await window.electron.store.get('remoteServer');
    return config.services[service]?.url;
  }
  return `http://localhost:${getPortForService(service)}`;
};
```

## Testing

Already tested with your Raspberry Pi:
```bash
cd remote-setup-test
node test-deploy.js raspberrypi
```

Result: ✅ All green, container deployed, HTTP connection works!

## UI Features

- **Real-time log streaming** (you see exactly what's happening)
- **Progress indicators** (connecting → checking → deploying → complete)
- **Error handling** (shows exactly what failed and why)
- **Connection testing** (test before deploying)
- **Service selection** (choose which services to deploy)
- **Switch back to local** (one click to go back)

## Why This Is Cool

1. **No manual SSH** - Clara does it all
2. **Live feedback** - See every step
3. **Fool-proof** - Validates everything
4. **Saves config** - Connect once, use forever
5. **Your use case**: Server at home in India, access from anywhere

## File Structure

```
Clara
├── src/
│   ├── components/
│   │   └── Settings/
│   │       └── RemoteServerSetup.tsx  ← UI Component
│   └── types/
│       └── remoteServer.ts  ← TypeScript types
├── electron/
│   ├── remoteServerService.cjs  ← SSH + Docker logic
│   ├── remoteServerIPC.cjs  ← IPC handlers
│   └── preload.cjs  ← API exposed (already done)
└── remote-setup-test/  ← Test scripts (proof it works)
```

## What's Left

1. ✅ Build UI
2. ✅ Build backend service
3. ✅ Add IPC handlers
4. ✅ Test with Raspberry Pi
5. ⏳ Integrate into main.cjs (2 lines of code)
6. ⏳ Add to Settings page
7. ⏳ Update Clara to use remote URLs when in remote mode

Ready to test!
