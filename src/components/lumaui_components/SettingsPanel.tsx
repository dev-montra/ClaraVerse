import React, { useState } from 'react';
import { Download, Settings, Zap, FileText, Code, RefreshCw, Trash2 } from 'lucide-react';
import { Project, FileNode } from '../../types';

interface SettingsPanelProps {
  project: Project | null;
  files: FileNode[];
  onClearChat?: () => void;
  onResetProject?: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  project,
  files,
  onClearChat,
  onResetProject
}) => {
  const [downloading, setDownloading] = useState(false);

  // Download project as ZIP
  const handleDownloadProject = async () => {
    if (!project || files.length === 0) return;

    setDownloading(true);
    try {
      // Import JSZip dynamically
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Add files to zip
      const addFilesToZip = (fileNodes: FileNode[], folder: any) => {
        for (const node of fileNodes) {
          if (node.type === 'directory') {
            const subFolder = folder.folder(node.name);
            if (node.children) {
              addFilesToZip(node.children, subFolder);
            }
          } else if (node.type === 'file' && node.content !== undefined) {
            folder.file(node.name, node.content);
          }
        }
      };

      addFilesToZip(files, zip);

      // Generate ZIP file
      const blob = await zip.generateAsync({ type: 'blob' });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download project:', error);
      alert('Failed to download project. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // Get project stats
  const getProjectStats = () => {
    if (!files || files.length === 0) {
      return { fileCount: 0, dirCount: 0, totalSize: 0 };
    }

    let fileCount = 0;
    let dirCount = 0;
    let totalSize = 0;

    const countFiles = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'directory') {
          dirCount++;
          if (node.children) {
            countFiles(node.children);
          }
        } else {
          fileCount++;
          totalSize += (node.content?.length || 0);
        }
      }
    };

    countFiles(files);
    return { fileCount, dirCount, totalSize };
  };

  const stats = getProjectStats();
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="h-full w-full overflow-auto p-6 glassmorphic">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="glassmorphic-card p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sakura-500 to-pink-500 flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Project Settings
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {project ? project.name : 'No project selected'}
              </p>
            </div>
          </div>
        </div>

        {/* Project Info */}
        {project && (
          <div className="glassmorphic-card p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-sakura-600" />
              Project Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="glassmorphic p-4 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Framework</div>
                <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 capitalize">
                  {project.framework}
                </div>
              </div>
              <div className="glassmorphic p-4 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</div>
                <div className="text-lg font-semibold capitalize">
                  <span className={`inline-flex items-center gap-1 ${
                    project.status === 'running' ? 'text-green-600' :
                    project.status === 'error' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      project.status === 'running' ? 'bg-green-600 animate-pulse' :
                      project.status === 'error' ? 'bg-red-600' :
                      'bg-gray-600'
                    }`}></div>
                    {project.status}
                  </span>
                </div>
              </div>
              <div className="glassmorphic p-4 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Files</div>
                <div className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {stats.fileCount} files
                </div>
              </div>
              <div className="glassmorphic p-4 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Size</div>
                <div className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {formatSize(stats.totalSize)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="glassmorphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-sakura-600" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Download Project */}
            <button
              onClick={handleDownloadProject}
              disabled={!project || files.length === 0 || downloading}
              className="glassmorphic p-4 rounded-lg text-left hover:bg-sakura-50 dark:hover:bg-sakura-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {downloading ? (
                    <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800 dark:text-gray-100">
                    Download Project
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Export as ZIP file
                  </div>
                </div>
              </div>
            </button>

            {/* Clear Chat */}
            <button
              onClick={onClearChat}
              disabled={!onClearChat}
              className="glassmorphic p-4 rounded-lg text-left hover:bg-sakura-50 dark:hover:bg-sakura-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Trash2 className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800 dark:text-gray-100">
                    Clear Chat History
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Start fresh conversation
                  </div>
                </div>
              </div>
            </button>

            {/* Reset Project */}
            <button
              onClick={onResetProject}
              disabled={!onResetProject || !project}
              className="glassmorphic p-4 rounded-lg text-left hover:bg-red-50 dark:hover:bg-red-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <RefreshCw className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800 dark:text-gray-100">
                    Reset Project
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Restart WebContainer
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Editor Preferences */}
        <div className="glassmorphic-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Code className="w-5 h-5 text-sakura-600" />
            Editor Preferences
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between glassmorphic p-4 rounded-lg">
              <div>
                <div className="font-medium text-gray-800 dark:text-gray-100">Auto Save</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Automatically save changes</div>
              </div>
              <div className="text-sm font-medium text-green-600">Enabled</div>
            </div>
            <div className="flex items-center justify-between glassmorphic p-4 rounded-lg">
              <div>
                <div className="font-medium text-gray-800 dark:text-gray-100">Format on Save</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Auto-format code on save</div>
              </div>
              <div className="text-sm font-medium text-gray-600">Default</div>
            </div>
            <div className="flex items-center justify-between glassmorphic p-4 rounded-lg">
              <div>
                <div className="font-medium text-gray-800 dark:text-gray-100">Tab Size</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Spaces per tab</div>
              </div>
              <div className="text-sm font-medium text-gray-600">2</div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="glassmorphic-card p-4 rounded-xl">
          <p className="text-sm text-center text-gray-600 dark:text-gray-400">
            More settings coming soon. AI settings can be accessed from the chat panel.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
