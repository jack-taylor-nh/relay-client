// Types
export * from './types/index.js';

// Constants
export * from './constants.js';

// Crypto - NOTE: libsodium-based crypto is NOT exported from main entry point
// to avoid bundling issues in browser extensions. Use './crypto' directly if needed.
// The ratchet crypto (tweetnacl-based) IS exported via messaging module.
export * from './crypto/ratchet.js';

// Messaging (Unified protocol)
export * from './messaging/index.js';

// Identity & Assets (Portable identity system)
export * from './identity/index.js';
export * from './assets/index.js';

// Utilities
export * from './utils/handle.js';
