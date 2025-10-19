import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Folder,
  FileText,
  Code,
  Image,
  Settings,
  Database,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Scissors,
  FolderPlus,
  FilePlus,
  MoreHorizontal,
  Upload,
  Clipboard
} from 'lucide-react';
import { FileNode } from '../../types';

interface FileExplorerProps {
  files: FileNode[];
  selectedFile: string | null;
  onFileSelect: (path: string, content: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCreateFile?: (parentPath: string, fileName: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, folderName: string) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  onDeleteFolder?: (path: string) => Promise<void>;
  onRenameFile?: (oldPath: string, newPath: string) => Promise<void>;
  onDuplicateFile?: (path: string) => Promise<void>;
  onUploadFile?: (parentPath: string, files: FileList) => Promise<void>;
  onCopyFile?: (sourcePath: string, targetPath: string) => Promise<void>;
  onCutFile?: (sourcePath: string, targetPath: string) => Promise<void>;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetPath: string;
  targetType: 'file' | 'directory' | 'empty';
}

interface EditingState {
  path: string;
  type: 'rename' | 'create-file' | 'create-folder';
  originalName?: string;
}

interface ClipboardState {
  path: string;
  type: 'file' | 'directory';
  operation: 'copy' | 'cut';
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  selectedFile,
  onFileSelect,
  expandedFolders,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onDuplicateFile,
  onUploadFile,
  onCopyFile,
  onCutFile
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetPath: '',
    targetType: 'empty'
  });

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>(''); // Track last selected/expanded folder

  const editInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetPath = useRef<string>('');

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(prev => ({ ...prev, isOpen: false }));
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'directory') => {
    e.preventDefault();
    e.stopPropagation();

    console.log('[FileExplorer] Context menu opened:', { path, type, x: e.clientX, y: e.clientY });

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetPath: path,
      targetType: type
    });
  };

  // Handle empty area right-click
  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetPath: '',
      targetType: 'empty'
    });
  };

  // Start editing (rename or create)
  const startEditing = (path: string, type: 'rename' | 'create-file' | 'create-folder', originalName?: string) => {
    setEditing({ path, type, originalName });
    setEditValue(originalName || '');
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  // Handle edit submission
  const handleEditSubmit = async () => {
    if (!editing || !editValue.trim()) {
      setEditing(null);
      return;
    }

    try {
      switch (editing.type) {
        case 'rename':
          if (onRenameFile && editValue !== editing.originalName) {
            const pathParts = editing.path.split('/');
            pathParts[pathParts.length - 1] = editValue.trim();
            const newPath = pathParts.join('/');
            await onRenameFile(editing.path, newPath);
          }
          break;
        
        case 'create-file':
          if (onCreateFile) {
            await onCreateFile(editing.path, editValue.trim());
          }
          break;
        
        case 'create-folder':
          if (onCreateFolder) {
            await onCreateFolder(editing.path, editValue.trim());
          }
          break;
      }
    } catch (error) {
      console.error('Edit operation failed:', error);
    }
    
    setEditing(null);
    setEditValue('');
  };

  // Handle edit cancellation
  const handleEditCancel = () => {
    setEditing(null);
    setEditValue('');
  };

  // Handle key events in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  // Context menu actions
  const contextMenuActions = {
    createFile: () => {
      const targetPath = contextMenu.targetType === 'directory' ? contextMenu.targetPath : '';
      startEditing(targetPath, 'create-file');
    },
    
    createFolder: () => {
      const targetPath = contextMenu.targetType === 'directory' ? contextMenu.targetPath : '';
      startEditing(targetPath, 'create-folder');
    },
    
    rename: () => {
      const fileName = contextMenu.targetPath.split('/').pop() || '';
      startEditing(contextMenu.targetPath, 'rename', fileName);
    },
    
    duplicate: async () => {
      if (onDuplicateFile && contextMenu.targetType === 'file') {
        try {
          await onDuplicateFile(contextMenu.targetPath);
        } catch (error) {
          console.error('Duplicate failed:', error);
        }
      }
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    },
    
    delete: async () => {
      const confirmMessage = contextMenu.targetType === 'directory' 
        ? `Are you sure you want to delete the folder "${contextMenu.targetPath}" and all its contents?`
        : `Are you sure you want to delete "${contextMenu.targetPath}"?`;
      
      if (window.confirm(confirmMessage)) {
        try {
          if (contextMenu.targetType === 'directory' && onDeleteFolder) {
            await onDeleteFolder(contextMenu.targetPath);
          } else if (contextMenu.targetType === 'file' && onDeleteFile) {
            await onDeleteFile(contextMenu.targetPath);
          }
        } catch (error) {
          console.error('Delete failed:', error);
        }
      }
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    },

    copy: () => {
      setClipboard({
        path: contextMenu.targetPath,
        type: contextMenu.targetType,
        operation: 'copy'
      });
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    },

    cut: () => {
      setClipboard({
        path: contextMenu.targetPath,
        type: contextMenu.targetType,
        operation: 'cut'
      });
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    },

    paste: async () => {
      if (!clipboard) return;

      try {
        const targetPath = contextMenu.targetType === 'directory' ? contextMenu.targetPath : '';

        if (clipboard.operation === 'copy' && onCopyFile) {
          await onCopyFile(clipboard.path, targetPath);
        } else if (clipboard.operation === 'cut' && onCutFile) {
          await onCutFile(clipboard.path, targetPath);
          setClipboard(null); // Clear clipboard after cut
        }
      } catch (error) {
        console.error('Paste failed:', error);
      }
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    },

    upload: () => {
      uploadTargetPath.current = contextMenu.targetType === 'directory' ? contextMenu.targetPath : '';
      fileInputRef.current?.click();
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onUploadFile) return;

    try {
      await onUploadFile(uploadTargetPath.current, files);
    } catch (error) {
      console.error('Upload failed:', error);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0 || !onUploadFile) return;

    try {
      // Upload to currently selected folder, or root if none selected
      await onUploadFile(selectedFolder, files);
    } catch (error) {
      console.error('Drop upload failed:', error);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when not editing
      if (editing) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 'c' && selectedFile) {
        // Copy
        e.preventDefault();
        const fileNode = findNodeByPath(files, selectedFile);
        if (fileNode) {
          setClipboard({
            path: selectedFile,
            type: fileNode.type,
            operation: 'copy'
          });
        }
      } else if (modKey && e.key === 'x' && selectedFile) {
        // Cut
        e.preventDefault();
        const fileNode = findNodeByPath(files, selectedFile);
        if (fileNode) {
          setClipboard({
            path: selectedFile,
            type: fileNode.type,
            operation: 'cut'
          });
        }
      } else if (modKey && e.key === 'v' && clipboard) {
        // Paste
        e.preventDefault();
        if (clipboard.operation === 'copy' && onCopyFile) {
          onCopyFile(clipboard.path, '');
        } else if (clipboard.operation === 'cut' && onCutFile) {
          onCutFile(clipboard.path, '');
          setClipboard(null);
        }
      } else if (e.key === 'Delete' && selectedFile && onDeleteFile) {
        // Delete
        e.preventDefault();
        const fileNode = findNodeByPath(files, selectedFile);
        if (fileNode) {
          const confirmMessage = fileNode.type === 'directory'
            ? `Are you sure you want to delete the folder "${selectedFile}" and all its contents?`
            : `Are you sure you want to delete "${selectedFile}"?`;

          if (window.confirm(confirmMessage)) {
            if (fileNode.type === 'directory' && onDeleteFolder) {
              onDeleteFolder(selectedFile);
            } else if (fileNode.type === 'file' && onDeleteFile) {
              onDeleteFile(selectedFile);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing, selectedFile, clipboard, files, onCopyFile, onCutFile, onDeleteFile, onDeleteFolder]);

  // Helper function to find node by path
  const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // Get appropriate icon for file type with enhanced styling
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'vue':
      case 'svelte':
        return <Code className="w-4 h-4 text-emerald-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
        return <Image className="w-4 h-4 text-sakura-500" />;
      case 'json':
      case 'yaml':
      case 'yml':
        return <Database className="w-4 h-4 text-blue-500" />;
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return <Settings className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };
  
  // Handle drop on specific folder
  const handleDropOnFolder = async (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0 || !onUploadFile) return;

    try {
      await onUploadFile(folderPath, files);
    } catch (error) {
      console.error('Drop on folder failed:', error);
    }
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;
    const isEditing = editing?.path === node.path && editing?.type === 'rename';
    const isCut = clipboard?.operation === 'cut' && clipboard?.path === node.path;

    return (
      <div key={node.path}>
        <div
          className={`bolt-file-tree-item ${
            isSelected
              ? 'bolt-file-tree-item-selected'
              : ''
          } ${isCut ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => {
            if (isEditing) return;

            if (node.type === 'directory') {
              onToggleFolder(node.path);
              setSelectedFolder(node.path); // Track selected folder for uploads
            } else if (node.content !== undefined) {
              onFileSelect(node.path, node.content);
              // When selecting a file, set parent folder as upload target
              const parentPath = node.path.split('/').slice(0, -1).join('/');
              setSelectedFolder(parentPath);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, node.path, node.type)}
          onDragOver={node.type === 'directory' ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
          onDrop={node.type === 'directory' ? (e) => handleDropOnFolder(e, node.path) : undefined}
        >
          {node.type === 'directory' ? (
            <>
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-sakura-500 transition-colors" />
              ) : (
                <Folder className="w-4 h-4 text-sakura-400 group-hover:text-sakura-500 transition-colors" />
              )}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleEditSubmit}
                  className="text-sm font-medium bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-1 py-0.5 min-w-0 flex-1"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex items-center gap-2 flex-1 justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-sakura-700 dark:group-hover:text-sakura-300 transition-colors">
                      {node.name}
                    </span>
                    {selectedFolder === node.path && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-medium">
                        Upload
                      </span>
                    )}
                  </div>
                  {/* Quick actions on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const fileName = node.name;
                        startEditing(node.path, 'rename', fileName);
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Rename"
                    >
                      <Edit3 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const confirmMessage = `Are you sure you want to delete the folder "${node.path}" and all its contents?`;
                        if (window.confirm(confirmMessage)) {
                          if (onDeleteFolder) {
                            await onDeleteFolder(node.path);
                          }
                        }
                      }}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {getFileIcon(node.name)}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleEditSubmit}
                  className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-1 py-0.5 min-w-0 flex-1"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex items-center gap-2 flex-1 justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                    {node.name}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {isSelected && !isEditing && (
                      <div className="w-2 h-2 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-full animate-pulse shadow-lg" />
                    )}
                    {/* Quick actions on hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const fileName = node.name;
                          startEditing(node.path, 'rename', fileName);
                        }}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Rename"
                      >
                        <Edit3 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmMessage = `Are you sure you want to delete "${node.path}"?`;
                          if (window.confirm(confirmMessage)) {
                            if (onDeleteFile) {
                              await onDeleteFile(node.path);
                            }
                          }
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Render create file/folder inputs */}
        {editing?.path === node.path && editing.type === 'create-file' && (
          <div
            className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300"
            style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
          >
            <FileText className="w-4 h-4 text-gray-500" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="filename.ext"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
        
        {editing?.path === node.path && editing.type === 'create-folder' && (
          <div
            className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300"
            style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
          >
            <Folder className="w-4 h-4 text-sakura-400" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="folder name"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
        
        {node.type === 'directory' && isExpanded && node.children && (
          <div className="border-l border-sakura-200/50 dark:border-sakura-700/50 ml-6">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render create inputs for root level
  const renderRootCreateInputs = () => {
    if (!editing || editing.path !== '') return null;

    return (
      <div className="px-2">
        {editing.type === 'create-file' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300 rounded-r">
            <FileText className="w-4 h-4 text-gray-500" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="filename.ext"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
        
        {editing.type === 'create-folder' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300 rounded-r">
            <Folder className="w-4 h-4 text-sakura-400" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="folder name"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="p-2 glassmorphic shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-lg flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">Explorer</h3>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => startEditing('', 'create-file')}
              className="p-1.5 glassmorphic-card rounded-md text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
              title="New File"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => startEditing('', 'create-folder')}
              className="p-1.5 glassmorphic-card rounded-md text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            {onUploadFile && (
              <button
                onClick={() => {
                  uploadTargetPath.current = selectedFolder; // Upload to currently selected/expanded folder
                  fileInputRef.current?.click();
                }}
                className="p-1.5 glassmorphic-card rounded-md text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
                title={selectedFolder ? `Upload to ${selectedFolder}` : "Upload to root"}
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
            {clipboard && (
              <button
                onClick={() => setClipboard(null)}
                className="p-1.5 glassmorphic-card rounded-md text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                title={`${clipboard.operation === 'copy' ? 'Copied' : 'Cut'}: ${clipboard.path.split('/').pop()}`}
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
            )}
            {selectedFile && onDeleteFile && (
              <button
                onClick={async () => {
                  const fileName = selectedFile.split('/').pop();
                  const confirmMessage = `Are you sure you want to delete "${fileName}"?`;
                  if (window.confirm(confirmMessage)) {
                    await onDeleteFile(selectedFile);
                  }
                }}
                className="p-1.5 glassmorphic-card rounded-md text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                title={`Delete ${selectedFile.split('/').pop()}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-2 min-h-0 ${isDragging ? 'bg-sakura-50/50 dark:bg-sakura-900/20 border-2 border-dashed border-sakura-400' : ''}`}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(252, 165, 165, 0.3) transparent'
        }}
        onContextMenu={handleEmptyAreaContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-20 h-20 glassmorphic-card rounded-2xl flex items-center justify-center mb-6">
              <FolderOpen className="w-10 h-10 text-gray-500 dark:text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
              No Files Yet
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center leading-relaxed mb-4">
              Start your project to explore files and directories
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => startEditing('', 'create-file')}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-sakura-500 to-pink-500 text-white hover:from-sakura-600 hover:to-pink-600 transition-all shadow-lg"
              >
                <FilePlus className="w-4 h-4" />
                New File
              </button>
              <button
                onClick={() => startEditing('', 'create-folder')}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg glassmorphic-card text-gray-700 dark:text-gray-300 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
            </div>
          </div>
        ) : (
          <>
            {renderRootCreateInputs()}
            {files.map(node => renderNode(node))}
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <div
          ref={contextMenuRef}
          className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-2 min-w-48"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {contextMenu.targetType === 'empty' && (
            <>
              <button
                onClick={contextMenuActions.createFile}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FilePlus className="w-4 h-4" />
                New File
              </button>
              <button
                onClick={contextMenuActions.createFolder}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
              {onUploadFile && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                  <button
                    onClick={contextMenuActions.upload}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </button>
                </>
              )}
              {clipboard && (onCopyFile || onCutFile) && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                  <button
                    onClick={contextMenuActions.paste}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Clipboard className="w-4 h-4" />
                    Paste
                  </button>
                </>
              )}
            </>
          )}
          
          {contextMenu.targetType === 'directory' && (
            <>
              <button
                onClick={contextMenuActions.createFile}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FilePlus className="w-4 h-4" />
                New File
              </button>
              <button
                onClick={contextMenuActions.createFolder}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
              {onUploadFile && (
                <button
                  onClick={contextMenuActions.upload}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload Files
                </button>
              )}
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              <button
                onClick={contextMenuActions.rename}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Rename
              </button>
              {onCopyFile && (
                <button
                  onClick={contextMenuActions.copy}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              )}
              {onCutFile && (
                <button
                  onClick={contextMenuActions.cut}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Scissors className="w-4 h-4" />
                  Cut
                </button>
              )}
              {clipboard && (onCopyFile || onCutFile) && (
                <button
                  onClick={contextMenuActions.paste}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Clipboard className="w-4 h-4" />
                  Paste
                </button>
              )}
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              <button
                onClick={contextMenuActions.delete}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Folder
              </button>
            </>
          )}
          
          {contextMenu.targetType === 'file' && (
            <>
              <button
                onClick={contextMenuActions.rename}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Rename
              </button>
              {onCopyFile && (
                <button
                  onClick={contextMenuActions.copy}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              )}
              {onCutFile && (
                <button
                  onClick={contextMenuActions.cut}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Scissors className="w-4 h-4" />
                  Cut
                </button>
              )}
              <button
                onClick={contextMenuActions.duplicate}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              <button
                onClick={contextMenuActions.delete}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete File
              </button>
            </>
          )}
        </div>
      )}

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
};

export default FileExplorer; 