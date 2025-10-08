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

  // Width for layout (percentage)
  width: number;
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
  onStartProject,
  width
}) => {
  return (
    <div
      className="h-full flex flex-col bg-bolt-bg-primary border-l border-bolt-border"
      style={{ width: `${width}%` }}
    >
      {/* Mode Toggle Buttons - Always Visible */}
      <div className="bolt-top-bar shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onModeChange('preview')}
            className={`bolt-mode-button ${mode === 'preview' ? 'bolt-mode-button-active' : ''}`}
            title="Preview Mode"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>

          <button
            onClick={() => onModeChange('editor')}
            className={`bolt-mode-button ${mode === 'editor' ? 'bolt-mode-button-active' : ''}`}
            title="Editor Mode"
          >
            <Code className="w-4 h-4" />
            <span>Editor</span>
          </button>

          <button
            onClick={() => onModeChange('settings')}
            className={`bolt-mode-button ${mode === 'settings' ? 'bolt-mode-button-active' : ''}`}
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Content Area - Switches Based on Mode */}
      <div className="flex-1 min-h-0 relative">
        {mode === 'editor' && (
          <div className="h-full flex flex-col">
            {/* Top: File Explorer + Editor Side-by-Side */}
            <div className="flex-1 min-h-0 flex">
              {/* File Explorer - 20% */}
              <div className="w-1/5 h-full border-r border-bolt-border overflow-hidden">
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

              {/* Monaco Editor - 80% */}
              <div className="flex-1 h-full overflow-hidden">
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

            {/* Bottom: Terminal (Resizable) */}
            <div className="border-t border-bolt-border">
              <TerminalComponent
                terminalRef={terminalRef}
                webContainer={webContainer}
              />
            </div>
          </div>
        )}

        {mode === 'preview' && project && (
          <div className="h-full w-full">
            <PreviewPane
              project={project}
              isStarting={isStarting}
              onStartProject={onStartProject}
            />
          </div>
        )}

        {mode === 'settings' && (
          <div className="h-full w-full flex items-center justify-center bg-bolt-bg-secondary">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-6 bg-bolt-bg-tertiary rounded-2xl flex items-center justify-center border border-bolt-border">
                <SettingsIcon className="w-8 h-8 text-bolt-accent-blue" />
              </div>
              <h3 className="text-xl font-semibold text-bolt-text-primary mb-3">
                Settings Panel
              </h3>
              <p className="text-bolt-text-secondary leading-relaxed">
                Settings panel coming soon. Configure your workspace preferences, editor settings, and more.
              </p>
            </div>
          </div>
        )}

        {/* Show fallback if no project selected in preview mode */}
        {mode === 'preview' && !project && (
          <div className="h-full w-full flex items-center justify-center bg-bolt-bg-secondary">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-6 bg-bolt-bg-tertiary rounded-2xl flex items-center justify-center border border-bolt-border">
                <Eye className="w-8 h-8 text-bolt-text-muted" />
              </div>
              <h3 className="text-xl font-semibold text-bolt-text-primary mb-3">
                No Project Selected
              </h3>
              <p className="text-bolt-text-secondary leading-relaxed">
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
