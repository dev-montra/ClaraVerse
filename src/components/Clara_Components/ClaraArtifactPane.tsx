/**
 * Clara Artifact Pane - Beautiful Clara Design
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight,
  Code2, Copy, Download, Eye, Sparkles, Globe, Check
} from 'lucide-react';
import { ClaraArtifact } from '../../types/clara_assistant_types';
import { copyToClipboard } from '../../utils/clipboard';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
});

/**
 * Mermaid Diagram Renderer for Artifact Pane
 */
const MermaidRenderer: React.FC<{ content: string }> = ({ content }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [zoom, setZoom] = useState(1);
  const diagramId = useRef(`mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`).current;

  useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      setIsRendering(true);

      // Wait for DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!mounted) return;

      try {
        // Clean up any existing diagram
        const existingElement = document.getElementById(diagramId);
        if (existingElement) {
          existingElement.remove();
        }

        // Render mermaid diagram
        const { svg: renderedSvg } = await mermaid.render(diagramId, content.trim());

        if (mounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        console.error('Mermaid rendering error:', err);

        // Clean up failed attempt
        const failedElement = document.getElementById(diagramId);
        if (failedElement) {
          failedElement.remove();
        }

        if (mounted) {
          setError(err?.message || 'Failed to render diagram');
        }
      } finally {
        if (mounted) {
          setIsRendering(false);
        }
      }
    };

    renderDiagram();

    return () => {
      mounted = false;
      const element = document.getElementById(diagramId);
      if (element) {
        element.remove();
      }
    };
  }, [content, diagramId]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleZoomReset = () => setZoom(1);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-white dark:bg-gray-900">
        <div className="max-w-md">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400 text-sm font-medium mb-2">Diagram Error</p>
            <p className="text-red-500 dark:text-red-400 text-xs mb-3">{error}</p>
            <div className="border-t border-red-200 dark:border-red-800 pt-3 mt-3">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Quick fixes:</p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                <li>Use proper arrows: <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">--&gt;</code> or <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">---</code></li>
                <li>Add diagram type: <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">flowchart TD</code> or <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">graph LR</code></li>
                <li>Check node syntax: <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">A[Node Name]</code></li>
                <li>Avoid special characters in node IDs</li>
                <li>Ensure balanced brackets and quotes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isRendering || !svg) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sakura-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Zoom Controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {Math.round(zoom * 100)}%
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded transition-colors"
            title="Reset zoom"
          >
            Reset
          </button>
          <button
            onClick={handleZoomIn}
            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded transition-colors"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Diagram with scroll */}
      <div className="flex-1 overflow-auto p-6">
        <div
          className="inline-block min-w-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}
        >
          <div dangerouslySetInnerHTML={{ __html: svg }} className="mermaid-diagram" />
        </div>
      </div>
    </div>
  );
};

/**
 * Chart Renderer Component
 */
const ChartRenderer: React.FC<{ chartData: any }> = ({ chartData }) => {
  // Determine chart type - check multiple possible locations
  let chartType = 'line'; // default

  if (chartData.chartType) {
    chartType = chartData.chartType;
  } else if (chartData.type && chartData.type !== 'chart') {
    chartType = chartData.type;
  } else if (chartData.data?.type) {
    chartType = chartData.data.type;
  }

  const ChartComponent = {
    line: Line,
    bar: Bar,
    pie: Pie,
    doughnut: Doughnut,
  }[chartType.toLowerCase()] || Line;

  return (
    <div className="h-full p-6 bg-white dark:bg-gray-900">
      <div className="h-full max-h-[600px]">
        <ChartComponent
          data={chartData.data}
          options={{
            ...chartData.options,
            responsive: true,
            maintainAspectRatio: true,
          }}
        />
      </div>
    </div>
  );
};

const ArtifactContentRenderer: React.FC<{ artifact: ClaraArtifact }> = ({ artifact }) => {
  const [showCode, setShowCode] = useState(false);

  // HTML - Live Preview
  if (artifact.type === 'html' || artifact.language === 'html') {
    return (
      <div className="h-full flex flex-col bg-transparent dark:bg-transparent">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {showCode ? 'HTML Source' : 'Live Preview'}
            </span>
          </div>
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-3 py-1.5 text-xs font-medium bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 hover:bg-sakura-200 dark:hover:bg-sakura-900/50 rounded-lg transition-all duration-200 flex items-center gap-1.5"
          >
            {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showCode ? 'Preview' : 'Code'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {showCode ? (
            <SyntaxHighlighter language="html" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%', background: 'transparent', fontSize: '13px' }} showLineNumbers>
              {artifact.content}
            </SyntaxHighlighter>
          ) : (
            <iframe srcDoc={artifact.content} className="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-same-origin" title="HTML Preview" />
          )}
        </div>
      </div>
    );
  }

  // Mermaid - Diagram Preview
  if (artifact.type === 'mermaid' || artifact.language === 'mermaid') {
    return (
      <div className="h-full flex flex-col bg-transparent dark:bg-transparent">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {showCode ? 'Diagram Source' : 'Diagram Preview'}
            </span>
          </div>
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-3 py-1.5 text-xs font-medium bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 hover:bg-sakura-200 dark:hover:bg-sakura-900/50 rounded-lg transition-all duration-200 flex items-center gap-1.5"
          >
            {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showCode ? 'Preview' : 'Code'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {showCode ? (
            <SyntaxHighlighter language="mermaid" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%', background: 'transparent', fontSize: '13px' }} showLineNumbers>
              {artifact.content}
            </SyntaxHighlighter>
          ) : (
            <MermaidRenderer content={artifact.content} />
          )}
        </div>
      </div>
    );
  }

  // Charts - Interactive Chart
  if (artifact.type === 'chart') {
    try {
      const chartData = typeof artifact.content === 'string' ? JSON.parse(artifact.content) : artifact.content;
      return (
        <div className="h-full flex flex-col bg-transparent dark:bg-transparent">
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {showCode ? 'Chart Data' : 'Chart Preview'}
              </span>
            </div>
            <button
              onClick={() => setShowCode(!showCode)}
              className="px-3 py-1.5 text-xs font-medium bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 hover:bg-sakura-200 dark:hover:bg-sakura-900/50 rounded-lg transition-all duration-200 flex items-center gap-1.5"
            >
              {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
              {showCode ? 'Preview' : 'Data'}
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {showCode ? (
              <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%', background: 'transparent', fontSize: '13px' }} showLineNumbers>
                {typeof artifact.content === 'string' ? artifact.content : JSON.stringify(chartData, null, 2)}
              </SyntaxHighlighter>
            ) : (
              <ChartRenderer chartData={chartData} />
            )}
          </div>
        </div>
      );
    } catch (err) {
      console.error('Chart parsing error:', err);
      return (
        <div className="h-full flex items-center justify-center p-6 bg-white dark:bg-gray-900">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 text-sm mb-2">Failed to parse chart data</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Invalid JSON format</p>
          </div>
        </div>
      );
    }
  }

  // Markdown
  if (artifact.type === 'markdown' || artifact.language === 'markdown' || artifact.language === 'md') {
    return (
      <div className="h-full flex flex-col bg-transparent dark:bg-transparent">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {showCode ? 'Markdown Source' : 'Rendered Preview'}
            </span>
          </div>
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-3 py-1.5 text-xs font-medium bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 hover:bg-sakura-200 dark:hover:bg-sakura-900/50 rounded-lg transition-all duration-200 flex items-center gap-1.5"
          >
            {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showCode ? 'Preview' : 'Code'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {showCode ? (
            <SyntaxHighlighter language="markdown" style={vscDarkPlus} customStyle={{ margin: 0, height: '100%', background: 'transparent', fontSize: '13px' }} showLineNumbers>
              {artifact.content}
            </SyntaxHighlighter>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none p-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {artifact.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Table (render as markdown with table support)
  if (artifact.type === 'table') {
    return (
      <div className="h-full overflow-auto bg-transparent dark:bg-transparent">
        <div className="prose prose-sm dark:prose-invert max-w-none p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {artifact.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // Default: Code with syntax highlighting
  return (
    <div className="h-full overflow-auto bg-transparent dark:bg-transparent">
      <SyntaxHighlighter language={artifact.language || 'text'} style={vscDarkPlus} customStyle={{ margin: 0, height: '100%', background: 'transparent', fontSize: '13px', padding: '1.5rem' }} showLineNumbers>
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

const ClaraArtifactPane: React.FC<ArtifactPaneProps> = ({ artifacts, isOpen, onClose, className = '' }) => {
  const [currentArtifactIndex, setCurrentArtifactIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (artifacts.length > 0 && currentArtifactIndex >= artifacts.length) {
      setCurrentArtifactIndex(0);
    }
  }, [artifacts.length, currentArtifactIndex]);

  const currentArtifact = artifacts[currentArtifactIndex];
  const hasMultipleArtifacts = artifacts.length > 1;

  const handlePrevious = useCallback(() => setCurrentArtifactIndex((prev) => prev > 0 ? prev - 1 : artifacts.length - 1), [artifacts.length]);
  const handleNext = useCallback(() => setCurrentArtifactIndex((prev) => prev < artifacts.length - 1 ? prev + 1 : 0), [artifacts.length]);

  const handleCopy = useCallback(async () => {
    if (!currentArtifact) return;
    const success = await copyToClipboard(currentArtifact.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentArtifact]);

  const handleDownload = useCallback(() => {
    if (!currentArtifact) return;
    const blob = new Blob([currentArtifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentArtifact.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${currentArtifact.language || 'txt'}`;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentArtifact]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (hasMultipleArtifacts) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevious(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, hasMultipleArtifacts, handlePrevious, handleNext, onClose]);

  if (!isOpen || artifacts.length === 0) return null;

  const getArtifactTypeLabel = (artifact: ClaraArtifact): string => {
    const typeLabels: Record<string, string> = {
      code: artifact.language ? artifact.language.toUpperCase() : 'Code',
      html: 'HTML', markdown: 'Markdown', table: 'Table', chart: 'Chart', json: 'JSON', mermaid: 'Diagram',
    };
    return typeLabels[artifact.type] || artifact.type;
  };

  return (
    <div className={`h-full flex flex-col bg-transparent dark:bg-transparent border-l border-gray-200/50 dark:border-gray-700/50 ${className}`}>
      <div className="flex-shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-sakura-400 to-sakura-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">Artifact</h3>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200" title="Close (Esc)">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-sakura-100 dark:hover:bg-sakura-900/30 rounded-lg transition-all duration-200">
              {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /><span className="text-green-500">Copied!</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
            </button>
            <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-sakura-100 dark:hover:bg-sakura-900/30 rounded-lg transition-all duration-200">
              <Download className="w-3.5 h-3.5" /><span>Download</span>
            </button>
          </div>
          {hasMultipleArtifacts && (
            <div className="flex items-center gap-2">
              <button onClick={handlePrevious} className="p-1.5 text-gray-500 hover:text-sakura-600 dark:text-gray-400 dark:hover:text-sakura-400 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded-lg transition-all duration-200" title="Previous (←)">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[3rem] text-center px-2 py-1 bg-sakura-50 dark:bg-sakura-900/20 rounded-lg">
                {currentArtifactIndex + 1} / {artifacts.length}
              </span>
              <button onClick={handleNext} className="p-1.5 text-gray-500 hover:text-sakura-600 dark:text-gray-400 dark:hover:text-sakura-400 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded-lg transition-all duration-200" title="Next (→)">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {currentArtifact ? (
          <ArtifactContentRenderer artifact={currentArtifact} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-3 text-sakura-400 opacity-50" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No artifact selected</p>
            </div>
          </div>
        )}
      </div>
      {hasMultipleArtifacts && (
        <div className="flex-shrink-0 border-t border-gray-200/50 dark:border-gray-700/50 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm px-4 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">← → to navigate • Esc to close</p>
        </div>
      )}
    </div>
  );
};

export default ClaraArtifactPane;
