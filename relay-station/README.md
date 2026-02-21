# Relay LLM Bridge

> **Take your local LLM anywhere. Chat with your home AI on Relay, completely private.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

---

## What is this?

Relay LLM Bridge is a **lightweight desktop app** that connects your locally-hosted AI models (Ollama, LM Studio) to the Relay messaging network. This means you can:

- 💬 **Chat with your home AI from anywhere** - Your iPhone, work laptop, anywhere with internet
- 🔒 **Complete privacy** - Conversations are E2E encrypted, never touch corporate servers
- 💰 **$0 cost** - No API fees, use your own compute
- 🚀 **Zero configuration** - No port forwarding, no firewall rules, just paste a token
- 🎯 **Multi-purpose** - Create different AI assistants for different needs (fitness coach, coding helper, etc.)

## How it works

```
You (on phone) → Relay Server → Your Desktop App → Your Local LLM → Response back to you
         ↑                           ↑                    ↑
    Encrypted             Decrypts & forwards      Your own hardware
    Zero-knowledge              Encrypted           Complete privacy
```

All messages are **end-to-end encrypted**. The Relay server never sees your conversations.

---

## Features

✅ **Portable Local AI** - Your home LLM becomes accessible from anywhere  
✅ **Zero-Knowledge E2E Encryption** - Relay can't read your messages  
✅ **Auto-Detect LLMs** - Finds Ollama and LM Studio automatically  
✅ **Multi-Edge Support** - Create multiple AI assistants with different personalities  
✅ **System Tray App** - Set and forget, runs silently in background  
✅ **Auto-Start** - Launches on system boot  
✅ **Cross-Platform** - Windows, macOS, and Linux support  
✅ **Conversation Context** - Maintains chat history per conversation  

---

## Requirements

### Desktop (where LLM runs)
- **OS**: Windows 10+, macOS 11+, or Linux (Ubuntu 20.04+)
- **RAM**: 8 GB minimum (16 GB recommended for larger models)
- **Storage**: 100 MB for app + space for LLM models
- **Internet**: Stable connection (for Relay communication)

### LLM Software (pick one or both)
- [Ollama](https://ollama.ai/) - Free, open-source (recommended)
- [LM Studio](https://lmstudio.ai/) - Free, user-friendly GUI

### Relay Account
- Relay browser extension or mobile app (to create bridge edges)
- Get it at [userelay.org](https://userelay.org)

---

## Installation

### Windows
1. Download `RelayLLMBridge-Setup-1.0.0.exe` from [Releases](https://github.com/relay/llm-bridge/releases)
2. Run installer (no admin required)
3. App launches automatically and appears in system tray

### macOS
1. Download `RelayLLMBridge-1.0.0.dmg` from [Releases](https://github.com/relay/llm-bridge/releases)
2. Open DMG and drag app to Applications
3. Launch from Applications folder
4. Allow app to run (System Preferences → Security if prompted)

### Linux
1. Download `RelayLLMBridge-1.0.0.AppImage` from [Releases](https://github.com/relay/llm-bridge/releases)
2. Make executable: `chmod +x RelayLLMBridge-1.0.0.AppImage`
3. Run: `./RelayLLMBridge-1.0.0.AppImage`
4. (Optional) Move to `/usr/local/bin` for easy access

---

## Setup Guide (5 minutes)

### Step 1: Install & Launch Bridge App

After installation, the app appears in your system tray (Windows/Linux) or menu bar (macOS).

### Step 2: Install & Start LLM Software

**Option A: Ollama (Recommended)**
```bash
# Install Ollama (see ollama.ai for OS-specific instructions)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model (example: llama3.2)
ollama pull llama3.2

# Start Ollama (runs in background)
ollama serve
```

**Option B: LM Studio**
1. Download from [lmstudio.ai](https://lmstudio.ai/)
2. Install and launch
3. Download a model from the built-in downloader
4. Load model and start server (click "Start Server" button)

The bridge app **auto-detects** running LLMs - no configuration needed!

### Step 3: Create Bridge Edge in Relay

1. Open the bridge app (click tray icon → "Settings")
2. Click **"Add Bridge"**
3. Copy the public key shown (long alphanumeric string)
4. Open your **Relay browser extension** or **mobile app**
5. Go to **Settings → Bridges → Add LLM Bridge**
6. Paste the public key
7. Enter a name (e.g., "My AI Assistant")
8. (Optional) Set a system prompt (e.g., "You are a helpful coding assistant")
9. Click **"Create"** - Relay shows you an auth token
10. Copy the auth token

### Step 4: Connect Bridge

1. Go back to desktop bridge app
2. Paste the auth token
3. (Optional) Enter a friendly name for this bridge
4. Click **"Connect Bridge"**
5. Status turns 🟢 **Connected**!

### Step 5: Start Chatting!

1. In your Relay app (phone, browser, etc.), start a conversation with your bridge edge
2. Send a message: "Hello!"
3. Your desktop app receives it, asks your local LLM, and replies
4. Response appears in your Relay app within 1-2 seconds

**That's it!** Your local AI is now portable. 🎉

---

## Usage Examples

### Single-Purpose Assistant

Create one bridge with a system prompt:
```
You are a fitness coach with expertise in strength training and nutrition.
Provide evidence-based advice and motivational support.
```

Message this edge from anywhere to get fitness advice.

### Multi-Purpose Setup (Power User)

Create **multiple bridges** with different purposes:

1. **"Fitness Coach"** - `llama3.2` - Health & training advice
2. **"Code Reviewer"** - `codellama` - Review pull requests, explain code
3. **"Spanish Tutor"** - `llama3.2` - Language practice with native fluency
4. **"Financial Analyst"** - `mixtral` - Budget analysis, investment advice

Each bridge maintains **separate conversation history** and uses **different system prompts**.

---

## Advanced Configuration

### Custom LLM Endpoints

If you're running LLMs on non-default ports or remote machines:

1. Open bridge app settings
2. Select **"Custom URL"** in LLM Provider section
3. Enter your endpoint (e.g., `http://192.168.1.100:11434`)
4. Click **"Test Connection"**
5. If successful, select as active provider

### Context Window Size

Adjust how much conversation history is kept:

1. Click a bridge → **Settings**
2. Change **"Context Window Size"**
   - Small (10 messages) - Fast, minimal memory
   - Medium (20 messages) - Default, balanced
   - Large (50 messages) - More context, uses more memory

When limit is reached, oldest messages are dropped (sliding window).

### System Prompts

System prompts set the AI's behavior. Good examples:

**Helpful Assistant:**
```
You are a knowledgeable and friendly assistant. Provide clear, concise answers.
```

**Coding Expert:**
```
You are a senior software engineer with 10+ years of experience. Provide
production-ready code examples and explain best practices.
```

**Creative Writer:**
```
You are a creative writing coach. Help users improve their storytelling with
constructive feedback and inspiration.
```

---

## Troubleshooting

### "LLM is offline" error

**Solution:**
- Ensure Ollama or LM Studio is running
- Check the app's LLM Provider section (should show ✓ Available)
- Restart LLM service

### Bridge won't connect

**Solution:**
- Check internet connection
- Verify auth token is correct (re-create edge if needed)
- Check tray icon status (🔴 = disconnected, 🟡 = connecting, 🟢 = connected)
- Restart bridge app

### Messages not arriving

**Solution:**
- Check SSE connection (should see "Connected" in logs)
- Verify edge is active in Relay client
- Try sending a test message

### High memory usage

**Solution:**
- Reduce context window size (Settings → Edge → Context Window)
- Clear old contexts (Settings → Edge → "Clear All Contexts")
- Note: LLM itself uses RAM (separate from bridge app)

### App won't auto-start

**Solution:**
- **Windows**: Check Task Manager → Startup tab
- **macOS**: System Preferences → Users & Groups → Login Items
- **Linux**: Check `~/.config/autostart/relay-llm-bridge.desktop`

---

## Privacy & Security

### What the Bridge App Knows
- Your bridge edge keys (necessary for encryption)
- Full message plaintext (necessary for LLM processing)
- Stored **locally, encrypted at rest**

### What Relay Server Knows
- Encrypted message ciphertext (**can't decrypt**)
- Conversation metadata (timestamps, message counts)
- **Does NOT know**: Message content, LLM provider, system prompts

### What LLM Providers Know
- **Nothing!** They run entirely on your local machine
- No telemetry, no cloud, complete data sovereignty

### Attack Scenarios

**Relay Server Compromised:**  
✅ Attacker can't read messages (end-to-end encrypted)

**Bridge App Compromised:**  
⚠️ Attacker can read conversations processed by that bridge  
✅ Can't access other user data or main Relay identity

**Network MITM:**  
✅ TLS 1.3 encryption + E2E message encryption = double protection

---

## Building from Source

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Build Steps

```bash
# Clone repo
git clone https://github.com/relay/llm-bridge.git
cd llm-bridge

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for your platform
npm run build        # All platforms
npm run build:win    # Windows only
npm run build:mac    # macOS only
npm run build:linux  # Linux only
```

Built installers appear in `dist/` directory.

---

## Roadmap

### v1.0 - MVP (Current)
- ✅ Core functionality (send/receive messages)
- ✅ Ollama & LM Studio support
- ✅ Multi-edge support
- ✅ System tray app

### v1.1 - Polish
- [ ] Streaming responses (real-time output)
- [ ] Voice message transcription (Whisper integration)
- [ ] Usage analytics (token counts, response times)
- [ ] Context summarization (smart compression)

### v2.0 - Advanced
- [ ] Multimodal support (images → llama3.2-vision)
- [ ] RAG integration (connect to local documents)
- [ ] Function calling (let AI trigger actions)
- [ ] Multi-LLM routing (different models for different tasks)

---

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas We Need Help
- 🐛 Bug reports and testing
- 📝 Documentation improvements
- 🎨 UI/UX design
- 🌐 Translations (i18n)
- 🧪 Platform-specific testing (especially Linux distros)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/relay/llm-bridge/issues)
- **Discussions**: [GitHub Discussions](https://github.com/relay/llm-bridge/discussions)
- **Discord**: [Relay Community](https://discord.gg/relay)
- **Email**: support@userelay.org

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Acknowledgments

Built with:
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [Ollama](https://ollama.ai/) - Local LLM runtime
- [LM Studio](https://lmstudio.ai/) - User-friendly LLM interface
- [TweetNaCl](https://tweetnacl.js.org/) - Cryptography library
- [Relay Protocol](https://userelay.org) - Privacy-first messaging

---

**Made with ❤️ for the local AI community**

_Your data, your hardware, your privacy. That's how it should be._
