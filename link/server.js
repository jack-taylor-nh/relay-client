/**
 * Simple static file server for Railway deployment
 * Serves the Vite build output with SPA fallback
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, 'dist');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

async function serveFile(res, filePath) {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  // Set request timeout to prevent hanging
  req.setTimeout(30000);
  res.setTimeout(30000);
  
  try {
    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    let urlPath = req.url.split('?')[0];
    
    // Try to serve the exact file
    let filePath = join(DIST_DIR, urlPath);
    if (await serveFile(res, filePath)) return;
    
    // Try with .html extension
    if (await serveFile(res, filePath + '.html')) return;
    
    // Try index.html in directory
    if (await serveFile(res, join(filePath, 'index.html'))) return;
    
    // SPA fallback - serve index.html for all routes
    // This handles /abc123 style link IDs
    const indexPath = join(DIST_DIR, 'index.html');
    if (await serveFile(res, indexPath)) return;
    
    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Set server-wide timeouts
server.timeout = 30000;
server.keepAliveTimeout = 65000; // Slightly higher than typical LB timeout
server.headersTimeout = 66000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Contact Link server running on port ${PORT}`);
});
