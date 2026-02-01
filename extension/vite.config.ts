import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

// Plugin to finalize extension build
function extensionBuild() {
  return {
    name: 'extension-build',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const publicDir = resolve(__dirname, 'public');
      
      // Copy public files (manifest.json, icons)
      if (existsSync(publicDir)) {
        cpSync(publicDir, distDir, { recursive: true });
      }
      
      // Create panel/index.html
      const panelHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relay</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./index.js"></script>
</body>
</html>`;
      
      mkdirSync(resolve(distDir, 'panel'), { recursive: true });
      writeFileSync(resolve(distDir, 'panel', 'index.html'), panelHtml);
      
      // Create popup/index.html
      const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relay</title>
  <style>
    body { width: 200px; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; text-align: center; }
    .btn { display: block; width: 100%; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <button class="btn" id="open-panel">Open Relay Panel</button>
  <script type="module" src="./index.js"></script>
</body>
</html>`;
      
      mkdirSync(resolve(distDir, 'popup'), { recursive: true });
      writeFileSync(resolve(distDir, 'popup', 'index.html'), popupHtml);
    },
  };
}

export default defineConfig({
  plugins: [preact(), extensionBuild()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/panel/main.tsx'),
        background: resolve(__dirname, 'src/background/index.ts'),
        popup: resolve(__dirname, 'src/popup/main.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => `${chunkInfo.name}/index.js`,
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
