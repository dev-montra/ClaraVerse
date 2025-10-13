import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Send, Bot, User, Copy, Check,
  AlertTriangle, Upload, Loader2, Quote, FileText, ExternalLink, X,
  RefreshCcw, Target, Globe2, Puzzle, ChevronDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DocumentUpload from './DocumentUpload';
import { db } from '../../db';
import { getDefaultWallpaper } from '../../utils/uiPreferences';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  role?: 'user' | 'assistant'; // Add role property for compatibility
  mode?: 'citation'; // Always uses enhanced citation mode
  citations?: Array<{
    file_path: string;
    title: string;
    content?: string;
    document_id?: string;
    filename?: string;
    uploaded_at?: string;
    content_size?: number;
  }>;
}

const QUERY_MODE_OPTIONS: Array<{
  value: 'local' | 'global' | 'hybrid' | 'naive' | 'mix';
  label: string;
  badge?: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    value: 'hybrid',
    label: 'Hybrid',
    badge: 'Recommended',
    description: 'Blends semantic and keyword retrieval for the best match.',
    icon: RefreshCcw
  },
  {
    value: 'local',
    label: 'Local',
    description: 'Focus on documents from this notebook only.',
    icon: Target
  },
  {
    value: 'global',
    label: 'Global',
    description: 'Look across your full Clara workspace.',
    icon: Globe2
  },
  {
    value: 'mix',
    label: 'Mix',
    description: 'Try a curated blend of local and global insights.',
    icon: Puzzle
  },
  {
    value: 'naive',
    label: 'Naive',
    description: 'Basic retrieval without reranking or enrichment.',
    icon: FileText
  }
];

interface NotebookChatProps {
  messages?: ChatMessage[];
  onSendMessage?: (message: string, mode?: 'local' | 'global' | 'hybrid' | 'naive' | 'mix') => void;
  isLoading?: boolean;
  notebookId: string;
  documentCount?: number;
  completedDocumentCount?: number;
  isBackendHealthy?: boolean;
  onDocumentUpload?: (files: File[]) => void;
}

const NotebookChat: React.FC<NotebookChatProps> = ({
  messages,
  onSendMessage = () => {},
  isLoading = false,
  notebookId,
  documentCount = 0,
  completedDocumentCount = 0,
  isBackendHealthy = true,
  onDocumentUpload
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages || []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentContent, setDocumentContent] = useState<string>('');
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [queryMode, setQueryMode] = useState<'local' | 'global' | 'hybrid' | 'naive' | 'mix'>('hybrid');
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [isQueryModeOpen, setIsQueryModeOpen] = useState(false);
  // Enhanced citation mode is always enabled
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync messages from props
  useEffect(() => {
    setChatMessages(messages || []);
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isLoading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isQueryModeOpen) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsQueryModeOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsQueryModeOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isQueryModeOpen]);

  // Format message content with markdown support
  const formatMessage = (content: string) => {
    return (
      <ReactMarkdown
        className="markdown-content"
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom components for Clara styling
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          h1: ({ children }) => <h1 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-white">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-medium mb-2 text-gray-900 dark:text-white">{children}</h5>,
          h6: ({ children }) => <h6 className="text-xs font-medium mb-2 text-gray-900 dark:text-white">{children}</h6>,
          ul: ({ children }) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono text-gray-900 dark:text-gray-100">
                {children}
              </code>
            ) : (
              <code className={`block p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-mono overflow-x-auto text-gray-900 dark:text-gray-100 ${className}`}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-sakura-300 dark:border-sakura-600 pl-4 mb-3 italic text-gray-700 dark:text-gray-300">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a 
              href={href} 
              className="text-sakura-600 dark:text-sakura-400 hover:text-sakura-700 dark:hover:text-sakura-300 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          // Table components with Clara styling
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50 dark:bg-gray-700">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600">
              {children}
            </td>
          ),
          // Task list support
          input: ({ checked, type, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input 
                  type="checkbox" 
                  checked={checked} 
                  readOnly 
                  className="mr-2 rounded text-sakura-500 focus:ring-sakura-500"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
          // Horizontal rule
          hr: () => <hr className="my-4 border-gray-300 dark:border-gray-600" />,
          // Delete/strikethrough text
          del: ({ children }) => <del className="line-through text-gray-500 dark:text-gray-400">{children}</del>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle copy message
  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  // Handle send message
  const handleSendMessage = () => {
    if (!inputMessage.trim() || isLoading) return;

    onSendMessage(inputMessage.trim(), queryMode);
    setInputMessage('');

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle textarea auto-resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Handle document upload
  const handleDocumentUpload = async (files: File[]) => {
    if (onDocumentUpload) {
      await onDocumentUpload(files);
    }
    setShowUploadModal(false);
  };

  // Use shared wallpaper so the notebook chat matches Clara Assistant styling
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        } else {
          const fallback = getDefaultWallpaper();
          if (fallback) {
            setWallpaperUrl(fallback);
          }
        }
      } catch (error) {
        console.error('Error loading wallpaper for notebook chat:', error);
        const fallback = getDefaultWallpaper();
        if (fallback) {
          setWallpaperUrl(fallback);
        }
      }
    };

    loadWallpaper();
  }, []);

  // Handle view document in modal
  const handleViewDocument = async (citation: any) => {
    if (!citation.document_id) return;

    setIsLoadingDocument(true);
    setDocumentTitle(citation.title || citation.filename || 'Document');
    setShowDocumentModal(true);

    try {
      // Get Python Backend URL dynamically
      let backendUrl = 'http://localhost:5001';
      try {
        if ((window as any).electronAPI?.getPythonBackendUrl) {
          const result = await (window as any).electronAPI.getPythonBackendUrl();
          if (result.success && result.url) {
            backendUrl = result.url;
          }
        }
      } catch (error) {
        console.warn('Failed to get Python Backend URL, using default:', error);
      }

      const response = await fetch(
        `${backendUrl}/notebooks/${notebookId}/documents/${citation.document_id}/download`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }

      const content = await response.text();
      setDocumentContent(content);
    } catch (error) {
      console.error('Error fetching document:', error);
      setDocumentContent('Failed to load document content.');
    } finally {
      setIsLoadingDocument(false);
    }
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden" data-notebook-chat>
      {wallpaperUrl && (
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage: `url(${wallpaperUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(1.5px)'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-slate-900/60 to-black/80" />
        </div>
      )}
      {!wallpaperUrl && (
        <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-b from-slate-950 via-slate-900 to-black" />
      )}

      {/* Messages Area - Clara Style */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0 custom-scrollbar">
        {(!chatMessages || chatMessages.length === 0) && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center rounded-3xl border border-white/10 bg-white/10 dark:bg-black/40 backdrop-blur-xl shadow-2xl shadow-black/30 p-10 max-w-lg">
              <div className="w-16 h-16 bg-white/20 dark:bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <MessageSquare className="w-8 h-8 text-white/90" />
              </div>
              {documentCount === 0 ? (
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    No documents yet
                  </h3>
                  <p className="text-white/70 mb-6 leading-relaxed">
                    Upload documents to start building your knowledge base and ask Clara questions about them.
                  </p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 bg-sakura-500/90 hover:bg-sakura-500 text-white flex items-center gap-2 mx-auto shadow-lg shadow-sakura-900/30"
                  >
                    <Upload className="w-5 h-5" />
                    Upload Documents
                  </button>
                </div>
              ) : completedDocumentCount === 0 ? (
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    Processing documents...
                  </h3>
                  <p className="text-white/70 mb-6 leading-relaxed">
                    Your documents are being processed. You can start chatting once processing is complete.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-sakura-400" />
                    <span className="text-sm font-medium text-white/70">
                      Processing {documentCount} document{documentCount !== 1 ? 's' : ''}...
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    Ready to chat!
                  </h3>
                  <p className="text-white/70 mb-6 leading-relaxed">
                    Ask Clara anything about your {completedDocumentCount} processed document{completedDocumentCount !== 1 ? 's' : ''}.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clara-style Messages */}
        {(chatMessages || []).map((message) => {
          const isUser = message.type === 'user';
          
          return (
            <div
              key={message.id}
              className={`flex gap-4 mb-8 group ${isUser ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar - Clara Style with enhanced citation mode */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/30 ${
                isUser
                  ? 'bg-sakura-500'
                  : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-500'
              }`}>
                {isUser ? (
                  <User className="w-5 h-5 text-white" />
                ) : (
                  <Quote className="w-5 h-5 text-white drop-shadow-sm" />
                )}
              </div>

              {/* Message Content Container */}
              <div className={`flex-1 ${isUser ? 'ml-auto items-end flex flex-col' : 'max-w-4xl'}`}>
                {/* Header with name and timestamp */}
                <div className={`flex items-center gap-2 mb-3 ${isUser ? 'justify-end' : ''}`}>
                  <span className="text-[15px] font-semibold text-white">
                    {isUser ? 'You' : 'Clara'}
                  </span>
                  <span className="text-xs text-white/60">
                    {formatTime(message.timestamp)}
                  </span>
                  
                  {/* Copy button */}
                  <button
                    onClick={() => handleCopyMessage(message.content, message.id)}
                    className={`opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all duration-200 ${
                      copiedId === message.id
                        ? 'text-emerald-300'
                        : 'text-white/40 hover:text-white hover:bg-white/10'
                    }`}
                    title="Copy message"
                  >
                    {copiedId === message.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Message Bubble - Clara Style with enhanced citation mode */}
                <div className={`rounded-2xl px-5 py-4 backdrop-blur-md border transition-colors ${
                  isUser
                    ? 'bg-gradient-to-br from-sakura-200/70 to-pink-200/60 dark:from-sakura-900/50 dark:to-pink-900/40 border-white/20 dark:border-sakura-700/40 shadow-lg shadow-sakura-900/30'
                    : 'bg-white/12 dark:bg-black/50 border-white/10 shadow-lg shadow-black/40'
                }`}>
                  
                  {/* Message Content */}
                  <div className={`prose prose-base max-w-none break-words text-base ${
                    isUser 
                      ? 'prose-gray dark:prose-gray text-gray-900 dark:text-gray-100'
                      : 'prose-gray prose-invert text-gray-50'
                  }`}>
                    <div className="leading-relaxed text-base">
                      {formatMessage(message.content)}
                    </div>
                  </div>

                  {/* Citations section for assistant messages - Enhanced citation mode always enabled */}
                  {!isUser && message.citations && message.citations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2 text-white/60">
                        <FileText className="w-4 h-4" />
                        Citations · {message.citations.length}
                      </h4>
                      <div className="space-y-2">
                        {message.citations.slice(0, 20).map((citation, index) => {
                          return (
                            <button
                              key={index}
                              onClick={() => handleViewDocument(citation)}
                              disabled={!citation.document_id}
                              className="w-full flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-3 py-2 text-sm text-white/80 backdrop-blur disabled:cursor-not-allowed disabled:opacity-50"
                              title={citation.document_id ? `Click to view: ${citation.filename}` : 'Document not available'}
                            >
                              <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold bg-white/10 text-white">
                                {index + 1}
                              </div>
                              <FileText className="w-4 h-4 flex-shrink-0 text-white/60" />
                              <span className="truncate font-medium text-white/80 text-left" title={citation.file_path}>
                                {citation.title}
                              </span>
                              {citation.content && (
                                <div className="flex-shrink-0 text-xs text-white/60 bg-white/10 px-1.5 py-0.5 rounded">
                                  Excerpt
                                </div>
                              )}
                              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60 ml-auto" />
                            </button>
                          );
                        })}
                        {message.citations.length > 20 && (
                          <div className="text-xs uppercase tracking-wide text-center text-white/60 bg-white/5 border border-white/10 rounded-lg py-2">
                            +{message.citations.length - 20} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          );
        })}

        {/* Loading indicator - Clara Style */}
        {isLoading && (
          <div className="flex gap-4 mb-8">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/30 bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-500">
              <Bot className="w-5 h-5 text-white drop-shadow-sm" />
            </div>
            <div className="flex-1 max-w-4xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[15px] font-semibold text-white">Clara</span>
                <span className="text-xs text-white/60">typing...</span>
              </div>
              <div className="rounded-2xl px-5 py-4 border border-white/10 bg-white/12 backdrop-blur-md">
                <div className="flex items-center gap-3 text-white/70">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-sm">Clara is thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Clara Style */}
      <div className="flex-shrink-0 px-6 pb-6 relative z-10">
        <div className="rounded-2xl border border-white/10 bg-white/10 dark:bg-black/60 backdrop-blur-xl shadow-xl shadow-black/30 px-5 py-4 transition-all duration-300">
          {/* Backend health warning */}
          {!isBackendHealthy && (
            <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 flex items-center gap-2 text-red-200">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">
                  Notebook backend is not available. Please check your connection.
                </p>
            </div>
          )}

          {/* Main Input Container - Clara Style */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder={
                !isBackendHealthy 
                  ? "Backend not available..." 
                  : completedDocumentCount === 0 
                    ? "Upload and process documents first..."
                    : "Ask Clara about your documents..."
              }
              disabled={isLoading || !isBackendHealthy || completedDocumentCount === 0}
              className="w-full border-0 outline-none focus:outline-none focus:ring-0 resize-none bg-transparent text-white placeholder-white/40 pr-12 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                height: 'auto',
                minHeight: '20px',
                maxHeight: '100px',
                overflowY: 'auto',
                padding: '4px 48px 4px 0',
                borderRadius: '0'
              }}
            />
            
            {/* Send Button - Enhanced citation mode always enabled */}
            <div className="absolute right-0 bottom-2 flex items-center gap-2">
              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading || !isBackendHealthy || completedDocumentCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm shadow-lg shadow-sakura-900/30"
                title="Send message (Enter)"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Query Mode Selector */}
          <div className="mt-3 flex items-center justify-between px-1">
            <p className="text-xs text-white/60 font-medium">
              Press Enter to send, Shift+Enter for new line
            </p>
            <div className="flex items-center gap-2" ref={dropdownRef}>
              <span className="text-xs text-white/60 font-medium">Query Mode:</span>
              <div className="relative z-50">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isQueryModeOpen}
                  onClick={() => setIsQueryModeOpen((prev) => !prev)}
                  className="group flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold text-white/80 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-sakura-400 focus:ring-offset-2 focus:ring-offset-black/40 transition-all backdrop-blur cursor-pointer whitespace-nowrap"
                  title={(() => {
                    const activeOption = QUERY_MODE_OPTIONS.find((o) => o.value === queryMode);
                    return activeOption?.description || 'Select retrieval strategy';
                  })()}
                >
                  {(() => {
                    const activeOption = QUERY_MODE_OPTIONS.find((option) => option.value === queryMode);
                    const Icon = activeOption?.icon ?? FileText;
                    return (
                      <>
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-[13px]">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-white leading-none">
                          {activeOption?.label ?? 'Choose mode'}
                        </span>
                        <ChevronDown className={`ml-0.5 h-3.5 w-3.5 text-white/70 transition-transform ${isQueryModeOpen ? 'rotate-180' : ''}`} />
                      </>
                    );
                  })()}
                </button>

                {isQueryModeOpen && (
                  <div
                    role="listbox"
                    tabIndex={-1}
                    onWheel={(event) => event.stopPropagation()}
                    className="absolute bottom-full right-0 mb-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-2 shadow-2xl shadow-black/40 ring-1 ring-black/30 backdrop-blur-xl custom-scrollbar"
                  >
                    {QUERY_MODE_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = queryMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            setQueryMode(option.value);
                            setIsQueryModeOpen(false);
                          }}
                          className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2 mb-1 text-left transition-all cursor-pointer ${
                            isActive
                              ? 'bg-sakura-500/20 text-white ring-1 ring-sakura-400/60'
                              : 'text-white/80 hover:bg-white/15 hover:text-white hover:shadow-md'
                          }`}
                        >
                          <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/10 text-sm ${
                            isActive ? 'border-sakura-400/60 text-white' : 'text-white/80'
                          }`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="flex flex-col">
                            <span className="text-sm font-semibold leading-tight">
                              {option.label}
                              {option.badge && (
                                <span className="ml-2 rounded-full bg-sakura-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sakura-100">
                                  {option.badge}
                                </span>
                              )}
                            </span>
                            <span className="mt-1 text-[12px] leading-snug text-white/60">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUpload
          onClose={() => setShowUploadModal(false)}
          onUpload={handleDocumentUpload}
        />
      )}

      {/* Document Viewer Modal - compact citation view */}
      {showDocumentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-6">
          <div className="w-full max-w-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {documentTitle}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Quote className="w-3 h-3" />
                  Source document citation
                </p>
              </div>
              <button
                onClick={() => setShowDocumentModal(false)}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
              {isLoadingDocument ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-gray-600 dark:text-gray-300">
                  <div className="h-9 w-9 rounded-full border-2 border-gray-200 dark:border-gray-700 border-t-transparent animate-spin"></div>
                  <span>Loading document...</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {documentContent}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowDocumentModal(false)}
                className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookChat;
