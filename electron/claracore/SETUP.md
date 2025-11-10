# ClaraCore Setup Guide

This guide covers installation, configuration, and getting started with ClaraCore.

## 🚀 Quick Installation

### Option 1: Automated Installation (Recommended)

#### Linux and macOS
```bash
curl -fsSL https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/install.sh | bash
```

**Note**: For containers, WSL, or systemd-less environments, see our [Container Setup Guide](CONTAINER_SETUP.md).

Or download and run manually:
```bash
wget https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/install.sh
chmod +x install.sh
./install.sh
```

#### Windows (PowerShell as Administrator)
```powershell
irm https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/install.ps1 | iex
```

Or download and run manually:
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/install.ps1" -OutFile "install.ps1"
.\install.ps1
```

**Installation Features:**
- Downloads latest release automatically
- Sets up system service for auto-start
- Creates default configuration
- Adds to system PATH
- Creates desktop shortcut (Windows)

### Option 2: Manual Installation

#### Download Binary

**Windows:**
```powershell
# Download the latest release
curl -L -o claracore.exe https://github.com/badboysm890/ClaraCore/releases/latest/download/claracore-windows-amd64.exe

# Or build from source
python build.py
```

**Linux/macOS:**
```bash
# Download the latest release
curl -L -o claracore https://github.com/badboysm890/ClaraCore/releases/latest/download/claracore-linux-amd64
chmod +x claracore

# Or build from source
go build -o claracore .
```

### 2. Quick Setup

#### After Installation

If you used the automated installer, ClaraCore is ready to use:

1. **Start the service** (if not auto-started):
   ```bash
   # Linux/macOS
   sudo systemctl start claracore
   
   # Windows
   Start-Service ClaraCore
   ```

2. **Configure models**:
   ```bash
   # Point to your models folder
   claracore --models-folder /path/to/your/gguf/models
   
   # Or use the web interface
   # Visit: http://localhost:5800/ui/setup
   ```

#### Manual Setup

**Automatic Setup (Recommended):**
```bash
# Point ClaraCore at your models folder - it does the rest!
./claracore --models-folder /path/to/your/gguf/models

# For specific backend
./claracore --models-folder /path/to/models --backend vulkan
```

**Manual Setup:**
```bash
# 1. Start ClaraCore
./claracore

# 2. Open web interface
# Visit: http://localhost:5800/ui/setup

# 3. Follow the setup wizard
# - Add model folders
# - Select backend (CUDA/Vulkan/ROCm/Metal/CPU)
# - Configure system settings
# - Generate configuration
```

### 3. Verify Installation

```bash
# Test version info (should show proper version as of v0.1.1+)
claracore --version

# Check if models are loaded
curl http://localhost:5800/v1/models

# Test chat completion
curl -X POST http://localhost:5800/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

---

## 🎯 Setup Options

### Command Line Arguments

```bash
./claracore [options]

Options:
  --models-folder string     Path to GGUF models folder
  --backend string          Force backend (cuda/rocm/vulkan/metal/cpu)
  --port int               Server port (default: 5800)
  --host string            Server host (default: 127.0.0.1)
  --config string          Config file path (default: config.yaml)
  --vram float             Override VRAM detection (GB)
  --ram float              Override RAM detection (GB)
  --context int            Preferred context length
  --help                   Show help message
```

### Environment Variables

```bash
export CLARA_MODELS_FOLDER="/path/to/models"
export CLARA_BACKEND="vulkan"
export CLARA_PORT="5800"
export CLARA_VRAM="8.0"
export CLARA_RAM="16.0"
```

---

## 🖥️ Backend Selection

ClaraCore automatically detects your hardware, but you can override:

### NVIDIA GPUs
```bash
# CUDA (recommended for NVIDIA)
./claracore --models-folder /path/to/models --backend cuda

# Vulkan (universal, good fallback)
./claracore --models-folder /path/to/models --backend vulkan
```

### AMD GPUs
```bash
# ROCm (Linux only, for AMD GPUs)
./claracore --models-folder /path/to/models --backend rocm

# Vulkan (cross-platform, good for AMD)
./claracore --models-folder /path/to/models --backend vulkan
```

### Apple Silicon
```bash
# Metal (macOS M1/M2/M3)
./claracore --models-folder /path/to/models --backend metal
```

### CPU Only
```bash
# CPU fallback (slower but works everywhere)
./claracore --models-folder /path/to/models --backend cpu
```

---

## 📁 Model Organization

### Supported Formats
- **GGUF files** (`.gguf`) - Primary format
- **Quantized models** (Q4_K_M, Q5_K_S, Q8_0, etc.)
- **Full precision** (F16, F32)

### Folder Structure Examples

**Simple Structure:**
```
/home/user/models/
├── llama-3.2-3b-instruct.Q4_K_M.gguf
├── mistral-7b-v0.3.Q5_K_S.gguf
└── phi-3.5-mini-instruct.Q4_K_M.gguf
```

**Organized Structure:**
```
/home/user/models/
├── llama/
│   ├── llama-3.2-3b-instruct.Q4_K_M.gguf
│   └── llama-3.2-1b-instruct.Q4_K_M.gguf
├── mistral/
│   └── mistral-7b-v0.3.Q5_K_S.gguf
└── microsoft/
    └── phi-3.5-mini-instruct.Q4_K_M.gguf
```

### Model Naming Conventions

ClaraCore automatically extracts model information from filenames:

- **Model Name**: `llama-3.2-3b-instruct`
- **Quantization**: `Q4_K_M`, `Q5_K_S`, `F16`
- **Type Detection**: `instruct`, `chat`, `base`
- **Draft Models**: Automatically pairs larger models with smaller ones for speculative decoding

---

## ⚙️ Configuration

### Web Interface Setup

1. **Start ClaraCore**: `./claracore`
2. **Open Browser**: `http://localhost:5800/ui/setup`
3. **Follow Wizard**:
   - **Step 1**: Add model folders
   - **Step 2**: System detection
   - **Step 3**: Backend and memory configuration
   - **Step 4**: Generate and apply configuration

### Manual Configuration

**System Settings** (`settings.json`):
```json
{
  "gpuType": "nvidia",
  "backend": "cuda",
  "vramGB": 10.0,
  "ramGB": 32.0,
  "preferredContext": 8192,
  "throughputFirst": true,
  "enableJinja": true,
  "requireApiKey": false
}
```

**Model Folders** (`model_folders.json`):
```json
{
  "folders": [
    {
      "path": "/home/user/models",
      "enabled": true,
      "recursive": true,
      "addedAt": "2025-01-01T12:00:00Z"
    }
  ]
}
```

---

## 🔧 Advanced Configuration

### Performance Optimization

**High Memory System (32GB+ RAM):**
```bash
./claracore --models-folder /path/to/models \
  --backend cuda \
  --context 32768 \
  --ram 32.0
```

**Low Memory System (8GB RAM):**
```bash
./claracore --models-folder /path/to/models \
  --backend vulkan \
  --context 4096 \
  --ram 8.0
```

### Multiple Model Folders

```bash
# Add multiple folders via API
curl -X POST http://localhost:5800/api/config/folders \
  -H "Content-Type: application/json" \
  -d '{
    "folderPaths": [
      "/home/user/models/llama",
      "/home/user/models/mistral",
      "/mnt/storage/models"
    ],
    "recursive": true
  }'
```

### Custom Binary Path

```bash
# Use custom llama-server binary
./claracore --binary-path /custom/path/to/llama-server
```

---

## 🌐 Web Interface Features

### Available Pages

- **`/ui/setup`** - Initial setup wizard
- **`/ui/models`** - Model management and chat interface
- **`/ui/configuration`** - Edit model parameters and settings
- **`/ui/downloads`** - Download models from Hugging Face
- **`/ui/settings`** - System preferences
- **`/ui/activity`** - Logs and system activity

### Key Features

- **Real-time Progress**: Setup operations show live progress
- **Restart Prompts**: Automatic prompts when configuration changes
- **Hardware Detection**: Visual system information display
- **Model Chat**: Test models directly in the interface
- **Download Manager**: Queue and manage model downloads

---

## 🔍 Troubleshooting

### Windows Security Issues

**Error: "An Application Control policy has blocked this file"**

This is Windows security protection, not malware. ClaraCore is safe! Solutions:

1. **Run the troubleshooter first:**
   ```powershell
   .\scripts\troubleshoot.ps1 -UnblockFile
   ```

2. **Manual unblock**:
   ```powershell
   Unblock-File "$env:LOCALAPPDATA\ClaraCore\claracore.exe"
   ```

3. **If still blocked, disable Windows Defender Application Control:**
   - Open Windows Security (search "Windows Security" in Start menu)
   - Go to "App & browser control"
   - Click "Reputation-based protection settings"
   - Turn OFF "Check apps and files"
   - Re-enable after installation for security

4. **Alternative - Build from source**:
   ```powershell
   git clone https://github.com/claraverse-space/ClaraCore.git
   cd ClaraCore
   python build.py
   .\claracore.exe
   ```

5. **Service issues**:
   ```powershell
   .\scripts\troubleshoot.ps1 -FixService
   ```

3. **Run as Administrator**:
   ```powershell
   Start-Process -Verb RunAs -FilePath "$env:LOCALAPPDATA\ClaraCore\claracore.exe"
   ```

4. **Add to Windows Defender exclusions**:
   - Windows Security > Virus & threat protection > Exclusions
   - Add folder: `%LOCALAPPDATA%\ClaraCore`

### Common Issues

**1. "claracore: command not found"**
```bash
# Quick fix - add to current session:
export PATH="$HOME/.local/bin:$PATH"

# Automatic fix script:
curl -fsSL https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/fix-path.sh | bash

# Manual fix - restart terminal or run:
source ~/.bashrc

# Verify it works:
claracore --version
```

**2. Models Not Detected**
```bash
# Check folder permissions
ls -la /path/to/models

# Verify GGUF files exist
find /path/to/models -name "*.gguf"

# Scan folder manually
curl -X POST http://localhost:5800/api/config/scan-folder \
  -H "Content-Type: application/json" \
  -d '{"folderPath": "/path/to/models", "recursive": true}'
```

**2. Backend Issues**
```bash
# Check system detection
curl http://localhost:5800/api/system/detection

# Force different backend
./claracore --models-folder /path/to/models --backend cpu
```

**3. Memory Problems**
```bash
# Reduce context length
curl -X POST http://localhost:5800/api/settings/system \
  -H "Content-Type: application/json" \
  -d '{"preferredContext": 2048, "vramGB": 4.0}'
```

**4. Binary Download Failures**
```bash
# Check binary status
ls -la binaries/llama-server/

# Manual binary download
curl -X POST http://localhost:5800/api/models/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/ggml-org/llama.cpp/releases/latest"}'
```

### Debug Mode

```bash
# Enable verbose logging
./claracore --debug --models-folder /path/to/models

# Check logs in real-time
curl -N http://localhost:5800/api/events
```

### Reset Configuration

```bash
# Backup current config
cp config.yaml config.yaml.backup

# Reset to defaults
rm config.yaml settings.json model_folders.json

# Restart and reconfigure
./claracore --models-folder /path/to/models
```

---

## 🔧 Service Management

If you installed using the automated installer, ClaraCore runs as a system service.

### Linux/macOS Service Commands

**Using systemctl (Linux):**
```bash
# Check status
sudo systemctl status claracore

# Start/stop/restart
sudo systemctl start claracore
sudo systemctl stop claracore
sudo systemctl restart claracore

# Enable/disable auto-start
sudo systemctl enable claracore
sudo systemctl disable claracore

# View logs
sudo journalctl -u claracore -f
```

**Using launchctl (macOS):**
```bash
# Check status
sudo launchctl list | grep claracore

# Start/stop
sudo launchctl load /Library/LaunchDaemons/com.claracore.server.plist
sudo launchctl unload /Library/LaunchDaemons/com.claracore.server.plist

# View logs
tail -f /var/log/system.log | grep claracore
```

**Cross-platform service script:**
```bash
# Download service management script
wget https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/claracore-service.sh
chmod +x claracore-service.sh

# Use the service script
sudo ./claracore-service.sh status
sudo ./claracore-service.sh start
sudo ./claracore-service.sh stop
sudo ./claracore-service.sh restart
sudo ./claracore-service.sh logs
```

### Windows Service Commands

**Using PowerShell:**
```powershell
# Check status
Get-Service ClaraCore

# Start/stop/restart
Start-Service ClaraCore
Stop-Service ClaraCore
Restart-Service ClaraCore

# View logs
Get-EventLog -LogName Application -Source ClaraCore -Newest 50
```

**Using Services Manager:**
1. Press `Win + R`, type `services.msc`
2. Find "ClaraCore AI Inference Server"
3. Right-click for options

### Uninstallation

**Linux/macOS:**
```bash
# Download uninstall script
wget https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/uninstall.sh
chmod +x uninstall.sh

# Uninstall (keeps config)
sudo ./uninstall.sh

# Uninstall and remove config
sudo ./uninstall.sh --remove-config
```

**Windows:**
```powershell
# Download uninstall script
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/claraverse-space/ClaraCore/main/scripts/uninstall.ps1" -OutFile "uninstall.ps1"

# Uninstall (keeps config)
.\uninstall.ps1

# Uninstall and remove config
.\uninstall.ps1 -RemoveConfig

# Force uninstall without prompts
.\uninstall.ps1 -RemoveConfig -Force
```

---

## 📊 Performance Tips

### Model Selection
- **For Chat**: Use instruct/chat models (Llama, Mistral, Phi)
- **For Speed**: Q4_K_M quantization offers good speed/quality balance
- **For Quality**: Q8_0 or F16 for highest quality (slower)
- **For Memory**: Q3_K_S or Q4_0 for lower memory usage

### Hardware Optimization
- **NVIDIA**: Use CUDA backend with high GPU layers
- **AMD**: Use ROCm (Linux) or Vulkan
- **Intel**: Use Vulkan or CPU backend
- **Apple**: Use Metal backend on M1/M2/M3

### Context Length
- **Interactive Chat**: 4096-8192 tokens
- **Document Analysis**: 16384-32768 tokens
- **Code Generation**: 8192-16384 tokens

---

## 🔗 Next Steps

1. **Explore the API**: Check out the [Complete API Documentation](API_COMPREHENSIVE.md)
2. **Join the Community**: [GitHub Discussions](https://github.com/badboysm890/ClaraCore/discussions)
3. **Report Issues**: [GitHub Issues](https://github.com/badboysm890/ClaraCore/issues)
4. **Contribute**: See [Contributing Guidelines](../CONTRIBUTING.md)

---

**Need help?** Join our community or open an issue on GitHub!