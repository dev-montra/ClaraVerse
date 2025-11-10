/**
 * File Export Utility for WebContainer
 * Exports files from WebContainer for deployment
 */

import type { WebContainer } from '@webcontainer/api';
import JSZip from 'jszip';

export interface FileDigest {
  path: string;
  content: string;
  sha1: string;
  size: number;
}

export interface ExportedProject {
  files: FileDigest[];
  totalSize: number;
  fileCount: number;
}

/**
 * Calculate SHA1 hash of a string
 */
async function calculateSHA1(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Recursively read all files from WebContainer
 */
async function readDirectory(
  webContainer: WebContainer,
  dirPath: string,
  files: Array<{ path: string; content: string }> = [],
  baseDir: string = ''
): Promise<Array<{ path: string; content: string }>> {
  try {
    const entries = await webContainer.fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = dirPath === '/' ? `/${entry.name}` : `${dirPath}/${entry.name}`;

      // Skip common directories that shouldn't be deployed
      if (entry.isDirectory()) {
        const skipDirs = ['node_modules', '.git', '.cache', '__pycache__', '.vscode'];
        if (skipDirs.includes(entry.name)) {
          console.log(`⏭️  Skipping directory: ${fullPath}`);
          continue;
        }

        // Recursively read subdirectory
        await readDirectory(webContainer, fullPath, files, baseDir);
      } else {
        // Read file content
        try {
          const content = await webContainer.fs.readFile(fullPath, 'utf-8');

          // Calculate relative path from base directory
          let relativePath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
          if (baseDir) {
            relativePath = relativePath.startsWith(baseDir + '/')
              ? relativePath.substring(baseDir.length + 1)
              : relativePath;
          }

          files.push({ path: relativePath, content });
        } catch (error) {
          console.error(`Error reading file ${fullPath}:`, error);
        }
      }
    }

    return files;
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return files;
  }
}

/**
 * Export all project files from WebContainer with file digests
 */
export async function exportProjectFiles(webContainer: WebContainer): Promise<ExportedProject> {
  console.log('📦 Exporting project files from WebContainer...');

  // Try to find and export the build output directory
  let rawFiles: Array<{ path: string; content: string }> = [];
  let buildDir = '';

  // Check for common build directories
  const buildDirs = ['dist', 'build', '.next/standalone', 'out'];
  for (const dir of buildDirs) {
    try {
      const dirPath = `/${dir}`;
      const entries = await webContainer.fs.readdir(dirPath);
      if (entries && entries.length > 0) {
        console.log(`🎯 Found build directory: ${dirPath}`);
        buildDir = dir;
        // Read files from build directory, stripping the base directory from paths
        rawFiles = await readDirectory(webContainer, dirPath, [], dir);
        break;
      }
    } catch (error) {
      // Directory doesn't exist, continue checking
    }
  }

  // If no build directory found, export all files (source code)
  if (!buildDir) {
    console.log('⚠️  No build output found, exporting source files');
    rawFiles = await readDirectory(webContainer, '/');
  }

  console.log(`✅ Found ${rawFiles.length} files`);

  // Create file digests with SHA1 hashes
  const filePromises = rawFiles.map(async (file) => {
    const sha1 = await calculateSHA1(file.content);
    return {
      path: file.path,
      content: file.content,
      sha1,
      size: new Blob([file.content]).size
    };
  });

  let files = await Promise.all(filePromises);

  // Add _redirects file for SPA routing if deploying built files
  if (buildDir) {
    const hasRedirects = files.some(f => f.path === '_redirects');
    if (!hasRedirects) {
      console.log('📝 Adding _redirects for SPA routing');
      const redirectsContent = `/*    /index.html   200`;
      const sha1 = await calculateSHA1(redirectsContent);
      files.push({
        path: '_redirects',
        content: redirectsContent,
        sha1,
        size: new Blob([redirectsContent]).size
      });
    }
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  console.log(`📊 Total size: ${(totalSize / 1024).toFixed(2)} KB`);

  return {
    files,
    totalSize,
    fileCount: files.length
  };
}

/**
 * Create a ZIP archive of the project
 */
export async function exportProjectAsZip(webContainer: WebContainer): Promise<Blob> {
  console.log('📦 Creating ZIP archive...');

  const { files } = await exportProjectFiles(webContainer);
  const zip = new JSZip();

  // Add all files to ZIP
  for (const file of files) {
    zip.file(file.path, file.content);
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  console.log(`✅ ZIP created: ${(blob.size / 1024).toFixed(2)} KB`);

  return blob;
}

/**
 * Build deploy manifest (file list with hashes for Netlify)
 */
export function buildDeployManifest(files: FileDigest[]): Record<string, string> {
  const manifest: Record<string, string> = {};

  for (const file of files) {
    manifest[file.path] = file.sha1;
  }

  return manifest;
}

/**
 * Filter files that need to be uploaded (Netlify will tell us which it needs)
 */
export function filterRequiredFiles(
  allFiles: FileDigest[],
  requiredHashes: string[]
): FileDigest[] {
  const requiredSet = new Set(requiredHashes);
  return allFiles.filter(file => requiredSet.has(file.sha1));
}
