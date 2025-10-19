import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Play, Square, Loader2, FolderOpen, Code } from 'lucide-react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from '@xterm/xterm';
import { createLumaTools } from '../services/lumaTools';
import { webContainerManager } from '../services/webContainerManager';

// Components
import CreateProjectModal from './lumaui_components/CreateProjectModal';
import ProjectSelectionModal from './lumaui_components/ProjectSelectionModal';
import ProjectManager from './lumaui_components/ProjectManager';
import ChatWindow from './lumaui_components/ChatWindow';
import RightPanelWorkspace from './lumaui_components/RightPanelWorkspace';

// Hooks
// Types and Data
import { Project, FileNode } from '../types';
import { useIndexedDB } from '../hooks/useIndexedDB';
import { ProjectScaffolderV2, PROJECT_TEMPLATES, ScaffoldProgress } from '../services/projectScaffolderV2';
import { useProviders } from '../contexts/ProvidersContext';
import { db } from '../db';
import { getDefaultWallpaper } from '../utils/uiPreferences';
import ChatPersistence from './lumaui_components/ChatPersistence';

// Providers
import { ProvidersProvider } from '../contexts/ProvidersContext';
import { CheckpointProvider } from './lumaui_components/CheckpointManager';

const LumaUICore: React.FC = () => {
  // Provider context (currently unused but available for future features)
  const { } = useProviders();
  
  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSelectionModalOpen, setIsProjectSelectionModalOpen] = useState(false);
  const [showManagerPage, setShowManagerPage] = useState(true); // Show manager by default
  const [webContainer, setWebContainer] = useState<WebContainer | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [rightPanelMode, setRightPanelMode] = useState<'editor' | 'preview' | 'settings'>('editor');
  const [scaffoldProgress, setScaffoldProgress] = useState<ScaffoldProgress | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [projectViewMode, setProjectViewMode] = useState<'play' | 'edit'>('edit'); // Track if user wants play-only or full IDE
  const [terminalOutput, setTerminalOutput] = useState<Array<{id: string; text: string; timestamp: Date}>>([]);


  // Refs
  const terminalRef = useRef<Terminal | null>(null);
  const runningProcessesRef = useRef<any[]>([]);
  const shellProcessRef = useRef<any>(null); // Track shell process for interactive terminal
  const terminalDataDisposableRef = useRef<{ dispose: () => void } | null>(null); // Track terminal event disposable
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Per-project output buffers to persist terminal output across switches
  const projectOutputBuffers = useRef<Map<string, string[]>>(new Map());

  // Database hook
  const { saveProjectToDB, loadProjectsFromDB, loadProjectFilesFromDB, deleteProjectFromDB } = useIndexedDB();

  // Initialize WebContainerManager and force cleanup on mount
  useEffect(() => {
    const init = async () => {
      try {
        console.log('[LumaUI] Initializing WebContainerManager...');

        // Initialize manager
        await webContainerManager.initialize();

        // FORCE cleanup any stale containers - CRITICAL FOR ELECTRON!
        console.log('[LumaUI] Force cleaning up any zombie WebContainer instances...');
        await webContainerManager.forceCleanup();

        // Set up callback for when container is destroyed
        webContainerManager.setDestroyCallback(() => {
          console.log('[LumaUI] WebContainer destroyed, updating all running projects to idle...');
          // Update all projects that might be running back to idle
          setProjects(prev => prev.map(p =>
            p.status === 'running' ? { ...p, status: 'idle' as const, previewUrl: undefined } : p
          ));
          // Update selected project if it was running
          setSelectedProject(prev =>
            prev && prev.status === 'running'
              ? { ...prev, status: 'idle' as const, previewUrl: undefined }
              : prev
          );
          // Also clear the webContainer state
          setWebContainer(null);
        });

        console.log('[LumaUI] ✅ WebContainerManager ready');

        // Write to terminal if available
        setTimeout(() => {
          if (terminalRef.current) {
            writeToTerminal('\x1b[32m✅ WebContainerManager initialized and ready\x1b[0m\n\n');
          }
        }, 100);
      } catch (error) {
        console.error('Failed to initialize WebContainerManager:', error);
      }
    };
    init();

    // Cleanup on component unmount
    return () => {
      console.log('[LumaUI] Component unmounting, cleaning up WebContainer...');
      webContainerManager.forceCleanup().catch(console.error);
    };
  }, []);

  // CRITICAL FOR ELECTRON: Cleanup before window reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[LumaUI] Window reloading/closing, cleaning up WebContainer...');

      // Try to cleanup (Electron-specific behavior)
      webContainerManager.forceCleanup().catch(console.error);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        } else {
          // Set Aurora Borealis as default wallpaper when none is set
          const defaultWallpaper = getDefaultWallpaper();
          if (defaultWallpaper) {
            setWallpaperUrl(defaultWallpaper);
          }
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
        // Fallback to default wallpaper on error
        const defaultWallpaper = getDefaultWallpaper();
        if (defaultWallpaper) {
          setWallpaperUrl(defaultWallpaper);
        }
      }
    };
    loadWallpaper();
  }, []);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      const savedProjects = await loadProjectsFromDB();
      setProjects(savedProjects);

      // Show manager page if no project selected
      if (!selectedProject) {
        setShowManagerPage(true);
      }
    };
    loadProjects();
  }, [loadProjectsFromDB, selectedProject]);

  // Cleanup on unmount and page unload
  useEffect(() => {
    // Cleanup function for when component unmounts or page is closed
    const cleanup = async () => {
      // Clear save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set all projects to idle status before closing
      try {
        const dbRequest = window.indexedDB.open('lumaui-projects', 1);
        dbRequest.onsuccess = () => {
          const transaction = dbRequest.result.transaction(['projects'], 'readwrite');
          const store = transaction.objectStore('projects');

          // Get all projects
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const allProjects = getAllRequest.result;

            // Update each project to idle
            allProjects.forEach((project: Project) => {
              if (project.status === 'running') {
                store.put({
                  ...project,
                  status: 'idle',
                  previewUrl: undefined
                });
              }
            });
          };
        };
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    };

    // Handle page unload/refresh
    const handleBeforeUnload = () => {
      // Synchronously update projects to idle in localStorage as backup
      try {
        localStorage.setItem('lumaui-cleanup-needed', 'true');
      } catch (e) {
        console.error('Failed to set cleanup flag:', e);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cleanup();
      // Cleanup WebContainerManager
      webContainerManager.cleanup(writeToTerminal);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
    
  // Utility functions
  const writeToTerminal = (data: string) => {
    if (terminalRef.current) {
      terminalRef.current.write(data);

      // Buffer output for current project to persist across switches
      if (selectedProject?.id) {
        const buffer = projectOutputBuffers.current.get(selectedProject.id) || [];
        buffer.push(data);

        // Limit buffer size to prevent memory issues (keep last 1000 lines)
        if (buffer.length > 1000) {
          buffer.shift();
        }

        projectOutputBuffers.current.set(selectedProject.id, buffer);
      }
    }

    // Also add to terminal output state for PreviewPane console
    setTerminalOutput(prev => {
      const newEntry = {
        id: `terminal-${Date.now()}-${Math.random()}`,
        text: data,
        timestamp: new Date()
      };

      // Keep last 500 entries to prevent memory issues
      const updated = [...prev, newEntry];
      if (updated.length > 500) {
        return updated.slice(-500);
      }
      return updated;
    });
  };

  // Spawn and attach interactive shell to terminal
  const attachShellToTerminal = async (container: WebContainer) => {
    if (!terminalRef.current) {
      console.warn('Terminal not ready for shell attachment');
      return;
    }

    try {
      // Dispose existing terminal data handler if any
      if (terminalDataDisposableRef.current) {
        try {
          terminalDataDisposableRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing previous terminal handler:', e);
        }
        terminalDataDisposableRef.current = null;
      }

      // Kill existing shell if any
      if (shellProcessRef.current) {
        try {
          shellProcessRef.current.kill();
          await new Promise(resolve => setTimeout(resolve, 100)); // Wait for kill
        } catch (e) {
          console.warn('Error killing previous shell:', e);
        }
        shellProcessRef.current = null;
      }

      const terminal = terminalRef.current;

      writeToTerminal('\x1b[90m🐚 Spawning interactive shell (bash)...\x1b[0m\n');

      // Spawn interactive shell (bash for better compatibility, fallback to jsh)
      let shellCommand = 'bash';
      let shellProcess;

      try {
        shellProcess = await container.spawn(shellCommand, [], {
          terminal: {
            cols: terminal.cols,
            rows: terminal.rows,
          },
        });
      } catch (error) {
        // Fallback to jsh if bash doesn't exist
        writeToTerminal('\x1b[90m  Bash not available, using jsh...\x1b[0m\n');
        shellCommand = 'jsh';
        shellProcess = await container.spawn(shellCommand, [], {
          terminal: {
            cols: terminal.cols,
            rows: terminal.rows,
          },
        });
      }

      shellProcessRef.current = shellProcess;

      // Pipe shell output to terminal
      shellProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            terminal.write(data);
          },
        })
      ).catch(err => {
        console.warn('Shell output pipe error:', err);
      });

      // Create writable stream for shell input
      const input = shellProcess.input.getWriter();

      // Handle terminal input (send to shell)
      const handleTerminalData = (data: string) => {
        try {
          input.write(data);
        } catch (err) {
          console.warn('Error writing to shell input:', err);
        }
      };

      // Attach input handler and store disposable for cleanup
      const disposable = terminal.onData(handleTerminalData);
      terminalDataDisposableRef.current = disposable;

      // Handle shell exit
      shellProcess.exit.then((exitCode) => {
        console.log(`Shell exited with code ${exitCode}`);
        shellProcessRef.current = null;

        // Clean up terminal data handler when shell exits
        if (terminalDataDisposableRef.current) {
          try {
            terminalDataDisposableRef.current.dispose();
          } catch (e) {
            console.warn('Error disposing terminal handler on shell exit:', e);
          }
          terminalDataDisposableRef.current = null;
        }
        // Don't write to terminal here as it might be disposed
      }).catch(err => {
        console.warn('Shell exit error:', err);
        shellProcessRef.current = null;

        // Clean up terminal data handler on error too
        if (terminalDataDisposableRef.current) {
          try {
            terminalDataDisposableRef.current.dispose();
          } catch (e) {
            console.warn('Error disposing terminal handler on shell error:', e);
          }
          terminalDataDisposableRef.current = null;
        }
      });

      writeToTerminal('\x1b[32m✅ Interactive shell ready\x1b[0m\n\n');
      console.log('✅ Interactive shell attached to terminal');
    } catch (error) {
      console.error('Failed to attach shell to terminal:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      writeToTerminal(`\x1b[33m⚠️ Shell attachment skipped: ${errorMsg}\x1b[0m\n`);
      writeToTerminal('\x1b[90m💡 Process output will still be shown in terminal\x1b[0m\n\n');
      // Don't fail the entire boot process if shell fails
    }
  };

  const buildFileTreeFromContainer = async (container: WebContainer, basePath = ''): Promise<FileNode[]> => {
    try {
      const entries = await container.fs.readdir(basePath || '/', { withFileTypes: true });
    const nodes: FileNode[] = [];
    
      for (const entry of entries) {
        // Skip common build/cache directories
        if (['node_modules', '.git', 'dist', 'build', '.next', '.vscode'].includes(entry.name)) {
          continue;
        }
        
        const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
        if (entry.isDirectory()) {
          const children = await buildFileTreeFromContainer(container, fullPath);
        nodes.push({
            name: entry.name,
            type: 'directory',
            children,
            path: fullPath
        });
        } else {
          try {
            const content = await container.fs.readFile(fullPath, 'utf-8');
        nodes.push({
              name: entry.name,
              type: 'file',
              content: content,
              path: fullPath
        });
          } catch (error) {
            console.warn(`Could not read file ${fullPath}:`, error);
          }
      }
    }
    
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Error building file tree:', error);
      return [];
    }
  };

  // Project handlers
  const handleCreateProject = async (name: string, configId: string) => {
    // Check WebContainer compatibility
    if (!window.crossOriginIsolated) {
      const errorMsg = `WebContainer requires cross-origin isolation to run properly.

For development, you can serve your app with:
- npm run dev (if using Vite with proper headers)
- Or serve with headers: Cross-Origin-Embedder-Policy: require-corp and Cross-Origin-Opener-Policy: same-origin

This is a browser security requirement for WebContainer.`;

      writeToTerminal('\x1b[31m❌ Cross-Origin Isolation Required\x1b[0m\n');
      writeToTerminal('\x1b[33m' + errorMsg + '\x1b[0m\n');
      alert(errorMsg);
      return;
    }

    const template = PROJECT_TEMPLATES[configId];
    if (!template) {
      throw new Error(`Unknown project template: ${configId}`);
    }

    // Switch to editor mode during creation (no tabs anymore - terminal is in editor mode)
    setRightPanelMode('editor');

    const newProject: Project = {
      id: `project-${Date.now()}`,
      name,
      framework: configId as any,
      status: 'idle',
      createdAt: new Date()
    };

    let container: WebContainer | null = null;

    try {
      // Don't clear terminal - add visual separator instead
      writeToTerminal(`\n\x1b[90m${'═'.repeat(80)}\x1b[0m\n`);
      writeToTerminal('\x1b[35m✨ Creating New Project\x1b[0m\n');
      writeToTerminal(`\x1b[90m${'═'.repeat(80)}\x1b[0m\n\n`);

      // Update current project status if any
      if (selectedProject) {
        const updatedProject = { ...selectedProject, status: 'idle' as const, previewUrl: undefined };
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
        setSelectedProject(updatedProject);
      }

      // Initialize WebContainer for scaffolding
      writeToTerminal('\x1b[36m🚀 Preparing WebContainer...\x1b[0m\n');
      writeToTerminal('\x1b[33m📋 Project: ' + name + '\x1b[0m\n');
      writeToTerminal('\x1b[33m📋 Template: ' + template.name + '\x1b[0m\n');
      writeToTerminal('\x1b[90m📋 Cross-Origin Isolation: ✅ Available\x1b[0m\n\n');

      // REUSE WebContainer if it exists! Much faster!
      container = await webContainerManager.getOrBootContainer(writeToTerminal);

      // Don't attach shell yet - wait until project is scaffolded

      // Create scaffolder and run project setup
      const scaffolder = new ProjectScaffolderV2(container, writeToTerminal);
      
      const success = await scaffolder.scaffoldProject(template, name, (progress: ScaffoldProgress) => {
        setScaffoldProgress(progress);
        writeToTerminal(`\x1b[36m📊 Progress: ${progress.currentStep}/${progress.totalSteps} - ${progress.stepName}\x1b[0m\n`);
      });
      
      if (!success) {
        writeToTerminal('\x1b[31m❌ Project scaffolding failed - check output above for details\x1b[0m\n');
        throw new Error('Project scaffolding failed - check terminal output for details');
      }
      
      // Build file tree from the scaffolded project
      writeToTerminal('\x1b[33m📁 Building file tree...\x1b[0m\n');
      const fileNodes = await buildFileTreeFromContainer(container);
      
      if (fileNodes.length === 0) {
        writeToTerminal('\x1b[31m❌ No files found in scaffolded project\x1b[0m\n');
        throw new Error('No files found in scaffolded project');
      }
      
      writeToTerminal(`\x1b[32m✅ Found ${fileNodes.length} files/directories\x1b[0m\n`);

      // NOW attach shell after project is scaffolded
      writeToTerminal('\n');
      await attachShellToTerminal(container);

      // Save to database
      writeToTerminal('\x1b[33m💾 Saving project to database...\x1b[0m\n');
      await saveProjectToDB(newProject, fileNodes);
      
      // Update state
      setProjects(prev => [newProject, ...prev]);
      setSelectedProject(newProject);
      setFiles(fileNodes);
      setSelectedFile(null);
      setSelectedFileContent('');
      setIsCreateModalOpen(false);
      setIsProjectSelectionModalOpen(false);

      // Hide manager page and open project in edit mode
      setShowManagerPage(false);
      setProjectViewMode('edit');

      writeToTerminal('\x1b[32m🎉 Project created and ready!\x1b[0m\n');
      writeToTerminal('\x1b[36m💡 You can now start the project using the Start button\x1b[0m\n\n');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to create project:', error);
      writeToTerminal(`\x1b[31m❌ Project creation failed: ${errorMessage}\x1b[0m\n`);
      writeToTerminal('\x1b[31m🔍 Check the error details above for more information\x1b[0m\n\n');

      // Show error in modal too
      alert(`Project creation failed: ${errorMessage}\n\nCheck the terminal for details.`);
      throw error;
    } finally {
      // NOTE: WebContainerManager handles cleanup automatically
      // Container stays active for the project - will be cleaned up when switching projects
      setScaffoldProgress(null);
    }
  };

  const handleProjectSelect = async (project: Project, viewMode: 'play' | 'edit' = 'edit') => {
    // Hide manager page and close modal
    setShowManagerPage(false);
    setIsProjectSelectionModalOpen(false);

    // Set the view mode for this project
    setProjectViewMode(viewMode);

    // Start in editor mode to ensure terminal initializes properly
    // We'll switch to preview mode after shell is attached
    setRightPanelMode('editor');

    // Don't clear terminal - keep output history persistent
    // Add visual separator to distinguish between projects
    writeToTerminal(`\n\x1b[90m${'─'.repeat(80)}\x1b[0m\n`);
    writeToTerminal(`\x1b[36m🔄 Switching to project: ${project.name}\x1b[0m\n`);
    
    // Force cleanup any existing WebContainer instance before switching
    if (webContainer || selectedProject) {
      writeToTerminal('\x1b[33m🛑 Stopping current project and cleaning up containers...\x1b[0m\n');
      
      if (selectedProject) {
        // Update the current project status to idle
        const updatedCurrentProject = { ...selectedProject, status: 'idle' as const, previewUrl: undefined };
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedCurrentProject : p));
      }
      
      // Clean up running processes
      if (runningProcessesRef.current.length > 0) {
        writeToTerminal('\x1b[33m⏹️ Terminating existing processes...\x1b[0m\n');
        for (const process of runningProcessesRef.current) {
          try {
            if (process && process.kill) {
              process.kill();
            }
          } catch (error) {
            console.log('Error killing process during project switch:', error);
          }
        }
        runningProcessesRef.current = [];
      }
      
      // Teardown existing container
      if (webContainer) {
        try {
          await webContainer.teardown();
          writeToTerminal('\x1b[32m✅ Previous WebContainer cleaned up\x1b[0m\n');
        } catch (cleanupError) {
          writeToTerminal('\x1b[33m⚠️ Warning: Error cleaning up previous container, proceeding anyway...\x1b[0m\n');
        }
        setWebContainer(null);
      }
      
      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedProject(project);
    
    writeToTerminal(`\x1b[33m📂 Loading project files from database...\x1b[0m\n`);
    
    const savedFiles = await loadProjectFilesFromDB(project.id);
    writeToTerminal(`\x1b[32m✅ Loaded ${savedFiles.length} files from database\x1b[0m\n`);
    
    if (savedFiles.length > 0) {
      setFiles(savedFiles);
      // Log some file details for debugging
      const fileCount = savedFiles.filter(f => f.type === 'file').length;
      const dirCount = savedFiles.filter(f => f.type === 'directory').length;
      writeToTerminal(`\x1b[90m   Files: ${fileCount}, Directories: ${dirCount}\x1b[0m\n`);
      
      // Check if package.json exists
      const hasPackageJson = savedFiles.some(f => f.name === 'package.json' && f.type === 'file');
      writeToTerminal(`\x1b[90m   package.json present: ${hasPackageJson ? '✅' : '❌'}\x1b[0m\n`);
    } else {
      writeToTerminal(`\x1b[31m❌ No files found in database for project ${project.id}\x1b[0m\n`);
      return;
    }
    
    setSelectedFile(null);
    setSelectedFileContent('');

    // Restore buffered output for this project if it exists
    const buffer = projectOutputBuffers.current.get(project.id);
    if (buffer && buffer.length > 0) {
      writeToTerminal(`\x1b[90m📋 Restoring ${buffer.length} previous output entries...\x1b[0m\n`);
      writeToTerminal(`\x1b[90m${'─'.repeat(80)}\x1b[0m\n`);
      // Note: Don't replay the buffer here as it's already in terminal history
      // The terminal persists, so old output is still visible
    }

    writeToTerminal('\x1b[36m💡 Project loaded. Click Start to run the project (terminal will activate when started).\x1b[0m\n\n');

    // Wait a moment for terminal to initialize (it's in editor mode now)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Now switch to preview mode for auto-start
    setRightPanelMode('preview');
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      writeToTerminal(`\x1b[33m🗑️ Deleting project: ${project.name}\x1b[0m\n`);
      
      // If the project to be deleted is currently selected, handle cleanup
      if (selectedProject && selectedProject.id === project.id) {
        writeToTerminal('\x1b[33m🛑 Stopping and cleaning up current project...\x1b[0m\n');
        
        // Clean up running processes
        if (runningProcessesRef.current.length > 0) {
          for (const process of runningProcessesRef.current) {
            try {
              if (process && process.kill) {
                process.kill();
              }
            } catch (error) {
              console.log('Error killing process during project deletion:', error);
            }
          }
          runningProcessesRef.current = [];
        }
        
        // Teardown existing container
        if (webContainer) {
          try {
            await webContainer.teardown();
            writeToTerminal('\x1b[32m✅ WebContainer cleaned up\x1b[0m\n');
          } catch (cleanupError) {
            writeToTerminal('\x1b[33m⚠️ Warning: Error cleaning up container\x1b[0m\n');
          }
          setWebContainer(null);
        }
        
        // Clear UI state
        setSelectedProject(null);
        setFiles([]);
        setSelectedFile(null);
        setSelectedFileContent('');
      }
      
      // Delete from database
      await deleteProjectFromDB(project.id);
      
      // Delete associated chat data
      ChatPersistence.deleteChatData(project.id);
      writeToTerminal(`\x1b[32m✅ Chat data cleared for project\x1b[0m\n`);

      // Clear output buffer for this project
      projectOutputBuffers.current.delete(project.id);

      // Update projects list
      setProjects(prev => prev.filter(p => p.id !== project.id));

      writeToTerminal(`\x1b[32m✅ Project "${project.name}" deleted successfully\x1b[0m\n`);

      // If the deleted project was selected and it was the current one, show manager
      if (selectedProject?.id === project.id) {
        setShowManagerPage(true);
      }
      
    } catch (error) {
      console.error('Failed to delete project:', error);
      writeToTerminal(`\x1b[31m❌ Failed to delete project: ${error}\x1b[0m\n`);
      throw error; // Re-throw so the modal can handle the error
    }
  };

  const startProject = async (project: Project, projectFiles?: FileNode[]) => {
    return startProjectWithFiles(project, projectFiles || files);
  };

  const startProjectWithFiles = async (project: Project, projectFiles: FileNode[]) => {
    if (!window.crossOriginIsolated) {
      alert('WebContainer requires cross-origin isolation to run. Please serve the app with proper headers.');
      return;
    }
    
    setIsStarting(true);
    runningProcessesRef.current = [];
    
    try {
      writeToTerminal('\x1b[36m🚀 Starting project...\x1b[0m\n');
      
      // Force cleanup any existing WebContainer instance
      if (webContainer) {
        writeToTerminal('\x1b[33m🧹 Cleaning up existing WebContainer instance...\x1b[0m\n');

        // Kill shell process first
        if (shellProcessRef.current) {
          try {
            shellProcessRef.current.kill();
            shellProcessRef.current = null;
            writeToTerminal('\x1b[90m⚡ Shell terminated\x1b[0m\n');
          } catch (e) {
            console.warn('Error killing shell during cleanup:', e);
          }
        }

        // Kill running processes
        if (runningProcessesRef.current.length > 0) {
          for (const process of runningProcessesRef.current) {
            try {
              if (process && process.kill) {
                process.kill();
              }
            } catch (e) {
              console.warn('Error killing process:', e);
            }
          }
          runningProcessesRef.current = [];
        }

        try {
          await webContainer.teardown();
          writeToTerminal('\x1b[32m✅ Cleanup complete\x1b[0m\n');
        } catch (cleanupError) {
          writeToTerminal('\x1b[33m⚠️ Warning: Error during cleanup, forcing new instance...\x1b[0m\n');
        }
        setWebContainer(null);

        // Wait for WebContainer to fully release resources
        writeToTerminal('\x1b[90m⏳ Waiting for resources to be released...\x1b[0m\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Try to boot new WebContainer with retry logic
      let container: WebContainer | undefined;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && !container) {
        try {
          writeToTerminal(`\x1b[33m🔧 Getting WebContainer instance...\x1b[0m\n`);
          container = await webContainerManager.getOrBootContainer(writeToTerminal);
          writeToTerminal('\x1b[32m✅ WebContainer instance ready\x1b[0m\n');
          break;
        } catch (bootError) {
          retryCount++;
          const errorMessage = bootError instanceof Error ? bootError.message : String(bootError);
          writeToTerminal(`\x1b[31m❌ Boot attempt ${retryCount} failed: ${errorMessage}\x1b[0m\n`);
          
          if (retryCount < maxRetries) {
            writeToTerminal('\x1b[33m⏳ Waiting 3 seconds before retry...\x1b[0m\n');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Force global cleanup if needed
            if (bootError instanceof Error && bootError.message.includes('single WebContainer instance')) {
              writeToTerminal('\x1b[33m🔨 Forcing extended cleanup time for existing instances...\x1b[0m\n');
              writeToTerminal('\x1b[33m💡 If this keeps failing, try hard refreshing the page (Ctrl+Shift+R)\x1b[0m\n');
              // Give extra time for cleanup
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } else {
            throw new Error(`Failed to boot WebContainer after ${maxRetries} attempts. Please hard refresh the page (Ctrl+Shift+R) and try again.`);
          }
        }
      }
      
      if (!container) {
        throw new Error('Failed to initialize WebContainer. Please hard refresh the page (Ctrl+Shift+R) and try again.');
      }

      setWebContainer(container);

      // Don't attach shell yet - wait until files are mounted

      // Debug: Check files array before creating structure
      writeToTerminal(`\x1b[90m🔍 Debug: projectFiles array contains ${projectFiles.length} items\x1b[0m\n`);
      if (projectFiles.length === 0) {
        writeToTerminal(`\x1b[31m❌ CRITICAL: No files to mount! This will cause package.json not found error.\x1b[0m\n`);
        throw new Error('No files available to mount to WebContainer. Project data may be corrupted.');
      }
      
      // List top-level files for debugging
      const topLevelFiles = projectFiles.filter(f => f.type === 'file').map(f => f.name);
      const topLevelDirs = projectFiles.filter(f => f.type === 'directory').map(f => f.name);
      writeToTerminal(`\x1b[90m   Top-level files: [${topLevelFiles.join(', ')}]\x1b[0m\n`);
      writeToTerminal(`\x1b[90m   Top-level directories: [${topLevelDirs.join(', ')}]\x1b[0m\n`);
      
      // Recreate the project structure from our saved files with error handling
      const createFileStructure = async (nodes: FileNode[], basePath = '') => {
        for (const node of nodes) {
          const fullPath = basePath ? `${basePath}/${node.name}` : node.name;
          
          try {
            if (node.type === 'directory' && node.children) {
              await container!.fs.mkdir(fullPath, { recursive: true });
              writeToTerminal(`\x1b[90m📁 Created directory: ${fullPath}\x1b[0m\n`);
              await createFileStructure(node.children, fullPath);
            } else if (node.type === 'file' && node.content !== undefined) {
              // Ensure directory exists
              const dirPath = fullPath.split('/').slice(0, -1).join('/');
              if (dirPath) {
                await container!.fs.mkdir(dirPath, { recursive: true });
              }
              await container!.fs.writeFile(fullPath, node.content);
              writeToTerminal(`\x1b[90m📄 Created file: ${fullPath} (${node.content.length} bytes)\x1b[0m\n`);
              
              // For package.json, add extra verification
              if (node.name === 'package.json') {
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
                const verification = await container!.fs.readFile(fullPath, 'utf-8');
                if (verification !== node.content) {
                  writeToTerminal(`\x1b[33m⚠️ package.json write verification failed, retrying...\x1b[0m\n`);
                  await container!.fs.writeFile(fullPath, node.content);
                }
                writeToTerminal(`\x1b[32m✅ package.json successfully created and verified\x1b[0m\n`);
              }
            }
          } catch (error) {
            writeToTerminal(`\x1b[31m❌ Failed to create ${fullPath}: ${error}\x1b[0m\n`);
            throw error;
          }
        }
      };
      
      await createFileStructure(projectFiles);
      writeToTerminal('\x1b[32m✅ Project files mounted\x1b[0m\n');
      
      // Verify critical files are accessible before proceeding
      writeToTerminal('\x1b[33m🔍 Verifying project files...\x1b[0m\n');
      
      const verifyFiles = async (retryCount = 0): Promise<void> => {
        const maxRetries = 5;
        const retryDelay = 500; // Start with 500ms, increase each retry
        
        try {
          // Check if package.json exists and is readable
          const packageJson = await container!.fs.readFile('package.json', 'utf-8');
          if (!packageJson || packageJson.trim().length === 0) {
            throw new Error('package.json is empty or unreadable');
          }
          
          // Verify we can parse it as JSON
          JSON.parse(packageJson);
          writeToTerminal('\x1b[32m✅ package.json verified\x1b[0m\n');
          
          // Check working directory
          const currentDir = await container!.fs.readdir('.');
          writeToTerminal(`\x1b[32m✅ Working directory contains ${currentDir.length} items\x1b[0m\n`);
          
        } catch (error) {
          if (retryCount < maxRetries) {
            const delay = retryDelay * (retryCount + 1); // Exponential backoff
            writeToTerminal(`\x1b[33m⏳ File verification failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying in ${delay}ms...\x1b[0m\n`);
            writeToTerminal(`\x1b[90m   Error: ${error}\x1b[0m\n`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return verifyFiles(retryCount + 1);
          } else {
            throw new Error(`File verification failed after ${maxRetries + 1} attempts: ${error}`);
          }
        }
      };
      
      await verifyFiles();

      // NOW attach shell after files are mounted and verified
      writeToTerminal('\n');
      await attachShellToTerminal(container);

      // Install dependencies with retry logic
      writeToTerminal('\x1b[33m📦 Installing dependencies...\x1b[0m\n');
      
      const installWithRetry = async (retryCount = 0): Promise<void> => {
        const maxRetries = 3;
        
        try {
          const installProcess = await container!.spawn('npm', ['install']);
          installProcess.output.pipeTo(new WritableStream({
            write(data) { writeToTerminal(data); }
          }));
          
          const installExitCode = await installProcess.exit;
          if (installExitCode !== 0) {
            throw new Error(`npm install failed with exit code ${installExitCode}`);
          }
          
        } catch (error) {
          if (retryCount < maxRetries) {
            writeToTerminal(`\x1b[33m⏳ npm install failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...\x1b[0m\n`);
            writeToTerminal(`\x1b[90m   Error: ${error}\x1b[0m\n`);
            
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            return installWithRetry(retryCount + 1);
          } else {
            throw error;
          }
        }
      };
      
      await installWithRetry();
      
      writeToTerminal('\x1b[32m✅ Dependencies installed\x1b[0m\n');
      
      // Determine start command based on project type
      const isViteBasedProject = ['react-vite-tailwind', 'vue-vite', 'svelte-kit'].includes(project.framework);
      
      if (isViteBasedProject) {
        writeToTerminal('\x1b[33m🏃 Starting development server...\x1b[0m\n');
        const devProcess = await container!.spawn('npm', ['run', 'dev']);
        runningProcessesRef.current.push(devProcess);
        
        devProcess.output.pipeTo(new WritableStream({
          write(data) { writeToTerminal(data); }
        }));
        
        container!.on('server-ready', async (port, url) => {
          writeToTerminal(`\x1b[32m🌐 Server ready at: ${url}\x1b[0m\n`);
          writeToTerminal(`\x1b[36m💡 Framework: ${project.framework} running on port ${port}\x1b[0m\n`);
          const updatedProject = { ...project, status: 'running' as const, previewUrl: url };
          setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
          setSelectedProject(updatedProject);

          // Save running status to database
          try {
            await saveProjectToDB(updatedProject, files);
          } catch (error) {
            console.error('Failed to save running status:', error);
          }
        });
      } else {
        // For non-Vite projects (vanilla HTML, etc.)
        writeToTerminal('\x1b[33m🌐 Starting static server...\x1b[0m\n');
        const devProcess = await container!.spawn('npm', ['run', 'dev']);
        runningProcessesRef.current.push(devProcess);
        
        devProcess.output.pipeTo(new WritableStream({
          write(data) { writeToTerminal(data); }
        }));
        
        // For static projects, wait for server-ready event or timeout
        const serverReadyPromise = new Promise<{url: string; port: number}>((resolve) => {
          container!.on('server-ready', (port, url) => {
            resolve({ url, port });
          });

          // Fallback timeout for static servers that don't emit server-ready
          setTimeout(() => {
            const url = `${window.location.protocol}//${window.location.hostname}:3000`;
            resolve({ url, port: 3000 });
          }, 3000);
        });

        const { url } = await serverReadyPromise;
        writeToTerminal(`\x1b[32m🌐 Static server ready at: ${url}\x1b[0m\n`);
        const updatedProject = { ...project, status: 'running' as const, previewUrl: url };
        setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
        setSelectedProject(updatedProject);

        // Save running status to database
        try {
          await saveProjectToDB(updatedProject, files);
        } catch (error) {
          console.error('Failed to save running status:', error);
        }
      }
      
    } catch (error) {
      console.error('Failed to start project:', error);
      writeToTerminal(`\x1b[31m❌ Error: ${error}\x1b[0m\n`);
      writeToTerminal('\x1b[31m🔧 Try stopping all projects and starting fresh if the issue persists\x1b[0m\n');
      const updatedProject = { ...project, status: 'error' as const };
      setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
      setSelectedProject(updatedProject);
      
      // Ensure cleanup on error
      if (webContainer) {
        try {
          await webContainer.teardown();
          setWebContainer(null);
          writeToTerminal('\x1b[33m🧹 Cleaned up WebContainer after error\x1b[0m\n');
        } catch (cleanupError) {
          console.warn('Error during error cleanup:', cleanupError);
          setWebContainer(null);
        }
      }
    } finally {
      setIsStarting(false);
    }
  };

  const stopProject = async (project: Project) => {
    writeToTerminal('\x1b[33m🛑 Stopping project...\x1b[0m\n');
    
    if (webContainer) {
      try {
        writeToTerminal('\x1b[33m⏹️ Terminating processes...\x1b[0m\n');

        // Kill shell process first
        if (shellProcessRef.current) {
          try {
            shellProcessRef.current.kill();
            shellProcessRef.current = null;
            writeToTerminal('\x1b[33m⚡ Shell process terminated\x1b[0m\n');
          } catch (error) {
            console.log('Error killing shell:', error);
          }
        }

        if (runningProcessesRef.current.length > 0) {
          for (const process of runningProcessesRef.current) {
            try {
              if (process && process.kill) {
                process.kill();
                writeToTerminal('\x1b[33m⚡ Process terminated\x1b[0m\n');
              }
            } catch (error) {
              console.log('Error killing process:', error);
            }
          }
          runningProcessesRef.current = [];
        }

      await webContainer.teardown();
      setWebContainer(null);
        
        writeToTerminal('\x1b[32m✅ WebContainer stopped successfully\x1b[0m\n');
        writeToTerminal('\x1b[36m💤 Project is now idle\x1b[0m\n\n');
        
      } catch (error) {
        console.error('Error stopping WebContainer:', error);
        writeToTerminal(`\x1b[31m❌ Error stopping project: ${error}\x1b[0m\n`);
        setWebContainer(null);
        runningProcessesRef.current = [];
      }
    }
    
    const updatedProject = { ...project, status: 'idle' as const, previewUrl: undefined };
    setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
    setSelectedProject(updatedProject);

    // Save updated status to database
    try {
      await saveProjectToDB(updatedProject, files);
      writeToTerminal('\x1b[90m💾 Project status saved\x1b[0m\n');
    } catch (error) {
      console.error('Failed to save project status:', error);
    }
  };

  // Function to refresh file tree from WebContainer
  const refreshFileTree = useCallback(async () => {
    if (webContainer && selectedProject) {
      try {
        writeToTerminal('\x1b[33m🔄 Refreshing file tree...\x1b[0m\n');
        const updatedFiles = await buildFileTreeFromContainer(webContainer);
        setFiles(updatedFiles);
        
        // Auto-save updated project state
        if (selectedProject) {
          await saveProjectToDB(selectedProject, updatedFiles);
        }
        
        writeToTerminal(`\x1b[32m✅ File tree refreshed: ${updatedFiles.length} items\x1b[0m\n`);
      } catch (error) {
        console.error('Failed to refresh file tree:', error);
        writeToTerminal(`\x1b[31m❌ Failed to refresh file tree: ${error}\x1b[0m\n`);
      }
    }
  }, [webContainer, selectedProject, saveProjectToDB, writeToTerminal]);

  // Debounced auto-save function
  const debouncedSave = useCallback(async (_content: string, filePath: string, projectFiles: FileNode[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (selectedProject) {
          await saveProjectToDB(selectedProject, projectFiles);
          writeToTerminal(`\x1b[32m💾 Auto-saved: ${filePath}\x1b[0m\n`);
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        writeToTerminal(`\x1b[31m❌ Auto-save failed: ${filePath}\x1b[0m\n`);
      }
    }, 1000); // 1 second debounce
  }, [selectedProject, saveProjectToDB, writeToTerminal]);

  // File handlers
  const handleFileSelect = (path: string, content: string) => {
    setSelectedFile(path);
    setSelectedFileContent(content);
  };

  const handleFileContentChange = async (content: string) => {
    setSelectedFileContent(content);
    
    // Update WebContainer immediately
    if (webContainer && selectedFile) {
      try {
        await webContainer.fs.writeFile(selectedFile, content);
      } catch (error) {
        console.warn('Failed to write to WebContainer:', error);
      }
    }
    
    // Update local state
    const updateFileContent = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === selectedFile) {
          return { ...node, content };
        }
        if (node.children) {
          return { ...node, children: updateFileContent(node.children) };
        }
        return node;
      });
    };
    
    const updatedFiles = updateFileContent(files);
    setFiles(updatedFiles);

    // Auto-save with debouncing
    if (selectedFile) {
      debouncedSave(content, selectedFile, updatedFiles);
    }
  };

  const handleToggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // File operation handlers
  const handleCreateFile = async (parentPath: string, fileName: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
      
      // Create the file with empty content
      await webContainer.fs.writeFile(fullPath, '');
      writeToTerminal(`\x1b[32m✅ Created file: ${fullPath}\x1b[0m\n`);
      
      // Refresh file tree
      await refreshFileTree();
      
      // Auto-select the new file
      handleFileSelect(fullPath, '');
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to create file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleCreateFolder = async (parentPath: string, folderName: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      
      // Create the directory
      await webContainer.fs.mkdir(fullPath, { recursive: true });
      writeToTerminal(`\x1b[32m✅ Created folder: ${fullPath}\x1b[0m\n`);
      
      // Refresh file tree and expand the parent folder
      await refreshFileTree();
      setExpandedFolders(prev => new Set([...prev, parentPath, fullPath]));
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to create folder: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleDeleteFile = async (path: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      console.log(`🗑️ Attempting to delete file: ${path}`);
      await webContainer.fs.rm(path);
      writeToTerminal(`\x1b[32m✅ Deleted file: ${path}\x1b[0m\n`);
      
      // Clear selection if deleted file was selected
      if (selectedFile === path) {
        setSelectedFile(null);
        setSelectedFileContent('');
      }
      
      // Refresh file tree
      console.log('🔄 Refreshing file tree after deletion...');
      await refreshFileTree();
      console.log('✅ File tree refreshed');
    } catch (error) {
      console.error('❌ Delete file error:', error);
      writeToTerminal(`\x1b[31m❌ Failed to delete file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleDeleteFolder = async (path: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      await webContainer.fs.rm(path, { recursive: true });
      writeToTerminal(`\x1b[32m✅ Deleted folder: ${path}\x1b[0m\n`);
      
      // Clear selection if deleted folder contained selected file
      if (selectedFile?.startsWith(path)) {
        setSelectedFile(null);
        setSelectedFileContent('');
      }
      
      // Remove from expanded folders
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        newSet.delete(path);
        // Also remove any child folders
        for (const expandedPath of prev) {
          if (expandedPath.startsWith(path + '/')) {
            newSet.delete(expandedPath);
          }
        }
        return newSet;
      });
      
      // Refresh file tree
      await refreshFileTree();
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to delete folder: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleRenameFile = async (oldPath: string, newPath: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      // Read the current content
      const content = await webContainer.fs.readFile(oldPath, 'utf-8');
      
      // Create the new file
      await webContainer.fs.writeFile(newPath, content);
      
      // Delete the old file
      await webContainer.fs.rm(oldPath);
      
      writeToTerminal(`\x1b[32m✅ Renamed: ${oldPath} → ${newPath}\x1b[0m\n`);
      
      // Update selection if renamed file was selected
      if (selectedFile === oldPath) {
        setSelectedFile(newPath);
      }
      
      // Refresh file tree
      await refreshFileTree();
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to rename file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleDuplicateFile = async (path: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      // Read the current content
      const content = await webContainer.fs.readFile(path, 'utf-8');

      // Generate new filename
      const pathParts = path.split('/');
      const fileName = pathParts.pop() || '';
      const dir = pathParts.join('/');

      const nameParts = fileName.split('.');
      const ext = nameParts.length > 1 ? nameParts.pop() : '';
      const baseName = nameParts.join('.');

      const newFileName = ext ? `${baseName}_copy.${ext}` : `${baseName}_copy`;
      const newPath = dir ? `${dir}/${newFileName}` : newFileName;

      // Create the duplicate
      await webContainer.fs.writeFile(newPath, content);

      writeToTerminal(`\x1b[32m✅ Duplicated: ${path} → ${newPath}\x1b[0m\n`);

      // Refresh file tree
      await refreshFileTree();

      // Auto-select the new file
      handleFileSelect(newPath, content);
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to duplicate file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleUploadFile = async (parentPath: string, files: FileList) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const targetPath = parentPath ? `${parentPath}/${file.name}` : file.name;

        // Read file content
        const content = await file.text();

        // Write to WebContainer
        await webContainer.fs.writeFile(targetPath, content);

        writeToTerminal(`\x1b[32m✅ Uploaded: ${file.name} → ${targetPath}\x1b[0m\n`);
      }

      // Refresh file tree
      await refreshFileTree();

      writeToTerminal(`\x1b[32m✅ Uploaded ${files.length} file(s) successfully\x1b[0m\n`);
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to upload files: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleCopyFile = async (sourcePath: string, targetPath: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      // Read source file
      const content = await webContainer.fs.readFile(sourcePath, 'utf-8');

      // Generate destination path
      const fileName = sourcePath.split('/').pop() || '';
      const destPath = targetPath ? `${targetPath}/${fileName}` : fileName;

      // Check if file already exists
      try {
        await webContainer.fs.readFile(destPath, 'utf-8');
        // File exists, create copy with _copy suffix
        const nameParts = fileName.split('.');
        const ext = nameParts.length > 1 ? nameParts.pop() : '';
        const baseName = nameParts.join('.');
        const newFileName = ext ? `${baseName}_copy.${ext}` : `${baseName}_copy`;
        const finalPath = targetPath ? `${targetPath}/${newFileName}` : newFileName;
        await webContainer.fs.writeFile(finalPath, content);
        writeToTerminal(`\x1b[32m✅ Copied: ${sourcePath} → ${finalPath}\x1b[0m\n`);
      } catch {
        // File doesn't exist, use original name
        await webContainer.fs.writeFile(destPath, content);
        writeToTerminal(`\x1b[32m✅ Copied: ${sourcePath} → ${destPath}\x1b[0m\n`);
      }

      // Refresh file tree
      await refreshFileTree();
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to copy file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleCutFile = async (sourcePath: string, targetPath: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      // Read source file
      const content = await webContainer.fs.readFile(sourcePath, 'utf-8');

      // Generate destination path
      const fileName = sourcePath.split('/').pop() || '';
      const destPath = targetPath ? `${targetPath}/${fileName}` : fileName;

      // Write to destination
      await webContainer.fs.writeFile(destPath, content);

      // Delete source
      await webContainer.fs.rm(sourcePath);

      writeToTerminal(`\x1b[32m✅ Moved: ${sourcePath} → ${destPath}\x1b[0m\n`);

      // Refresh file tree
      await refreshFileTree();

      // Clear selection if the moved file was selected
      if (selectedFilePath === sourcePath) {
        setSelectedFilePath(null);
        setSelectedFileContent('');
      }
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to move file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  // Reconnect shell handler for manual reconnection
  const handleReconnectShell = async () => {
    try {
      writeToTerminal('\n\x1b[36m🔄 Manual shell reconnection triggered...\x1b[0m\n');

      // Get or boot a fresh container
      const activeContainer = await webContainerManager.getOrBootContainer(writeToTerminal);

      // Attach shell
      await attachShellToTerminal(activeContainer);

      // Update webContainer state
      setWebContainer(activeContainer);

      writeToTerminal('\x1b[32m✅ Shell reconnected successfully!\x1b[0m\n\n');
    } catch (error) {
      console.error('Manual shell reconnection failed:', error);
      writeToTerminal('\x1b[31m❌ Shell reconnection failed. Please try starting the project.\x1b[0m\n');
      throw error;
    }
  };

  // Clear chat handler
  const handleClearChat = () => {
    if (selectedProject) {
      ChatPersistence.deleteChatData(selectedProject.id);
      writeToTerminal('\x1b[32m✅ Chat history cleared\x1b[0m\n');
      // Reload the page to reset chat UI
      window.location.reload();
    }
  };

  // Reset project handler
  const handleResetProject = async () => {
    if (selectedProject) {
      try {
        writeToTerminal('\n\x1b[33m🔄 Resetting project...\x1b[0m\n');

        // Stop the project first
        await stopProject(selectedProject);

        // Force cleanup
        await webContainerManager.forceCleanup(writeToTerminal);

        writeToTerminal('\x1b[32m✅ Project reset complete. You can now start fresh.\x1b[0m\n\n');
      } catch (error) {
        console.error('Failed to reset project:', error);
        writeToTerminal('\x1b[31m❌ Failed to reset project. Please try refreshing the page.\x1b[0m\n');
      }
    }
  };

  // Create LumaTools instance for AI operations (after all handlers are defined)
  const lumaTools = useMemo(() => {
    const tools = createLumaTools({
      webContainer,
      files,
      onFilesUpdate: setFiles,
      onFileSelect: handleFileSelect,
      onTerminalWrite: writeToTerminal,
      workingDirectory: selectedProject?.name || '.',
      onRefreshFileTree: refreshFileTree
    });

    return tools;
  }, [webContainer, files, selectedProject?.name, handleFileSelect, writeToTerminal, refreshFileTree]);

  // Show manager page if no project selected or user clicked "Projects" button
  if (showManagerPage || !selectedProject) {
    return (
      <div className="h-[calc(100vh-3rem)]  overflow-hidden">
        <ProjectManager
          projects={projects}
          onSelectProject={handleProjectSelect}
          onDeleteProject={handleDeleteProject}
          onCreateNew={() => setIsCreateModalOpen(true)}
        />

        {/* Create Project Modal */}
        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateProject={handleCreateProject}
          scaffoldProgress={scaffoldProgress}
        />
      </div>
    );
  }

  return (
    // h-screen makes black empty space below since we have topbar - changed to h-[100vh] - w-screen - the side bar is 5rem wide
    <div className="h-[calc(100vh-3rem)] w-[calc(100%)] overflow-hidden bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 relative">
      {/* Wallpaper Background - Absolute positioned, doesn't affect layout */}
      {wallpaperUrl && (
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
            filter: 'blur(2px)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Main Content Layer - Takes full height/width but width - 2rem for sidebar */}
      <div className="relative z-10 h-[calc(100vh-3rem)] w-[calc(100%)] flex flex-col">
        {/* Scaffold Progress Overlay - Positioned absolutely over content */}
        {scaffoldProgress && !scaffoldProgress.isComplete && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-xl px-4">
            <div className="glassmorphic rounded-xl shadow-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-sakura-800 dark:text-sakura-200">
                  {scaffoldProgress.stepName}
                </span>
                <span className="text-xs px-2 py-1 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full font-medium">
                  {scaffoldProgress.currentStep}/{scaffoldProgress.totalSteps}
                </span>
              </div>
              <div className="w-full bg-sakura-100 dark:bg-sakura-900/20 rounded-full h-2 mb-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-sakura-500 to-pink-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(scaffoldProgress.currentStep / scaffoldProgress.totalSteps) * 100}%` }}
                />
              </div>
              <p className="text-xs text-sakura-600 dark:text-sakura-400">
                {scaffoldProgress.stepDescription}
              </p>
            </div>
          </div>
        )}
      
        {/* Header - Fixed height, full width */}
        {selectedProject && (
          <header className="h-12 shrink-0 glassmorphic border-b border-white/10 dark:border-gray-800/50">
            <div className="h-full px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gradient-to-r from-sakura-500 to-pink-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {selectedProject.name}
                  </span>
                  {selectedProject.status === 'running' && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                      Running
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {projectViewMode === 'play' ? (
                    <button
                      onClick={() => setProjectViewMode('edit')}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-blue-500 to-blue-600 dark:from-sakura-500 dark:to-sakura-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 dark:hover:from-sakura-600 dark:hover:to-sakura-700 transition-all shadow-lg"
                    >
                      <Code className="w-3 h-3" />
                      Back to Editor
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowManagerPage(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs glassmorphic-card text-gray-700 dark:text-gray-300 hover:text-sakura-600 dark:hover:text-sakura-400 rounded-lg transition-colors"
                      >
                        <FolderOpen className="w-3 h-3" />
                        Projects
                      </button>

                      <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-lg hover:from-sakura-600 hover:to-pink-600 transition-all shadow-lg"
                      >
                        <Plus className="w-3 h-3" />
                        New
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {selectedProject.status === 'running' && (
                  <button
                    onClick={() => stopProject(selectedProject)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-lg"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </button>
                )}
                
                {selectedProject.status === 'running' ? (
                  <button
                    onClick={() => startProject(selectedProject)}
                    disabled={isStarting}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {isStarting ? 'Starting...' : 'Start'}
                  </button>
                ) : (
                  <button
                    onClick={() => startProject(selectedProject)}
                    disabled={isStarting}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {isStarting ? 'Starting...' : 'Start'}
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Main Content - Flex grow, contains chat and workspace */}
        <main className="w-full flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - Chat (25% width, fixed) - Hidden in play mode */}
          {projectViewMode === 'edit' && (
            <aside className="w-1/4 max-w-[25%] h-full shrink-0 overflow-hidden border-r border-white/10 dark:border-gray-800/50">
              <ChatWindow
                selectedFile={selectedFile}
                fileContent={selectedFileContent}
                files={files}
                onFileContentChange={handleFileContentChange}
                onFileSelect={handleFileSelect}
                workingDirectory={selectedProject?.name || '.'}
                lumaTools={lumaTools}
                projectId={selectedProject?.id || 'no-project'}
                projectName={selectedProject?.name || 'No Project'}
                refreshFileTree={refreshFileTree}
              />
            </aside>
          )}

          {/* Right Panel - Workspace (75% width in edit mode, 100% in play mode) */}
          <section className={projectViewMode === 'play' ? 'w-full h-full min-w-0 max-w-full overflow-hidden' : 'w-3/4 h-full min-w-0 max-w-[75%] overflow-hidden'}>
            <RightPanelWorkspace
              mode={projectViewMode === 'play' ? 'preview' : rightPanelMode}
              onModeChange={setRightPanelMode}
              files={files}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onDeleteFile={handleDeleteFile}
              onDeleteFolder={handleDeleteFolder}
              onRenameFile={handleRenameFile}
              onDuplicateFile={handleDuplicateFile}
              onUploadFile={handleUploadFile}
              onCopyFile={handleCopyFile}
              onCutFile={handleCutFile}
              selectedFileContent={selectedFileContent}
              onFileContentChange={handleFileContentChange}
              terminalRef={terminalRef}
              webContainer={webContainer}
              onReconnectShell={handleReconnectShell}
              project={selectedProject}
              isStarting={isStarting}
              onStartProject={startProject}
              onClearChat={handleClearChat}
              onResetProject={handleResetProject}
              viewMode={projectViewMode}
              terminalOutput={terminalOutput}
              onClearTerminal={() => setTerminalOutput([])}
              writeToTerminal={writeToTerminal}
            />
          </section>
        </main>
      </div>

      {/* Modals - Outside main layout, positioned absolutely */}
      <ProjectSelectionModal
        isOpen={isProjectSelectionModalOpen}
        projects={projects}
        onSelectProject={handleProjectSelect}
        onDeleteProject={handleDeleteProject}
        onCreateNew={() => {
          setIsProjectSelectionModalOpen(false);
          setIsCreateModalOpen(true);
        }}
        onClose={() => setIsProjectSelectionModalOpen(false)}
      />

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          const shouldReopenSelection = !selectedProject && projects.length > 0 && !isProjectSelectionModalOpen;
          if (shouldReopenSelection) {
            setIsProjectSelectionModalOpen(true);
          }
        }}
        onCreateProject={handleCreateProject}
        scaffoldProgress={scaffoldProgress}
      />
    </div>
  );
};

// Main Lumaui component wrapped with providers
const Lumaui: React.FC = () => {
  return (
    <ProvidersProvider>
      <CheckpointProvider>
        <LumaUICore />
      </CheckpointProvider>
    </ProvidersProvider>
  );
};

export default Lumaui; 