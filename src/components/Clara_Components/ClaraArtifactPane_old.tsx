/**
 * Clara Artifact Pane Component (Claude-Style)
 *
 * This component provides a dedicated pane for viewing artifacts separately from the chat.
 * Similar to Claude's artifact view, it shows rich content (code, charts, diagrams) in a
 * persistent pane while keeping the chat conversation clean and focused.
 *
 * Features:
 * - Split-screen layout (chat + artifact pane)
 * - Multi-artifact navigation with arrows
 * - Collapsible/expandable pane
 * - Full-screen artifact view
 * - Responsive design (hides on mobile)
 * - Synchronized with chat messages
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ClaraArtifact } from '../../types/clara_assistant_types';
import { copyToClipboard } from '../../utils/clipboard';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Full-pane artifact renderer - uses full width and height
 */
const ArtifactContentRenderer: React.FC<{ artifact: ClaraArtifact }> = ({ artifact }) => {
  const [showCode, setShowCode] = useState(false);

  // HTML rendering
  if (artifact.type === 'html' || artifact.language === 'html') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {showCode ? 'HTML Code' : 'HTML Preview'}
          </span>
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded flex items-center gap-1.5 transition-colors"
          >
            {showCode ? <Globe className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showCode ? 'Show Preview' : 'Show Code'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {showCode ? (
            <SyntaxHighlighter
              language="html"
              style={oneDark}
              customStyle={{ margin: 0, height: '100%', background: '#1e1e1e' }}
              showLineNumbers={true}
            >
              {artifact.content}
            </SyntaxHighlighter>
          ) : (
            <iframe
              srcDoc={artifact.content}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin"
              title="HTML Preview"
            />
          )}
        </div>
      </div>
    );
  }

  // Mermaid diagram rendering - use code view for now (will render in inline)
  if (artifact.type === 'mermaid' || artifact.language === 'mermaid') {
    return (
      <div className="h-full overflow-auto">
        <SyntaxHighlighter
          language="mermaid"
          style={oneDark}
          customStyle={{ margin: 0, height: '100%', background: '#1e1e1e' }}
          showLineNumbers={true}
        >
          {artifact.content}
        </SyntaxHighlighter>
      </div>
    );
  }

  // Code rendering (default)
  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighter
        language={artifact.language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, height: '100%', background: '#1e1e1e' }}
        showLineNumbers={true}
      >
        {artifact.content}
      </SyntaxHighlighter>
    </div>
  );
};

export interface ArtifactPaneProps {
  artifacts: ClaraArtifact[];
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * Main Artifact Pane Component
 */
const ClaraArtifactPane: React.FC<ArtifactPaneProps> = ({
  artifacts,
  isOpen,
  onClose,
  className = ''
}) => {
  const [currentArtifactIndex, setCurrentArtifactIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset to first artifact when artifacts change
  useEffect(() => {
    if (artifacts.length > 0 && currentArtifactIndex >= artifacts.length) {
      setCurrentArtifactIndex(0);
    }
  }, [artifacts.length, currentArtifactIndex]);

  // Get current artifact
  const currentArtifact = artifacts[currentArtifactIndex];
  const hasMultipleArtifacts = artifacts.length > 1;

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    setCurrentArtifactIndex((prev) =>
      prev > 0 ? prev - 1 : artifacts.length - 1
    );
  }, [artifacts.length]);

  const handleNext = useCallback(() => {
    setCurrentArtifactIndex((prev) =>
      prev < artifacts.length - 1 ? prev + 1 : 0
    );
  }, [artifacts.length]);

  // Copy handler
  const handleCopy = useCallback(async () => {
    if (!currentArtifact) return;

    const success = await copyToClipboard(currentArtifact.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentArtifact]);

  // Download handler
  const handleDownload = useCallback(() => {
    if (!currentArtifact) return;

    const blob = new Blob([currentArtifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Generate filename based on artifact type and title
    const extension = currentArtifact.language || 'txt';
    const filename = `${currentArtifact.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`;

    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentArtifact]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
        return;
      }

      if (e.key === 'Escape' && !isFullScreen) {
        onClose();
        return;
      }

      if (hasMultipleArtifacts) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          handlePrevious();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, isFullScreen, hasMultipleArtifacts, handlePrevious, handleNext, onClose]);

  if (!isOpen || artifacts.length === 0) {
    return null;
  }

  // Get artifact type label
  const getArtifactTypeLabel = (artifact: ClaraArtifact): string => {
    const typeLabels: Record<string, string> = {
      code: artifact.language ? artifact.language.toUpperCase() : 'Code',
      html: 'HTML',
      markdown: 'Markdown',
      table: 'Table',
      chart: 'Chart',
      json: 'JSON',
      csv: 'CSV',
      diagram: 'Diagram',
      mermaid: 'Mermaid Diagram',
    };
    return typeLabels[artifact.type] || artifact.type;
  };

  return (
    <div
      className={`
        ${isFullScreen
          ? 'fixed inset-0 z-50'
          : 'h-full flex flex-col'
        }
        bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {/* Top bar with title and controls */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {currentArtifact?.title || 'Artifact'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {getArtifactTypeLabel(currentArtifact)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Minimize/Maximize */}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Full Screen Toggle */}
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action buttons bar */}
        {!isMinimized && (
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-2">
              {/* Copy */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                {copied ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-green-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* Download */}
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>

            {/* Multi-artifact navigation */}
            {hasMultipleArtifacts && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevious}
                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium min-w-[3rem] text-center">
                  {currentArtifactIndex + 1} / {artifacts.length}
                </span>

                <button
                  onClick={handleNext}
                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
          {currentArtifact ? (
            <ArtifactContentRenderer artifact={currentArtifact} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <Code2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No artifact selected</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {hasMultipleArtifacts && !isMinimized && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Use ← → arrow keys to navigate • Esc to {isFullScreen ? 'exit full screen' : 'close'}
          </p>
        </div>
      )}
    </div>
  );
};

export default ClaraArtifactPane;
