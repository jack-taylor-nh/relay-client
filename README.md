# Relay Client

The client-side components for [Relay](https://github.com/relay-protocol) - a zero-knowledge, privacy-focused communication platform.

## Overview

Relay Client provides the end-user interface and cryptographic core for the Relay protocol:

- **Browser Extension**: Chrome/Edge side panel for messaging
- **Core Library**: TypeScript crypto primitives and Double Ratchet implementation
- **Zero-Knowledge**: All encryption/decryption happens client-side

## Packages

This monorepo contains two packages:

### `@relay/core` (core/)

The cryptographic foundation and messaging protocol:

- **Double Ratchet**: Signal Protocol implementation for forward secrecy
- **Ed25519**: Identity keys and message signing
- **X25519**: Key exchange and edge-level encryption keys
- **Ratchet State Management**: Serialization and storage abstraction

### `@relay/extension` (extension/)

Chrome/Edge browser extension with side panel UI:

- **Identity Management**: Create, unlock, and backup cryptographic identities
- **Edge Management**: Disposable contact surfaces (handles, email aliases)
- **E2EE Messaging**: Double Ratchet encrypted native messaging
- **Email Bridge**: Secure email gateway integration

## Security Architecture

**All encryption happens client-side:**

```
User → [Encrypt with Double Ratchet] → Server (stores ciphertext) → [Decrypt with Double Ratchet] → Recipient
```

### Double Ratchet Protocol

Native Relay-to-Relay messaging uses the Signal Protocol's Double Ratchet:

- **Forward Secrecy**: Compromised keys can't decrypt past messages
- **Post-Compromise Security**: New keys generated after each message
- **Edge-Level Keys**: Each handle has its own X25519 keypair
- **Ratchet State Persistence**: Stored locally in chrome.storage

### Key Hierarchy

```
Identity (Ed25519) ─── Long-term identity, used for authentication
    │
    └── Edge Keys (X25519) ─── Per-handle encryption keys
            │
            └── Ratchet State ─── Per-conversation ephemeral keys
```

## Local Development

### Prerequisites

- Node.js 18+
- Chrome or Edge browser

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install core library dependencies
cd core && npm install

# Install extension dependencies
cd ../extension && npm install
```

### 2. Build Core Library

```bash
cd core
npm run build
```

### 3. Build Extension

```bash
cd extension
npm run build
```

### 4. Load Extension in Chrome

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. Click the Relay icon to open the side panel

### Development Mode

For hot-reload during development:

```bash
cd extension
npm run dev
```

This starts Vite in watch mode. Reload the extension in Chrome to see changes.

## Architecture

### Extension Structure

```
extension/
├── src/
│   ├── background/         # Service worker (crypto, storage, API)
│   │   └── index.ts        # Message handlers, Double Ratchet integration
│   ├── panel/              # Side panel UI (Preact)
│   │   ├── App.tsx         # Main app with tab navigation
│   │   ├── state.ts        # Global state (Preact signals)
│   │   ├── views/          # Tab views (Inbox, Edges, New, etc.)
│   │   └── components/     # Reusable UI components
│   ├── lib/
│   │   ├── crypto.ts       # NaCl crypto helpers
│   │   ├── storage.ts      # RatchetStorage implementation
│   │   └── api.ts          # API client
│   └── popup/              # Extension popup (minimal)
├── public/                 # Static assets
└── manifest.json           # Extension manifest v3
```

### Core Library Structure

```
core/
├── src/
│   ├── crypto/
│   │   └── ratchet.ts      # Double Ratchet implementation
│   ├── messaging/
│   │   └── index.ts        # Unified send/receive with ratchet
│   ├── types/
│   │   ├── index.ts        # Edge types, security levels
│   │   └── messages.ts     # Message envelope types
│   └── utils/
│       ├── encoding.ts     # Base64 helpers
│       └── handle.ts       # Handle validation
└── package.json
```

## API Integration

The extension communicates with the Relay API server:

### Key Endpoints Used

- `POST /v1/auth/nonce` + `POST /v1/auth/verify` - JWT authentication
- `POST /v1/handles` - Create native handles
- `POST /v1/handles/resolve` - Resolve handle to public key + edge info
- `POST /v1/messages` - Send messages (unified endpoint)
- `GET /v1/conversations` - List conversations
- `GET /v1/conversations/:id/messages` - Fetch messages

### Message Format

Messages use the unified envelope format:

```typescript
{
  recipient_handle: string,      // For new conversations
  edge_id: string,               // Sender's edge
  origin: "native" | "email",
  security_level: "e2ee",
  payload: {
    content_type: "text/plain",
    ciphertext: string,          // Encrypted content
    ephemeral_pubkey: string,    // DH public key (ratchet)
    nonce: string,
    pn: number,                  // Previous chain length
    n: number,                   // Message number
  },
  signature: string
}
```

## Environment Configuration

The extension uses `chrome.storage.local` for configuration:

| Key | Description | Default |
|-----|-------------|---------|
| `apiUrl` | API server URL | `https://api.rlymsg.com` |
| `identity` | Encrypted identity bundle | - |
| `edgeKeys` | Per-edge X25519 keypairs | `{}` |
| `ratchet:*` | Per-conversation ratchet state | - |

## Scripts

### Core Library

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without building |

### Extension

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite in watch mode |
| `npm run build` | Build for production |
| `npm run typecheck` | Type-check without building |

## Security Notes

### What's Stored Locally

- **Identity secret key**: Encrypted with user passphrase (scrypt KDF)
- **Edge secret keys**: Stored in plaintext (protected by extension sandbox)
- **Ratchet state**: Per-conversation, serialized JSON

### What's NEVER Sent to Server

- Plaintext message content
- Secret keys
- Passphrase
- Ratchet state

### Trust Model

- **Server**: Zero-knowledge, stores only encrypted blobs
- **Extension**: Trusted, runs in browser sandbox
- **Workers**: Transient decryption for bridges only

## Related Projects

- **[relay-server](../relay-server/)**: Backend API server
- **[relay-protocol](../relay-protocol/)**: Protocol specification and threat model
- **[email-worker](../relay-server/email-worker/)**: Cloudflare Worker for email bridge

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

See [LICENSE](./LICENSE) for details.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

Built with privacy and user control as core principles.
