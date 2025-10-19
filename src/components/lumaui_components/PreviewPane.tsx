import React, { useState, useRef, useEffect } from 'react';
import { Globe, Play, Loader2, RefreshCw, ExternalLink, Monitor, Zap, Eye, Terminal, ChevronDown, Trash2, Cloud, Send } from 'lucide-react';
import { Project } from '../../types';
import { NetlifyDeployModal } from './NetlifyDeployModal';
import type { WebContainer } from '@webcontainer/api';

interface PreviewPaneProps {
  project: Project;
  isStarting: boolean;
  onStartProject: (project: Project) => void;
  terminalOutput?: Array<{id: string; text: string; timestamp: Date}>;
  onClearTerminal?: () => void;
  webContainer?: WebContainer | null;
  writeToTerminal?: (data: string) => void;
}

const PreviewPane: React.FC<PreviewPaneProps> = ({
  project,
  isStarting,
  onStartProject,
  terminalOutput = [],
  onClearTerminal,
  webContainer,
  writeToTerminal
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(300);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [isRunningCommand, setIsRunningCommand] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Auto-start project when preview opens (if idle)
  useEffect(() => {
    if (project.status === 'idle' && !isStarting && !hasAutoStarted && startButtonRef.current) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        startButtonRef.current?.click();
        setHasAutoStarted(true);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [project.status, isStarting, hasAutoStarted]);

  // Auto-scroll console to bottom when new output arrives
  useEffect(() => {
    if (showConsole) {
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalOutput, showConsole]);

  // Console resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;

      const container = resizeRef.current?.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      const minHeight = 150;
      const maxHeight = containerRect.height * 0.7;

      setConsoleHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsRefreshing(true);

      // Add a small delay to show the refresh animation
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
        setIsRefreshing(false);
      }, 300);
    }
  };

  const handleCommandSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!commandInput.trim() || !webContainer || isRunningCommand) {
      return;
    }

    const command = commandInput.trim();
    setCommandInput('');
    setIsRunningCommand(true);

    try {
      // Write command to terminal
      if (writeToTerminal) {
        writeToTerminal(`\x1b[36m$ ${command}\x1b[0m\n`);
      }

      // Parse command and arguments
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      // Execute command in WebContainer
      const process = await webContainer.spawn(cmd, args);

      // Stream output to terminal
      if (writeToTerminal) {
        process.output.pipeTo(new WritableStream({
          write(data) {
            writeToTerminal(data);
          }
        }));
      }

      // Wait for process to complete
      const exitCode = await process.exit;

      if (writeToTerminal && exitCode !== 0) {
        writeToTerminal(`\x1b[31mCommand exited with code ${exitCode}\x1b[0m\n`);
      }
    } catch (error: any) {
      if (writeToTerminal) {
        writeToTerminal(`\x1b[31m❌ Error executing command: ${error.message}\x1b[0m\n`);
      }
      console.error('Command execution failed:', error);
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  // Parse ANSI color codes from terminal output
  const parseAnsiColors = (text: string) => {
    // Remove all ANSI escape sequences
    return text
      .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
      .replace(/\x1b\[K/g, '') // Remove clear line codes
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Remove cursor movement codes
      .replace(/\[1G/g, '') // Remove cursor positioning
      .replace(/\[0J/g, '') // Remove clear screen
      .replace(/\[0K/g, '') // Remove clear to end of line
      .trim(); // Remove leading/trailing whitespace
  };

  // Check if a line should be displayed (skip empty/control-only lines)
  const shouldDisplayLine = (text: string): boolean => {
    const cleaned = parseAnsiColors(text);
    // Skip if empty or only whitespace
    if (!cleaned || cleaned.length === 0) return false;
    // Skip if only contains spinner characters
    if (/^[\|\/\-\\]+$/.test(cleaned)) return false;
    return true;
  };

  // Determine log level from terminal output (heuristic)
  const getLogLevel = (text: string): 'info' | 'error' | 'warn' | 'success' => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('error') || lowerText.includes('❌') || lowerText.includes('failed')) {
      return 'error';
    }
    if (lowerText.includes('warn') || lowerText.includes('⚠️') || lowerText.includes('warning')) {
      return 'warn';
    }
    if (lowerText.includes('✅') || lowerText.includes('success') || lowerText.includes('✓')) {
      return 'success';
    }
    return 'info';
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden glassmorphic py-2">
      {/* Enhanced Header */}
      <div className="glassmorphic-card shrink-0 h-14">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-lg flex items-center justify-center">
              <Globe className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Preview
                </span>
                {project.status === 'running' && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm"></div>
                    <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                      Live
                    </span>
                  </div>
                )}
                {project.status === 'idle' && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full font-medium">
                    Stopped
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {project.status === 'running' ? 'Application running' : 'Start project to preview'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {project.status === 'running' && project.previewUrl && (
              <>
                <button
                  onClick={() => setShowDeployModal(true)}
                  className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105 text-gray-600 dark:text-gray-400 hover:text-[#00C7B7] dark:hover:text-[#00C7B7]"
                  title="Deploy to Netlify"
                >
                  <Cloud className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowConsole(!showConsole)}
                  className={`p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105 ${
                    showConsole
                      ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400'
                  }`}
                  title="Toggle terminal output"
                >
                  <Terminal className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 disabled:opacity-50 hover:shadow-md transform hover:scale-105"
                  title="Refresh preview"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => window.open(project.previewUrl, '_blank')}
                  className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 relative overflow-hidden bg-white dark:bg-gray-900 flex flex-col">
        {project.status === 'running' && project.previewUrl ? (
          <>
            {/* Preview iframe */}
            <div
              className="flex-1 relative overflow-hidden"
              style={{ height: showConsole ? `calc(100% - ${consoleHeight}px)` : '100%' }}
            >
              <iframe
                ref={iframeRef}
                src={project.previewUrl}
                className="w-full h-full border-0 bg-white"
                title="Project Preview"
                onLoad={() => {
                  setIsRefreshing(false);
                }}
              />
              {isRefreshing && (
                <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 flex items-center justify-center z-20 glassmorphic backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-sakura-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      Refreshing preview...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Output Panel */}
            {showConsole && (
              <>
                {/* Resize Handle */}
                <div
                  ref={resizeRef}
                  className="h-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-ns-resize transition-colors flex items-center justify-center group"
                  onMouseDown={handleResizeStart}
                >
                  <div className="w-8 h-0.5 bg-gray-400 dark:bg-gray-500 group-hover:bg-blue-500 dark:group-hover:bg-blue-400 rounded transition-colors"></div>
                </div>

                {/* Terminal Content */}
                <div
                  className="bg-gray-900 text-gray-100 flex flex-col"
                  style={{ height: `${consoleHeight}px` }}
                >
                  {/* Terminal Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium">Build & Server Output</span>
                      <span className="text-xs text-gray-400">
                        ({terminalOutput.filter(o => shouldDisplayLine(o.text)).length} lines)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onClearTerminal && (
                        <button
                          onClick={onClearTerminal}
                          className="p-1 text-gray-400 hover:text-white transition-colors"
                          title="Clear output"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setShowConsole(false)}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                        title="Hide output"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Terminal Output Messages */}
                  <div className="flex-1 overflow-y-auto p-2 font-mono text-sm bg-black">
                    {terminalOutput.length === 0 ? (
                      <div className="text-gray-500 text-center py-4">
                        <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No output yet. Start a project to see build and server logs.</p>
                      </div>
                    ) : (
                      terminalOutput
                        .filter((output) => shouldDisplayLine(output.text))
                        .map((output) => {
                          const cleanText = parseAnsiColors(output.text);
                          const level = getLogLevel(cleanText);
                          const color = getLogLevelColor(level);

                          return (
                            <div key={output.id} className="py-0.5 hover:bg-gray-800/30">
                              <pre className={`${color} whitespace-pre-wrap break-all font-mono text-xs leading-relaxed`}>
                                {cleanText}
                              </pre>
                            </div>
                          );
                        })
                    )}
                    <div ref={consoleEndRef} />
                  </div>

                  {/* Command Input */}
                  {webContainer && (
                    <div className="border-t border-gray-700 bg-gray-900">
                      <form onSubmit={handleCommandSubmit} className="flex items-center gap-2 px-3 py-2">
                        <span className="text-blue-400 font-mono text-sm">$</span>
                        <input
                          ref={commandInputRef}
                          type="text"
                          value={commandInput}
                          onChange={(e) => setCommandInput(e.target.value)}
                          placeholder="Enter command (e.g., npm run build, ls, pwd)..."
                          disabled={isRunningCommand || !webContainer}
                          className="flex-1 bg-transparent text-gray-100 font-mono text-sm placeholder-gray-500 focus:outline-none disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={!commandInput.trim() || isRunningCommand || !webContainer}
                          className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Execute command"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Info Footer */}
                  <div className="border-t border-gray-700 px-4 py-2 bg-gray-800 text-xs text-gray-400">
                    <div className="flex items-center justify-between">
                      <span>📡 Showing WebContainer build & server output</span>
                      <span>{terminalOutput.filter(o => shouldDisplayLine(o.text)).length} lines displayed</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : project.status === 'idle' ? (
          /* Start Project State */
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-2xl flex items-center justify-center shadow-lg">
                <Monitor className="w-10 h-10 text-sakura-600 dark:text-sakura-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                Ready to Preview
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                Start your project to see a live preview of your application. Your changes will be reflected in real-time.
              </p>
              <button
                ref={startButtonRef}
                onClick={() => onStartProject(project)}
                disabled={isStarting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl shadow-sakura-500/25 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Start Project</span>
                  </>
                )}
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-4">
                <Eye className="w-4 h-4" />
                <span>Live reload enabled</span>
              </div>
            </div>
          </div>
        ) : (
          /* Loading/Error State */
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Zap className="w-10 h-10 text-gray-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                {project.status === 'error' ? 'Preview Error' : 'Getting Ready...'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {project.status === 'error'
                  ? 'There was an issue starting the preview. Please check the terminal for more details.'
                  : 'Your project is being prepared for preview. This may take a moment.'
                }
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Netlify Deploy Modal */}
      <NetlifyDeployModal
        isOpen={showDeployModal}
        onClose={() => setShowDeployModal(false)}
        webContainer={webContainer || null}
        projectId={project.id}
        projectName={project.name}
        writeToTerminal={writeToTerminal}
      />
    </div>
  );
};

export default PreviewPane;
