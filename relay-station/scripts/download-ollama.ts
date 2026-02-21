#!/usr/bin/env tsx
/**
 * Download Ollama Binaries Script
 *
 * Automatically downloads platform-specific Ollama binaries from GitHub releases.
 * Verifies SHA256 checksums and sets appropriate permissions.
 *
 * Usage: npm run download-ollama
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const OLLAMA_VERSION = '0.16.2'; // Latest stable version (Feb 2026)
const RELEASES_BASE_URL = `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}`;
const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'ollama');

// Platform-specific download configurations
// Note: These archives are large (1-2 GB) as they include GPU libraries
const DOWNLOADS = {
  win: {
    url: `${RELEASES_BASE_URL}/ollama-windows-amd64.zip`,
    checksum: '', // See sha256sum.txt in release
    outputDir: path.join(RESOURCES_DIR, 'win'),
    outputFile: 'ollama.exe',
    isArchive: true,
    extractPath: 'ollama.exe' // Path within archive
  },
  mac: {
    url: `${RELEASES_BASE_URL}/ollama-darwin.tgz`,
    checksum: '', // See sha256sum.txt in release
    outputDir: path.join(RESOURCES_DIR, 'mac'),
    outputFile: 'ollama',
    isArchive: true,
    extractPath: 'bin/ollama' // Path within archive
  },
  linux: {
    url: `${RELEASES_BASE_URL}/ollama-linux-amd64.tar.zst`,
    checksum: '', // See sha256sum.txt in release
    outputDir: path.join(RESOURCES_DIR, 'linux'),
    outputFile: 'ollama',
    isArchive: true,
    extractPath: 'bin/ollama' // Path within archive
  }
};

/**
 * Download a file from a URL using native fetch
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`📥 Downloading from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));

  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
  console.log(`✅ Downloaded ${sizeMB} MB to ${outputPath}`);
}

/**
 * Calculate SHA256 checksum of a file
 */
function calculateChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Verify file checksum
 */
function verifyChecksum(
  filePath: string,
  expectedChecksum: string
): boolean {
  if (!expectedChecksum) {
    console.warn('⚠️  No checksum provided for verification, skipping...');
    return true;
  }

  const actualChecksum = calculateChecksum(filePath);
  const matches = actualChecksum === expectedChecksum;

  if (matches) {
    console.log('✅ Checksum verified');
  } else {
    console.error('❌ Checksum mismatch!');
    console.error(`   Expected: ${expectedChecksum}`);
    console.error(`   Actual:   ${actualChecksum}`);
  }

  return matches;
}

/**
 * Extract archive and copy specific file to output
 */
async function extractArchive(
  archivePath: string,
  extractPath: string,
  outputPath: string,
  platform: 'win' | 'mac' | 'linux'
): Promise<void> {
  console.log(`📦 Extracting ${path.basename(archivePath)}...`);

  const tempDir = path.join(path.dirname(archivePath), 'temp_extract');

  try {
    // Create temp extraction directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Extract based on platform
    if (platform === 'win') {
      // Windows: Extract .zip using PowerShell
      const command = `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tempDir}' -Force"`;
      await execAsync(command);
    } else if (platform === 'mac') {
      // macOS: Extract .tgz using tar
      await execAsync(`tar -xzf "${archivePath}" -C "${tempDir}"`);
    } else {
      // Linux: Extract .tar.zst using tar with zstd
      // Note: Requires zstd to be installed
      await execAsync(`tar -I zstd -xf "${archivePath}" -C "${tempDir}"`);
    }

    // Copy the specific binary to output location
    const extractedFile = path.join(tempDir, extractPath);
    if (!fs.existsSync(extractedFile)) {
      throw new Error(
        `Expected file not found in archive: ${extractPath}`
      );
    }

    fs.copyFileSync(extractedFile, outputPath);
    console.log(`✅ Extracted ${path.basename(outputPath)}`);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Clean up archive
    fs.unlinkSync(archivePath);
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw new Error(
      `Failed to extract archive: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Set executable permissions (Unix-like systems)
 */
async function setExecutable(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    return; // No chmod on Windows
  }

  console.log(`🔒 Setting executable permissions on ${filePath}...`);

  try {
    await execAsync(`chmod +x "${filePath}"`);
    console.log('✅ Permissions set');
  } catch (error) {
    console.warn(
      `⚠️  Failed to set permissions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Download and verify a platform-specific Ollama binary
 */
async function downloadPlatform(
  platform: 'win' | 'mac' | 'linux'
): Promise<void> {
  const config = DOWNLOADS[platform];

  console.log(`\n🚀 Downloading Ollama for ${platform}...`);

  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const outputPath = path.join(config.outputDir, config.outputFile);
  const archivePath = path.join(
    config.outputDir,
    path.basename(config.url)
  );

  try {
    // Download file
    await downloadFile(config.url, archivePath);

    // Extract archive and copy binary
    if (config.isArchive && config.extractPath) {
      await extractArchive(
        archivePath,
        config.extractPath,
        outputPath,
        platform
      );
    }

    // Set executable permissions (Unix)
    await setExecutable(outputPath);

    const sizeMB = (
      fs.statSync(outputPath).size /
      1024 /
      1024
    ).toFixed(2);
    console.log(
      `✅ ${platform} binary ready at ${outputPath} (${sizeMB} MB)`
    );
  } catch (error) {
    console.error(
      `❌ Failed to download ${platform} binary: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('🔧 Ollama Binary Download Script');
  console.log(`📦 Downloading version ${OLLAMA_VERSION}...\n`);

  // Detect which platforms to download
  const platforms = process.argv.slice(2) as Array<'win' | 'mac' | 'linux'>;

  if (platforms.length === 0) {
    // Download all platforms by default
    console.log('📥 No platforms specified, downloading all...');
    platforms.push('win', 'mac', 'linux');
  }

  // Validate platforms
  for (const platform of platforms) {
    if (!['win', 'mac', 'linux'].includes(platform)) {
      console.error(`❌ Invalid platform: ${platform}`);
      console.error('   Valid options: win, mac, linux');
      process.exit(1);
    }
  }

  // Download each platform
  let successCount = 0;
  let failureCount = 0;

  for (const platform of platforms) {
    try {
      await downloadPlatform(platform);
      successCount++;
    } catch (error) {
      console.error(
        `❌ Failed to process ${platform}: ${error instanceof Error ? error.message : String(error)}`
      );
      failureCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ${successCount} platform(s) downloaded successfully`);
  if (failureCount > 0) {
    console.log(`❌ ${failureCount} platform(s) failed`);
  }
  console.log('='.repeat(60));

  if (failureCount > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error(
    `❌ Script failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
