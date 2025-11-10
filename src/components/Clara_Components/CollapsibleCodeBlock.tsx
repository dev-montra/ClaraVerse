/**
 * Collapsible Code Block Component
 *
 * This component shows a collapsed/minimized version of code blocks in the chat
 * when the artifact pane is active. Similar to Claude's approach where the actual
 * code is hidden in chat but visible in the artifact pane.
 *
 * Features:
 * - Collapsed by default when artifact pane is active
 * - Expandable to show full code inline
 * - Language badge and line count
 * - Click to view in artifact pane
 */

import React, { useState } from 'react';
import { Code2, ChevronDown, ChevronRight, Eye, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

export interface CollapsibleCodeBlockProps {
  language?: string;
  code: string;
  title?: string;
  onViewInPane?: () => void;
  isInArtifactPane?: boolean;
  className?: string;
}

const CollapsibleCodeBlock: React.FC<CollapsibleCodeBlockProps> = ({
  language = 'text',
  code,
  title,
  onViewInPane,
  isInArtifactPane = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const lineCount = code.split('\n').length;
  const preview = code.split('\n').slice(0, 3).join('\n');
  const hasMore = lineCount > 3;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewInPane = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewInPane?.();
  };

  return (
    <div
      className={`
        group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden
        bg-gray-50 dark:bg-gray-800/50 hover:border-blue-300 dark:hover:border-blue-600/50
        transition-all ${className}
      `}
    >
      {/* Header - Always visible */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1">
          {/* Expand/Collapse Icon */}
          <button className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>

          {/* Code Icon */}
          <Code2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />

          {/* Title or Language */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {title || (language ? `${language.toUpperCase()} Code` : 'Code')}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({lineCount} {lineCount === 1 ? 'line' : 'lines'})
            </span>
          </div>

          {/* Language Badge */}
          {language && language !== 'text' && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
              {language}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 ml-2">
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Copy code"
          >
            {copied ? (
              <Eye className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* View in Pane Button */}
          {isInArtifactPane && onViewInPane && (
            <button
              onClick={handleViewInPane}
              className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              title="View in artifact pane"
            >
              View
            </button>
          )}
        </div>
      </div>

      {/* Code Preview/Full Content */}
      {isExpanded ? (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-900 dark:bg-gray-950">
          <pre className="p-4 overflow-x-auto text-sm">
            <code className="text-gray-100 font-mono">{code}</code>
          </pre>
        </div>
      ) : hasMore ? (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-900 dark:bg-gray-950">
          <pre className="px-4 py-3 overflow-x-auto text-sm relative">
            <code className="text-gray-100 font-mono opacity-60">{preview}</code>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-900 dark:from-gray-950 to-transparent pointer-events-none" />
          </pre>
          <div className="px-4 pb-2">
            <button
              onClick={() => setIsExpanded(true)}
              className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium"
            >
              Show {lineCount - 3} more lines...
            </button>
          </div>
        </div>
      ) : null}

      {/* Hint when collapsed */}
      {!isExpanded && isInArtifactPane && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Click to expand inline or view in artifact pane →
          </p>
        </div>
      )}
    </div>
  );
};

export default CollapsibleCodeBlock;
