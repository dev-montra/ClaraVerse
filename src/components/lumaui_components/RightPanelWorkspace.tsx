import React from 'react';
import { Eye, Code, Settings as SettingsIcon } from 'lucide-react';
import FileExplorer from './FileExplorer';
import MonacoEditor from './MonacoEditor';
import TerminalComponent from './TerminalComponent';
import PreviewPane from './PreviewPane';
import { FileNode, Project } from '../../types';
import { Terminal } from '@xterm/xterm';
import { WebContainer } from '@webcontainer/api';

export type WorkspaceMode = 'editor' | 'preview' | 'settings';

interface RightPanelWorkspaceProps {
  // Mode control
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;

  // File Explorer props
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

  // Monaco Editor props
  selectedFileContent: string;
  onFileContentChange: (content: string) => void;

  // Terminal props
  terminalRef: React.RefObject<Terminal | null>;
  webContainer: WebContainer | null;

  // Preview props
  project: Project | null;
  isStarting: boolean;
  onStartProject: (project: Project) => void;
}

const RightPanelWorkspace: React.FC<RightPanelWorkspaceProps> = ({
  mode,
  onModeChange,
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
  selectedFileContent,
  onFileContentChange,
  terminalRef,
  webContainer,
  project,
  isStarting,
  onStartProject
}) => {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Mode Toggle Buttons - Always Visible */}
      <div className="glassmorphic shrink-0 h-12 flex items-center px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onModeChange('preview')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'preview'
                ? 'bg-gradient-to-r from-sakura-500 to-pink-500 text-white shadow-lg'
                : 'glassmorphic-card text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400'
            }`}
            title="Preview Mode"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>

          <button
            onClick={() => onModeChange('editor')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'editor'
                ? 'bg-gradient-to-r from-sakura-500 to-pink-500 text-white shadow-lg'
                : 'glassmorphic-card text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400'
            }`}
            title="Editor Mode"
          >
            <Code className="w-4 h-4" />
            <span>Editor</span>
          </button>

          <button
            onClick={() => onModeChange('settings')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'settings'
                ? 'bg-gradient-to-r from-sakura-500 to-pink-500 text-white shadow-lg'
                : 'glassmorphic-card text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400'
            }`}
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Content Area - Switches Based on Mode */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {mode === 'editor' && (
          <div className="h-full w-full flex flex-col overflow-hidden">
            {/* Top: File Explorer + Editor Side-by-Side */}
            <div className="flex-1 min-h-0 flex overflow-hidden w-full">
              {/* File Explorer - Fixed 250px width */}
              <div 
                className="h-full glassmorphic overflow-hidden flex flex-col shrink-0"
                style={{ width: '250px' }}
              >
                <FileExplorer
                  files={files}
                  selectedFile={selectedFile}
                  onFileSelect={onFileSelect}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onCreateFile={onCreateFile}
                  onCreateFolder={onCreateFolder}
                  onDeleteFile={onDeleteFile}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFile={onRenameFile}
                  onDuplicateFile={onDuplicateFile}
                />
              </div>

              {/* Monaco Editor - Take remaining space */}
              <div className="flex-1 h-full overflow-hidden min-w-0">
                <MonacoEditor
                  content={selectedFileContent}
                  fileName={selectedFile || ''}
                  onChange={onFileContentChange}
                  projectFiles={files}
                  webContainer={webContainer}
                  showPreviewToggle={false}
                />
              </div>
            </div>

            {/* Bottom: Terminal (Always visible in editor mode) */}
            <div className="glassmorphic shrink-0" style={{ height: '200px' }}>
              <TerminalComponent
                terminalRef={terminalRef}
                webContainer={webContainer}
                isVisible={true}
                onToggle={() => {}}
              />
            </div>
          </div>
        )}

        {mode === 'preview' && project && (
          <div className="h-full w-full overflow-hidden">
            <PreviewPane
              project={project}
              isStarting={isStarting}
              onStartProject={onStartProject}
            />
          </div>
        )}

        {mode === 'settings' && (
          <div className="h-full w-full flex items-center justify-center glassmorphic">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-6 glassmorphic-card rounded-2xl flex items-center justify-center">
                <SettingsIcon className="w-8 h-8 text-sakura-600 dark:text-sakura-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Settings Panel
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Settings panel coming soon. Configure your workspace preferences, editor settings, and more.
              </p>
            </div>
          </div>
        )}

        {/* Show fallback if no project selected in preview mode */}
        {mode === 'preview' && !project && (
          <div className="h-full w-full flex items-center justify-center glassmorphic">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-6 glassmorphic-card rounded-2xl flex items-center justify-center">
                <Eye className="w-8 h-8 text-gray-500 dark:text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">
                No Project Selected
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Select or create a project to see the live preview.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanelWorkspace;
