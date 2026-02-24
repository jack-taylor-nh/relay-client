/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_AI_ROUTER_URL?: string;
  // Add other env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
