import { WebContainer } from '@webcontainer/api';
import { FileNode } from '../types';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface LumaToolsConfig {
  webContainer: WebContainer | null;
  files: FileNode[];
  onFilesUpdate: (files: FileNode[]) => void;
  onFileSelect: (path: string, content: string) => void;
  onTerminalWrite: (message: string) => void;
  workingDirectory: string;
  onRefreshFileTree?: () => Promise<void>;
  onSaveProject?: (files: FileNode[]) => Promise<void>;
}

export class LumaTools {
  private config: LumaToolsConfig;

  constructor(config: LumaToolsConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<LumaToolsConfig>) {
    this.config = { ...this.config, ...config };
  }

  // Helper to check if WebContainer is still valid
  private isContainerValid(): boolean {
    return this.config.webContainer !== null && this.config.webContainer !== undefined;
  }

  // Helper to handle proxy errors
  private handleProxyError(error: any, operation: string): ToolResult {
    const errorStr = String(error);
    if (errorStr.includes('Proxy has been released') || errorStr.includes('not useable')) {
      const message = `WebContainer has been destroyed during ${operation}. Please restart the project to continue making changes.`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${message}\x1b[0m\n`);
      return {
        success: false,
        message,
        error: 'CONTAINER_DESTROYED'
      };
    }
    // Return generic error
    const errorMsg = `Failed during ${operation}: ${error}`;
    this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
    return { success: false, message: errorMsg, error: String(error) };
  }

  // File Operations
  async createFile(path: string, content: string = ''): Promise<ToolResult> {
    try {
      if (!this.isContainerValid()) {
        return { success: false, message: 'WebContainer not available. Please start the project first.', error: 'NO_CONTAINER' };
      }

      // Ensure parent directory exists
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await this.config.webContainer!.fs.mkdir(dirPath, { recursive: true });
          this.config.onTerminalWrite(`\x1b[90m📁 Ensured directory exists: ${dirPath}\x1b[0m\n`);
        } catch (dirError) {
          // Check if it's a proxy released error
          if (String(dirError).includes('Proxy has been released')) {
            return this.handleProxyError(dirError, 'directory creation');
          }
          // Directory might already exist, continue
          this.config.onTerminalWrite(`\x1b[90m📁 Directory check for: ${dirPath}\x1b[0m\n`);
        }
      }

      // Write to WebContainer
      await this.config.webContainer!.fs.writeFile(path, content);

      // Update local file tree
      const updatedFiles = this.addFileToTree(this.config.files, path, content);
      this.config.onFilesUpdate(updatedFiles);

      // Auto-save project immediately after file creation
      if (this.config.onSaveProject) {
        try {
          await this.config.onSaveProject(updatedFiles);
          this.config.onTerminalWrite(`\x1b[90m💾 Project auto-saved\x1b[0m\n`);
        } catch (saveError) {
          this.config.onTerminalWrite(`\x1b[33m⚠️ Warning: Auto-save failed\x1b[0m\n`);
        }
      }

      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }

      this.config.onTerminalWrite(`\x1b[32m✅ Created file: ${path}\x1b[0m\n`);

      return {
        success: true,
        message: `File created successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      return this.handleProxyError(error, `file creation (${path})`);
    }
  }

  async readFile(path: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        // Try to read from local files first
        const file = this.findFileInTree(this.config.files, path);
        if (file && file.content !== undefined) {
          return {
            success: true,
            message: `File read successfully: ${path}`,
            data: { path, content: file.content, size: file.content.length }
          };
        }
        return { success: false, message: 'WebContainer not available and file not found locally', error: 'NO_CONTAINER' };
      }

      const content = await this.config.webContainer.fs.readFile(path, 'utf-8');
      
      this.config.onTerminalWrite(`\x1b[32m✅ Read file: ${path} (${content.length} bytes)\x1b[0m\n`);
      
      return {
        success: true,
        message: `File read successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to read file ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async updateFile(path: string, content: string): Promise<ToolResult> {
    try {
      if (!this.isContainerValid()) {
        return { success: false, message: 'WebContainer not available. Please start the project first.', error: 'NO_CONTAINER' };
      }

      // Ensure parent directory exists
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await this.config.webContainer!.fs.mkdir(dirPath, { recursive: true });
          this.config.onTerminalWrite(`\x1b[90m📁 Ensured directory exists: ${dirPath}\x1b[0m\n`);
        } catch (dirError) {
          if (String(dirError).includes('Proxy has been released')) {
            return this.handleProxyError(dirError, 'directory creation');
          }
          // Directory might already exist, continue
          this.config.onTerminalWrite(`\x1b[90m📁 Directory check for: ${dirPath}\x1b[0m\n`);
        }
      }

      // Write to WebContainer
      await this.config.webContainer!.fs.writeFile(path, content);

      // Update local file tree
      const updatedFiles = this.updateFileInTree(this.config.files, path, content);
      this.config.onFilesUpdate(updatedFiles);

      // Update editor if this file is currently selected
      this.config.onFileSelect(path, content);

      // Auto-save project immediately after file update
      if (this.config.onSaveProject) {
        try {
          await this.config.onSaveProject(updatedFiles);
          this.config.onTerminalWrite(`\x1b[90m💾 Project auto-saved\x1b[0m\n`);
        } catch (saveError) {
          this.config.onTerminalWrite(`\x1b[33m⚠️ Warning: Auto-save failed\x1b[0m\n`);
        }
      }

      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }

      this.config.onTerminalWrite(`\x1b[32m✅ Updated file: ${path}\x1b[0m\n`);

      return {
        success: true,
        message: `File updated successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      return this.handleProxyError(error, `file update (${path})`);
    }
  }

  async editFileSection(path: string, oldText: string, newText: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      // First read the current file content
      const currentContent = await this.config.webContainer.fs.readFile(path, 'utf-8');

      // Check if the old text exists in the file
      if (!currentContent.includes(oldText)) {
        const errorMsg = `Text not found in file ${path}. The old_text parameter must match exactly.`;
        this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
        this.config.onTerminalWrite(`\x1b[90m💡 Looking for: "${oldText.substring(0, 100)}..."\x1b[0m\n`);
        return { success: false, message: errorMsg, error: 'TEXT_NOT_FOUND' };
      }

      // Replace the text
      const newContent = currentContent.replace(oldText, newText);

      // Get context around the change (10 lines before/after)
      const lines = newContent.split('\n');
      const changeIndex = newContent.indexOf(newText);
      const linesBeforeChange = newContent.substring(0, changeIndex).split('\n').length - 1;
      const contextStart = Math.max(0, linesBeforeChange - 10);
      const contextEnd = Math.min(lines.length, linesBeforeChange + 10);
      const contextLines = lines.slice(contextStart, contextEnd);
      const contextPreview = contextLines.join('\n');

      // Ensure parent directory exists
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await this.config.webContainer.fs.mkdir(dirPath, { recursive: true });
        } catch (dirError) {
          // Directory might already exist, continue
        }
      }

      // Write to WebContainer
      await this.config.webContainer.fs.writeFile(path, newContent);

      // Update local file tree
      const updatedFiles = this.updateFileInTree(this.config.files, path, newContent);
      this.config.onFilesUpdate(updatedFiles);

      // Update editor if this file is currently selected
      this.config.onFileSelect(path, newContent);

      // Auto-save project immediately after file section edit
      if (this.config.onSaveProject) {
        try {
          await this.config.onSaveProject(updatedFiles);
          this.config.onTerminalWrite(`\x1b[90m💾 Project auto-saved\x1b[0m\n`);
        } catch (saveError) {
          this.config.onTerminalWrite(`\x1b[33m⚠️ Warning: Auto-save failed\x1b[0m\n`);
        }
      }

      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }

      this.config.onTerminalWrite(`\x1b[32m✅ Section edited in file: ${path}\x1b[0m\n`);
      this.config.onTerminalWrite(`\x1b[90m🔄 Replaced ${oldText.length} chars with ${newText.length} chars\x1b[0m\n`);

      const message = `File section updated successfully: ${path}\n\nReplaced ${oldText.length} characters with ${newText.length} characters.\n\nContext around change (lines ${contextStart + 1}-${contextEnd}):\n${contextPreview.substring(0, 500)}${contextPreview.length > 500 ? '...' : ''}`;

      return {
        success: true,
        message,
        data: {
          path,
          oldText,
          newText,
          newContent,
          size: newContent.length,
          contextPreview,
          lineNumber: linesBeforeChange + 1
        }
      };
    } catch (error) {
      const errorMsg = `Failed to edit file section ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async deleteFile(path: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      // Delete from WebContainer
      await this.config.webContainer.fs.rm(path, { force: true });
      
      // Update local file tree
      const updatedFiles = this.removeFileFromTree(this.config.files, path);
      this.config.onFilesUpdate(updatedFiles);
      
      // Auto-save project immediately after file deletion
      if (this.config.onSaveProject) {
        try {
          await this.config.onSaveProject(updatedFiles);
          this.config.onTerminalWrite(`\x1b[90m💾 Project auto-saved\x1b[0m\n`);
        } catch (saveError) {
          this.config.onTerminalWrite(`\x1b[33m⚠️ Warning: Auto-save failed\x1b[0m\n`);
        }
      }
      
      this.config.onTerminalWrite(`\x1b[32m✅ Deleted file: ${path}\x1b[0m\n`);
      
      return {
        success: true,
        message: `File deleted successfully: ${path}`
      };
    } catch (error) {
      const errorMsg = `Failed to delete file ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async createDirectory(path: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      await this.config.webContainer.fs.mkdir(path, { recursive: true });
      
      // Update local file tree
      const updatedFiles = this.addDirectoryToTree(this.config.files, path);
      this.config.onFilesUpdate(updatedFiles);
      
      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }
      
      this.config.onTerminalWrite(`\x1b[32m✅ Created directory: ${path}\x1b[0m\n`);
      
      return {
        success: true,
        message: `Directory created successfully: ${path}`
      };
    } catch (error) {
      const errorMsg = `Failed to create directory ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async listDirectory(path: string = '.', includeContent: boolean = false): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        // Return local file tree
        const dir = path === '.' ? this.config.files : this.findDirectoryInTree(this.config.files, path);
        if (!dir) {
          return { success: false, message: `Directory not found: ${path}`, error: 'DIR_NOT_FOUND' };
        }

        const items = Array.isArray(dir) ? dir : (dir.children || []);
        const itemsData = items.map(item => ({
          name: item.name,
          type: item.type,
          path: item.path,
          size: item.content?.length || 0,
          ...(includeContent && item.type === 'file' && item.content ? {
            preview: item.content.substring(0, 200) + (item.content.length > 200 ? '...' : '')
          } : {})
        }));

        const summary = `Found ${items.length} items (${items.filter(i => i.type === 'file').length} files, ${items.filter(i => i.type === 'directory').length} directories)`;

        return {
          success: true,
          message: `Directory listing for ${path}\n${summary}\n\nItems:\n${itemsData.map(i => `  ${i.type === 'directory' ? '📁' : '📄'} ${i.name}${i.size ? ` (${i.size} bytes)` : ''}`).join('\n')}`,
          data: { path, items: itemsData, summary }
        };
      }

      const entries = await this.config.webContainer.fs.readdir(path, { withFileTypes: true });
      const itemsPromises = entries.map(async (entry) => {
        const itemPath = path === '.' ? entry.name : `${path}/${entry.name}`;
        const isDir = entry.isDirectory();
        let preview = undefined;
        let size = 0;

        if (!isDir && includeContent) {
          try {
            const content = await this.config.webContainer!.fs.readFile(itemPath, 'utf-8');
            size = content.length;
            preview = content.substring(0, 200) + (content.length > 200 ? '...' : '');
          } catch (e) {
            // Skip preview if file can't be read
          }
        }

        return {
          name: entry.name,
          type: isDir ? 'directory' : 'file',
          path: itemPath,
          size,
          ...(preview ? { preview } : {})
        };
      });

      const items = await Promise.all(itemsPromises);
      const summary = `Found ${items.length} items (${items.filter(i => i.type === 'file').length} files, ${items.filter(i => i.type === 'directory').length} directories)`;

      this.config.onTerminalWrite(`\x1b[32m✅ Listed directory: ${path} (${items.length} items)\x1b[0m\n`);

      return {
        success: true,
        message: `Directory listing for ${path}\n${summary}\n\nItems:\n${items.map(i => `  ${i.type === 'directory' ? '📁' : '📄'} ${i.name}${i.size ? ` (${i.size} bytes)` : ''}`).join('\n')}`,
        data: { path, items, summary }
      };
    } catch (error) {
      const errorMsg = `Failed to list directory ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // Container Operations
  async runCommand(command: string, args: string[] = []): Promise<ToolResult> {
    try {
      if (!this.isContainerValid()) {
        return { success: false, message: 'WebContainer not available. Please start the project first.', error: 'NO_CONTAINER' };
      }

      this.config.onTerminalWrite(`\x1b[33m🔧 Running: ${command} ${args.join(' ')}\x1b[0m\n`);

      const process = await this.config.webContainer!.spawn(command, args);

      // Collect output from the process
      let stdoutBuffer = '';

      // Create a reader for the combined output stream
      const outputReader = process.output.getReader();

      // Read output in chunks with a flag to stop
      let shouldStopReading = false;
      const readOutput = async () => {
        try {
          while (!shouldStopReading) {
            const { done, value } = await outputReader.read();
            if (done) break;

            // Write to terminal
            this.config.onTerminalWrite(value);
            stdoutBuffer += value;
          }
        } catch (error) {
          console.error('Error reading output:', error);
        } finally {
          try {
            outputReader.releaseLock();
          } catch (e) {
            // Already released
          }
        }
      };

      // Start reading output
      const outputPromise = readOutput();

      // Wait for process to complete
      const exitCode = await process.exit;

      // Give output stream a short time to finish reading any remaining data
      // Then force stop if it takes too long
      await Promise.race([
        outputPromise,
        new Promise(resolve => setTimeout(() => {
          shouldStopReading = true;
          resolve(undefined);
        }, 2000)) // 2 second timeout after process exits
      ]);

      // Clean ANSI codes and spinner characters from output
      const cleanOutput = stdoutBuffer
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .replace(/\x1b\[K/g, '') // Remove clear line codes
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Remove cursor movement codes
        .replace(/\x1b\[1G/g, '') // Remove cursor to column 1
        .replace(/\x1b\[0J/g, '') // Remove clear screen
        .replace(/[\\|/\-]/g, '') // Remove spinner characters
        .replace(/^\s+|\s+$/g, '') // Trim whitespace
        .replace(/\n{3,}/g, '\n\n'); // Remove excessive newlines

      // If output is empty or just spinner, it means the real error is elsewhere
      const hasRealOutput = cleanOutput.length > 10 && !cleanOutput.match(/^[\s\\|/\-]*$/);

      if (exitCode === 0) {
        this.config.onTerminalWrite(`\x1b[32m✅ Command completed successfully\x1b[0m\n`);
        return {
          success: true,
          message: `Command executed successfully: ${command} ${args.join(' ')}${hasRealOutput ? `\n\nOutput:\n${cleanOutput}` : ''}`,
          data: { command, args, exitCode, output: cleanOutput, rawOutput: stdoutBuffer }
        };
      } else {
        this.config.onTerminalWrite(`\x1b[31m❌ Command failed with exit code ${exitCode}\x1b[0m\n`);

        let errorMessage = `Command failed: ${command} ${args.join(' ')} (exit code: ${exitCode})`;

        if (hasRealOutput) {
          errorMessage += `\n\nOutput:\n${cleanOutput}`;
        } else {
          // Provide helpful context when no output is captured
          errorMessage += `\n\nNo error output was captured. This typically means:\n`;
          errorMessage += `  • The package may not exist or the name is incorrect\n`;
          errorMessage += `  • There might be a network issue\n`;
          errorMessage += `  • The package may be incompatible with the current environment\n`;
          errorMessage += `  • Check the terminal for more details`;
        }

        return {
          success: false,
          message: errorMessage,
          error: `Exit code: ${exitCode}`,
          data: { command, args, exitCode, output: cleanOutput, rawOutput: stdoutBuffer }
        };
      }
    } catch (error) {
      return this.handleProxyError(error, `command execution (${command} ${args.join(' ')})`);
    }
  }

  async installPackage(packageName: string, isDev: boolean = false): Promise<ToolResult> {
    const args = ['install', packageName];
    if (isDev) args.push('--save-dev');
    
    return this.runCommand('npm', args);
  }

  async uninstallPackage(packageName: string): Promise<ToolResult> {
    return this.runCommand('npm', ['uninstall', packageName]);
  }

  async runScript(scriptName: string): Promise<ToolResult> {
    return this.runCommand('npm', ['run', scriptName]);
  }

  // Utility Operations
  async getProjectInfo(): Promise<ToolResult> {
    try {
      const packageJsonResult = await this.readFile('package.json');
      if (!packageJsonResult.success) {
        return { success: false, message: 'Could not read package.json', error: packageJsonResult.error };
      }

      const packageJson = JSON.parse(packageJsonResult.data.content);
      
      return {
        success: true,
        message: 'Project information retrieved',
        data: {
          name: packageJson.name,
          version: packageJson.version,
          description: packageJson.description,
          dependencies: packageJson.dependencies || {},
          devDependencies: packageJson.devDependencies || {},
          scripts: packageJson.scripts || {},
          workingDirectory: this.config.workingDirectory
        }
      };
    } catch (error) {
      const errorMsg = `Failed to get project info: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async searchFiles(pattern: string, searchContent: boolean = true): Promise<ToolResult> {
    try {
      const matches: Array<{ path: string; type: string; matchType: 'filename' | 'content'; preview?: string; lineNumber?: number }> = [];

      const searchInTree = (nodes: FileNode[], currentPath: string = '') => {
        for (const node of nodes) {
          const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;

          // Search by filename
          if (node.name.toLowerCase().includes(pattern.toLowerCase()) || fullPath.toLowerCase().includes(pattern.toLowerCase())) {
            matches.push({
              path: fullPath,
              type: node.type,
              matchType: 'filename'
            });
          }

          // Search by content (only for files)
          if (searchContent && node.type === 'file' && node.content) {
            const lines = node.content.split('\n');
            lines.forEach((line, index) => {
              if (line.toLowerCase().includes(pattern.toLowerCase())) {
                matches.push({
                  path: fullPath,
                  type: node.type,
                  matchType: 'content',
                  lineNumber: index + 1,
                  preview: line.trim().substring(0, 150) + (line.length > 150 ? '...' : '')
                });
              }
            });
          }

          if (node.children) {
            searchInTree(node.children, fullPath);
          }
        }
      };

      searchInTree(this.config.files);

      // Build detailed message
      const fileMatches = matches.filter(m => m.matchType === 'filename');
      const contentMatches = matches.filter(m => m.matchType === 'content');

      let message = `Search completed for pattern: "${pattern}"\n\n`;
      message += `Found ${matches.length} total matches:\n`;
      message += `  • ${fileMatches.length} filename matches\n`;
      message += `  • ${contentMatches.length} content matches\n\n`;

      if (fileMatches.length > 0) {
        message += `Filename matches:\n`;
        fileMatches.slice(0, 10).forEach(m => {
          message += `  📄 ${m.path}\n`;
        });
        if (fileMatches.length > 10) message += `  ... and ${fileMatches.length - 10} more\n`;
      }

      if (contentMatches.length > 0) {
        message += `\nContent matches:\n`;
        const groupedByFile = contentMatches.reduce((acc, match) => {
          if (!acc[match.path]) acc[match.path] = [];
          acc[match.path].push(match);
          return acc;
        }, {} as Record<string, typeof contentMatches>);

        Object.entries(groupedByFile).slice(0, 5).forEach(([path, fileMatches]) => {
          message += `  📄 ${path} (${fileMatches.length} matches)\n`;
          fileMatches.slice(0, 3).forEach(m => {
            message += `    Line ${m.lineNumber}: ${m.preview}\n`;
          });
          if (fileMatches.length > 3) message += `    ... and ${fileMatches.length - 3} more matches\n`;
        });
        if (Object.keys(groupedByFile).length > 5) {
          message += `  ... and ${Object.keys(groupedByFile).length - 5} more files\n`;
        }
      }

      this.config.onTerminalWrite(`\x1b[32m✅ Search completed: ${matches.length} matches for "${pattern}"\x1b[0m\n`);

      return {
        success: true,
        message,
        data: { pattern, matches, count: matches.length, fileMatches: fileMatches.length, contentMatches: contentMatches.length }
      };
    } catch (error) {
      const errorMsg = `Failed to search files: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async getAllFiles(): Promise<ToolResult> {
    try {
      const allFiles: Array<{ path: string; type: string; size: number }> = [];
      
      const traverseTree = (nodes: FileNode[], currentPath: string = '') => {
        for (const node of nodes) {
          const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
          
          allFiles.push({
            path: fullPath,
            type: node.type,
            size: node.content?.length || 0
          });
          
          if (node.children) {
            traverseTree(node.children, fullPath);
          }
        }
      };

      traverseTree(this.config.files);

      this.config.onTerminalWrite(`\x1b[32m✅ Listed all files: ${allFiles.length} items\x1b[0m\n`);

      return {
        success: true,
        message: `Found ${allFiles.length} files and directories`,
        data: { files: allFiles, count: allFiles.length }
      };
    } catch (error) {
      const errorMsg = `Failed to get all files: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async getFileStructure(): Promise<ToolResult> {
    try {
      const structure = this.config.files;

      return {
        success: true,
        message: 'Project structure retrieved',
        data: { structure, fileCount: this.config.files.length }
      };
    } catch (error) {
      const errorMsg = `Failed to get file structure: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // File tree manipulation helpers
  private findFileInTree(nodes: FileNode[], path: string): FileNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = this.findFileInTree(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  private findDirectoryInTree(nodes: FileNode[], path: string): FileNode | null {
    for (const node of nodes) {
      if (node.path === path && node.type === 'directory') return node;
      if (node.children) {
        const found = this.findDirectoryInTree(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  async buildAndStart(): Promise<ToolResult> {
    try {
      // Check if package.json exists and has a build script
      const packageJsonResult = await this.readFile('package.json');
      if (!packageJsonResult.success) {
        return { 
          success: false, 
          message: 'No package.json found. Cannot build project.', 
          error: 'NO_PACKAGE_JSON' 
        };
      }

      const packageJson = JSON.parse(packageJsonResult.data.content);
      const scripts = packageJson.scripts || {};
      
      // Check if build script exists
      if (!scripts.build) {
        return {
          success: false,
          message: 'No "build" script found in package.json. Please add a "build" script to package.json.',
          error: 'NO_BUILD_SCRIPT'
        };
      }

      // Run npm run build
      const result = await this.runCommand('npm', ['run', 'build']);
      
      if (result.success) {
        return {
          success: true,
          message: `✅ Build completed successfully using 'npm run build'.\n\n` +
                   `Project has been built without errors.\n` +
                   `All files compiled successfully.\n\n` +
                   `Output:\n${result.data?.output || 'Build completed successfully'}`,
          data: {
            script: 'build',
            command: 'npm run build',
            output: result.data?.output
          }
        };
      } else {
        return {
          success: false,
          message: `❌ Build failed when running 'npm run build'.\n\n` +
                   `Error:\n${result.error || result.message || 'Unknown build error'}\n\n` +
                   `Please check the code for:\n` +
                   `- Syntax errors\n` +
                   `- TypeScript type errors\n` +
                   `- Missing dependencies\n` +
                   `- Import/export issues`,
          error: result.error || result.message || 'BUILD_FAILED',
          data: {
            script: 'build',
            command: 'npm run build',
            output: result.data?.output
          }
        };
      }
    } catch (error) {
      const errorMsg = `Failed to run build: ${error}`;
      return { 
        success: false, 
        message: `❌ ${errorMsg}\n\nPlease ensure all dependencies are installed and there are no syntax errors.`, 
        error: String(error) 
      };
    }
  }

  private addFileToTree(nodes: FileNode[], path: string, content: string): FileNode[] {
    const pathParts = path.split('/');
    const fileName = pathParts.pop()!;
    const dirPath = pathParts.join('/');

    if (dirPath === '') {
      // Add to root
      return [...nodes.filter(n => n.name !== fileName), {
        name: fileName,
        type: 'file',
        path,
        content
      }];
    }

    // Add to subdirectory
    return nodes.map(node => {
      if (node.path === dirPath && node.type === 'directory') {
        return {
          ...node,
          children: [...(node.children || []).filter(n => n.name !== fileName), {
            name: fileName,
            type: 'file',
            path,
            content
          }]
        };
      }
      if (node.children) {
        return { ...node, children: this.addFileToTree(node.children, path, content) };
      }
      return node;
    });
  }

  private updateFileInTree(nodes: FileNode[], path: string, content: string): FileNode[] {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, content };
      }
      if (node.children) {
        return { ...node, children: this.updateFileInTree(node.children, path, content) };
      }
      return node;
    });
  }

  private removeFileFromTree(nodes: FileNode[], path: string): FileNode[] {
    return nodes.filter(node => {
      if (node.path === path) return false;
      if (node.children) {
        node.children = this.removeFileFromTree(node.children, path);
      }
      return true;
    });
  }

  private addDirectoryToTree(nodes: FileNode[], path: string): FileNode[] {
    const pathParts = path.split('/');
    const dirName = pathParts.pop()!;
    const parentPath = pathParts.join('/');

    if (parentPath === '') {
      // Add to root
      return [...nodes.filter(n => n.name !== dirName), {
        name: dirName,
        type: 'directory',
        path,
        children: []
      }];
    }

    // Add to subdirectory
    return nodes.map(node => {
      if (node.path === parentPath && node.type === 'directory') {
        return {
          ...node,
          children: [...(node.children || []).filter(n => n.name !== dirName), {
            name: dirName,
            type: 'directory',
            path,
            children: []
          }]
        };
      }
      if (node.children) {
        return { ...node, children: this.addDirectoryToTree(node.children, path) };
      }
      return node;
    });
  }
}

// Tool registry for easy access
export const createLumaTools = (config: LumaToolsConfig): Record<string, any> => {
  const tools = new LumaTools(config);

  return {
    // File operations
    create_file: (params: any) => tools.createFile(params.path, params.content || ''),
    read_file: (params: any) => tools.readFile(params.path),
    edit_file: (params: any) => tools.updateFile(params.path, params.content),
    edit_file_section: (params: any) => tools.editFileSection(params.path, params.old_text, params.new_text),
    update_file: (params: any) => tools.updateFile(params.path, params.content),
    delete_file: (params: any) => tools.deleteFile(params.path),
    
    // Directory operations
    create_directory: (params: any) => tools.createDirectory(params.path),
    list_directory: (params: any) => tools.listDirectory(params.path || '.', params.include_content || false),
    list_files: (params: any) => tools.listDirectory(params.path || '.', params.include_content || false), // Alias for list_directory

    // Container operations
    run_command: (params: any) => tools.runCommand(params.command, params.args || []),
    install_package: (params: any) => tools.installPackage(params.package, params.dev || false),
    uninstall_package: (params: any) => tools.uninstallPackage(params.package),
    run_script: (params: any) => tools.runScript(params.script),

    // Utility operations
    get_project_info: () => tools.getProjectInfo(),
    search_files: (params: any) => tools.searchFiles(params.pattern, params.search_content !== false),
    get_all_files: () => tools.getAllFiles(),
    get_file_structure: () => tools.getFileStructure(),
    build_and_start: () => tools.buildAndStart(),

    // Additional aliases for common AI expectations
    ls: (params: any) => tools.listDirectory(params?.path || '.', params?.include_content || false),
    cat: (params: any) => tools.readFile(params.path),
    mkdir: (params: any) => tools.createDirectory(params.path),
    touch: (params: any) => tools.createFile(params.path, ''),
    grep: (params: any) => tools.searchFiles(params.pattern, true), // Search content by default
    
    // Direct access to tools instance for config updates
    _tools: tools,
    _updateConfig: tools.updateConfig.bind(tools)
  };
}; 