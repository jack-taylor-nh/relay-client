# Ollama Bundled Binaries

This directory contains platform-specific Ollama binaries that are bundled with Relay Station for zero-configuration AI.

## Directory Structure

```
resources/ollama/
├── win/          # Windows binaries
│   └── ollama.exe
├── mac/          # macOS binaries (ARM64 + x64 universal)
│   └── ollama
└── linux/        # Linux binaries (x64)
    └── ollama
```

## Obtaining Ollama Binaries

### Automated Download (Recommended)

Run the download script to automatically fetch the latest Ollama binaries:

```bash
# From llm-bridge directory
npm run download-ollama
```

This will:
1. Fetch latest Ollama releases from GitHub
2. Download platform-specific binaries
3. Verify checksums
4. Place binaries in correct directories

### Manual Download

If you need to download manually:

**Windows:**
```bash
# Download from https://github.com/ollama/ollama/releases
# Extract ollama.exe to resources/ollama/win/
curl -L https://github.com/ollama/ollama/releases/download/v0.X.X/ollama-windows-amd64.zip -o ollama-win.zip
unzip ollama-win.zip -d resources/ollama/win/
```

**macOS:**
```bash
# Download universal binary (ARM64 + Intel)
curl -L https://github.com/ollama/ollama/releases/download/v0.X.X/ollama-darwin -o resources/ollama/mac/ollama
chmod +x resources/ollama/mac/ollama
```

**Linux:**
```bash
# Download x64 binary
curl -L https://github.com/ollama/ollama/releases/download/v0.X.X/ollama-linux-amd64 -o resources/ollama/linux/ollama
chmod +x resources/ollama/linux/ollama
```

## Security & Verification

### Checksum Verification

Always verify downloaded binaries:

```bash
# Windows
certutil -hashfile resources/ollama/win/ollama.exe SHA256

# macOS/Linux
shasum -a 256 resources/ollama/mac/ollama
shasum -a 256 resources/ollama/linux/ollama
```

Compare checksums with official releases: https://github.com/ollama/ollama/releases

### Code Signing

- Windows binaries should be code-signed by Ollama
- macOS binaries should pass Gatekeeper verification
- Linux binaries verified via checksums

## Licensing

Ollama is licensed under the MIT License.
See: https://github.com/ollama/ollama/blob/main/LICENSE

By bundling Ollama, we comply with:
- MIT License attribution requirement (included in app)
- Redistribution terms (unmodified binaries only)
- No warranty disclaimers (documented in Relay Station license)

## Build System Integration

These binaries are packaged by electron-builder based on target platform:

**package.json (electron-builder config):**
```json
{
  "build": {
    "extraResources": [
      {
        "from": "resources/ollama/${os}",
        "to": "ollama",
        "filter": ["**/*"]
      }
    ]
  }
}
```

At runtime, Relay Station detects the bundled binary location:
- **Windows:** `resources/ollama/ollama.exe`
- **macOS:** `resources/ollama/ollama`
- **Linux:** `resources/ollama/ollama`

## Version Management

**Current bundled version:** To be determined on first download

**Update strategy:**
- Major releases: Manual update + changelog review
- Minor/patch: Automated via CI/CD
- Security patches: Immediate update + re-release

## Fallback Strategy

If bundled Ollama fails to start, Relay Station will:
1. Check for system-installed Ollama (`ollama` in PATH)
2. Prompt user to install Ollama manually
3. Allow manual path configuration in settings

## Development Mode

During development (`npm run dev`), Relay Station will:
- First try bundled binary (if present)
- Fall back to system Ollama
- Log which Ollama instance is being used

This allows developers to work without bundling binaries during iteration.

## CI/CD Integration

GitHub Actions workflow will:
1. Download Ollama binaries for all platforms
2. Verify checksums against known-good values
3. Build Relay Station with bundled binaries
4. Sign and notarize releases
5. Upload to releases page

## Disk Space Considerations

**Binary sizes (approximate):**
- Windows: ~120 MB (ollama.exe)
- macOS: ~150 MB (universal binary)
- Linux: ~110 MB (x64 binary)

**Total bundled app size estimates:**
- Windows installer: ~180 MB
- macOS DMG: ~210 MB
- Linux AppImage: ~170 MB

Users should have at least **5 GB free space** for:
- Application binaries (~200 MB)
- Ollama models (varies, 1-10 GB per model)
- System overhead (500 MB)

## Troubleshooting

### Ollama won't start
- Check binary has execute permissions (macOS/Linux)
- Verify no port conflicts on 11434
- Check antivirus isn't blocking (Windows)
- Review logs in Relay Station's app data folder

### Binary not found after build
- Verify `resources/ollama/${platform}` directory exists
- Check electron-builder `extraResources` config
- Ensure binary filename matches platform expectations

### Checksum mismatch
- Re-download binary from official source
- Verify download wasn't corrupted
- Check for MITM or proxy issues

## Development Setup

For development, you can symlink your system Ollama:

```bash
# macOS/Linux
ln -s $(which ollama) resources/ollama/mac/ollama

# Windows (as admin)
mklink resources\ollama\win\ollama.exe "C:\Program Files\Ollama\ollama.exe"
```

This avoids redundant disk usage during development.
