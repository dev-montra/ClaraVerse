import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Send, Bot, User, Copy, Check, FileText, ExternalLink,
  AlertTriangle, Upload, MessageCircle, Quote
} from 'lucide-react';
import DocumentUpload from './DocumentUpload';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  role?: 'user' | 'assistant'; // Add role property for compatibility
  mode?: 'chat' | 'citation'; // Track which mode was used
  citations?: Array<{
    file_path: string;
    title: string;
    content?: string;
  }>;
}

interface ProgressState {
  isActive: boolean;
  message: string;
  progress: number;
  details?: string;
}

interface NotebookChatProps {
  messages?: ChatMessage[];
  onSendMessage?: (message: string, mode?: 'chat' | 'citation') => void;
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
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  const [chatMode, setChatMode] = useState<'chat' | 'citation'>('chat');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Progress tracking effect
  useEffect(() => {
    let hideTimeout: NodeJS.Timeout | null = null;
    
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog(...args);
      
      const message = args.join(' ');
      if (message.includes('progress:')) {
        try {
          const progressMatch = message.match(/progress:\s*({.*})/);
          if (progressMatch) {
            const progressObj = JSON.parse(progressMatch[1]);
            
            if (hideTimeout) {
              clearTimeout(hideTimeout);
              hideTimeout = null;
            }

            setProgressState(progressObj as ProgressState);
            
            // Auto-hide progress after completion with longer delay
            if (progressObj.progress >= 100) {
              hideTimeout = setTimeout(() => {
                setProgressState(null);
              }, 3000);
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }
    };

    const handleProgressUpdate = (event: CustomEvent) => {
      const progressObj = event.detail;
      if (progressObj) {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }

        setProgressState(progressObj as ProgressState);
        
        // Auto-hide progress after completion with longer delay
        if (progressObj.progress >= 100) {
          hideTimeout = setTimeout(() => {
            setProgressState(null);
          }, 3000);
        }
      }
    };

    window.addEventListener('clara-progress-update', handleProgressUpdate as EventListener);

    return () => {
      window.removeEventListener('clara-progress-update', handleProgressUpdate as EventListener);
      console.log = originalLog;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [inputMessage]);

  // Load chat history and templates on mount
  useEffect(() => {
    // Templates and history functionality removed
  }, [isBackendHealthy, notebookId]);



  // Update chat messages when props change
  useEffect(() => {
    setChatMessages(messages || []);
  }, [messages]);

  const handleSendMessage = () => {
    if (inputMessage.trim() && !isLoading && isBackendHealthy && completedDocumentCount > 0) {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: inputMessage.trim(),
        timestamp: new Date(),
        mode: chatMode
      };
      
      // Add user message immediately
      setChatMessages(prev => [...prev, userMessage]);
      
      onSendMessage(inputMessage.trim(), chatMode);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessage = (content: string) => {
    // Split by code blocks and regular text
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        // Code block
        const code = part.slice(3, -3);
        const lines = code.split('\n');
        const language = lines[0]?.trim() || '';
        const codeContent = language ? lines.slice(1).join('\n') : code;
        
        return (
          <div key={index} className="my-4">
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">{language || 'code'}</span>
                <button
                  onClick={() => copyToClipboard(codeContent, `code-${index}`)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <pre className="text-gray-100 text-sm leading-relaxed">
                <code>{codeContent}</code>
              </pre>
            </div>
          </div>
        );
      } else {
        // Regular text with basic markdown
        return (
          <div key={index}>
            {part.split('\n').map((line, lineIndex) => {
              if (line.trim() === '') return <br key={lineIndex} />;
              
              // Handle bold text
              const boldFormatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              // Handle italic text
              const italicFormatted = boldFormatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
              // Handle inline code
              const codeFormatted = italicFormatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm">$1</code>');
              
              return (
                <p key={lineIndex} className="mb-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: codeFormatted }} />
              );
            })}
          </div>
        );
      }
    });
  };

  const handleDocumentUpload = (files: File[]) => {
    if (onDocumentUpload) {
      onDocumentUpload(files);
    } else {
      // Handle document upload logic here
      console.log('Uploading documents:', files.map(f => f.name));
    }
    setShowUploadModal(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Messages Area - Clara Style */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 custom-scrollbar relative z-10">
        {(!chatMessages || chatMessages.length === 0) && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center glassmorphic bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-3xl border border-white/30 dark:border-gray-700/30 shadow-2xl p-10 max-w-lg">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl ring-4 ring-white/20">
                <MessageSquare className="w-10 h-10 text-white drop-shadow-lg" />
              </div>
              {documentCount === 0 ? (
                <div>
                  <h3 className="text-gray-900 dark:text-white font-bold text-xl mb-4">
                    Welcome to Your Knowledge Base
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Upload documents to start chatting and ask questions about your content
                  </p>
                  <div className="inline-flex items-center gap-3 glassmorphic bg-blue-50/80 dark:bg-blue-900/30 px-6 py-3 rounded-2xl border border-blue-200/50 dark:border-blue-700/30">
                    <Upload className="w-5 h-5 text-blue-700 dark:text-blue-400 drop-shadow-sm" />
                    <span className="text-blue-700 dark:text-blue-300 font-semibold">Get started by uploading files</span>
                  </div>
                </div>
              ) : completedDocumentCount === 0 ? (
                <div>
                  <h3 className="text-gray-900 dark:text-white font-bold text-xl mb-4">
                    Processing Your Documents
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Please wait while we analyze your documents
                  </p>
                  <div className="flex items-center justify-center gap-3 glassmorphic bg-yellow-50/80 dark:bg-yellow-900/30 px-6 py-3 rounded-2xl border border-yellow-200/50 dark:border-yellow-700/30">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse shadow-lg"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse shadow-lg" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse shadow-lg" style={{ animationDelay: '0.4s' }}></div>
                    <span className="text-yellow-700 dark:text-yellow-300 font-semibold">Processing in progress...</span>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-gray-900 dark:text-white font-bold text-xl mb-4">
                    Ready to Chat
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    Start a conversation about your documents
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {(chatMessages || []).map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'assistant' && (
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-xl ring-2 ring-white/10 backdrop-blur-sm ${
                message.mode === 'citation'
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                  : 'bg-gradient-to-br from-blue-500 to-purple-600'
              }`}>
                {message.mode === 'citation' ? (
                  <Quote className="w-5 h-5 text-white" />
                ) : (
                  <Bot className="w-5 h-5 text-white" />
                )}
              </div>
            )}
            
            <div className={`max-w-2xl ${message.type === 'user' ? 'order-1 min-w-80' : ''}`}>
              {/* Mode Badge for user messages */}
              {message.type === 'user' && message.mode && (
                <div className="flex justify-end mb-1">
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    message.mode === 'citation'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                  }`}>
                    {message.mode === 'citation' ? (
                      <>
                        <Quote className="w-3 h-3" />
                        <span>Citation</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-3 h-3" />
                        <span>Chat</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              
              <div
                className={`glassmorphic backdrop-blur-xl rounded-2xl p-4 shadow-xl transition-all duration-300 hover:shadow-2xl border ${
                  message.type === 'user'
                    ? 'bg-gradient-to-br from-blue-500/90 to-purple-600/90 text-white ml-auto border-blue-400/30 shadow-blue-500/20'
                    : message.mode === 'citation'
                      ? 'bg-white/70 dark:bg-gray-800/70 text-gray-900 dark:text-white border-emerald-300/50 dark:border-emerald-700/30 ring-2 ring-emerald-500/10'
                      : 'bg-white/70 dark:bg-gray-800/70 text-gray-900 dark:text-white border-white/30 dark:border-gray-700/30'
                }`}
              >
                <div className={`prose-sm max-w-none break-words ${
                  message.type === 'user' 
                    ? 'prose-invert' 
                    : 'prose-gray dark:prose-invert'
                }`}>
                  {typeof formatMessage(message.content) === 'string' ? (
                    <p className={`leading-relaxed ${message.type === 'user' ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{message.content}</p>
                  ) : (
                    <div className={`leading-relaxed ${message.type === 'user' ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                      {formatMessage(message.content)}
                    </div>
                  )}
                </div>
                
                {/* Citations section for assistant messages */}
                {message.type === 'assistant' && message.citations && message.citations.length > 0 && (
                  <div className={`mt-4 pt-4 border-t ${
                    message.mode === 'citation'
                      ? 'border-emerald-300/30 dark:border-emerald-700/30'
                      : 'border-white/20 dark:border-gray-700/30'
                  }`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
                      message.mode === 'citation'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      <FileText className="w-4 h-4" />
                      {message.mode === 'citation' ? 'Citations' : 'Sources'} ({message.citations.length})
                    </h4>
                    <div className="space-y-1.5">
                      {message.citations.slice(0, message.mode === 'citation' ? 10 : 5).map((citation, index) => (
                        <div key={index} className={`flex items-center gap-2 glassmorphic p-2.5 rounded-lg border text-sm transition-all ${
                          message.mode === 'citation'
                            ? 'bg-emerald-50/70 dark:bg-emerald-900/30 border-emerald-200/50 dark:border-emerald-700/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40'
                            : 'bg-white/50 dark:bg-gray-700/50 border-white/20 dark:border-gray-600/20 hover:bg-white/70 dark:hover:bg-gray-700/70'
                        }`}>
                          <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                            message.mode === 'citation'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-blue-500 text-white'
                          }`}>
                            {index + 1}
                          </div>
                          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${
                            message.mode === 'citation'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-blue-500'
                          }`} />
                          <span className="truncate font-medium text-gray-800 dark:text-gray-200" title={citation.file_path}>
                            {citation.title}
                          </span>
                          {citation.content && message.mode === 'citation' && (
                            <div className="flex-shrink-0 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                              excerpt
                            </div>
                          )}
                          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                        </div>
                      ))}
                      {message.citations.length > (message.mode === 'citation' ? 10 : 5) && (
                        <div className={`text-sm font-medium glassmorphic p-2 rounded-lg border text-center ${
                          message.mode === 'citation'
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-700/30'
                            : 'text-gray-500 dark:text-gray-400 bg-white/40 dark:bg-gray-700/40 border-white/20 dark:border-gray-600/20'
                        }`}>
                          +{message.citations.length - (message.mode === 'citation' ? 10 : 5)} more {message.mode === 'citation' ? 'citations' : 'sources'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/20 dark:border-gray-700/30">
                  <span className={`text-xs font-medium ${
                    message.type === 'user' 
                      ? 'text-white/70' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {formatTime(message.timestamp)}
                  </span>
                  
                  {message.type === 'assistant' && (
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="glassmorphic bg-white/50 dark:bg-gray-700/50 hover:bg-white/70 dark:hover:bg-gray-700/70 p-1.5 rounded-lg border border-white/20 dark:border-gray-600/20 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all shadow-md"
                      title="Copy message"
                    >
                      {copiedId === message.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {message.type === 'user' && (
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-xl ring-2 ring-white/10 backdrop-blur-sm">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-xl ring-2 ring-white/10 backdrop-blur-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="glassmorphic bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-white/30 dark:border-gray-700/30">
              <div className="flex items-center space-x-3">
                <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full animate-bounce shadow-md"></div>
                <div className="w-2.5 h-2.5 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full animate-bounce shadow-md" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2.5 h-2.5 bg-gradient-to-r from-pink-400 to-red-500 rounded-full animate-bounce shadow-md" style={{ animationDelay: '0.4s' }}></div>
                <span className="text-gray-700 dark:text-gray-300 font-medium ml-2">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Backend Status Warning */}
      {(!isBackendHealthy || completedDocumentCount === 0) && (
        <div className="flex-shrink-0 px-6 py-3 glassmorphic bg-red-50/80 dark:bg-red-900/30 backdrop-blur-xl border-t border-red-200/50 dark:border-red-700/30 shadow-lg relative z-10">
          <div className="flex items-center">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center mr-4 shadow-lg">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <span className="text-sm font-semibold text-red-800 dark:text-red-200">
                {!isBackendHealthy 
                  ? "Backend unavailable - Chat functionality is limited"
                  : completedDocumentCount === 0 && documentCount > 0
                    ? `Processing ${documentCount} document${documentCount !== 1 ? 's' : ''} - Chat will be available once complete`
                    : documentCount === 0 
                      ? "Upload documents to enable chat functionality"
                      : ""
                }
              </span>
              {completedDocumentCount === 0 && documentCount > 0 && (
                <p className="text-xs text-red-700 dark:text-red-300 mt-1 font-medium">
                  Don't worry, this runs in the background - You can access other features meanwhile
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clara-Style Input Area - Compact & Elegant */}
      <div className="flex-shrink-0 p-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="glassmorphic bg-white/70 dark:bg-gray-900/50 backdrop-blur-2xl border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-2xl transition-all duration-300 hover:shadow-3xl hover:border-gray-300/50 dark:hover:border-gray-600/50 group relative">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                !isBackendHealthy 
                  ? "Backend unavailable..." 
                  : completedDocumentCount === 0 && documentCount > 0
                    ? "Processing documents..."
                    : documentCount === 0 
                      ? "Upload documents to start chatting..."
                      : "Ask me anything about your documents..."
              }
              disabled={!isBackendHealthy || isLoading || completedDocumentCount === 0}
              className="w-full p-4 pr-16 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl leading-relaxed group-hover:placeholder-gray-500 dark:group-hover:placeholder-gray-400 transition-all duration-200"
              style={{ minHeight: '56px', maxHeight: '120px' }}
            />
            
            {/* Mode Toggle and Send Button */}
            <div className="absolute right-2 bottom-2 flex items-center gap-2">
              {/* Chat Mode Toggle */}
              <div className="glassmorphic bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-lg border border-white/30 dark:border-gray-700/30 shadow-md p-1 flex gap-1">
                <button
                  onClick={() => setChatMode('chat')}
                  disabled={isLoading}
                  title="Chat Mode - Conversational responses with history"
                  className={`p-2 rounded-md transition-all duration-200 ${
                    chatMode === 'chat'
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setChatMode('citation')}
                  disabled={isLoading}
                  title="Citation Mode - Fact-based responses with detailed sources"
                  className={`p-2 rounded-md transition-all duration-200 ${
                    chatMode === 'citation'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Quote className="w-4 h-4" />
                </button>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading || !isBackendHealthy || completedDocumentCount === 0}
                className={`p-3 rounded-xl transition-all duration-300 transform glassmorphic border shadow-lg ${
                  inputMessage.trim() && !isLoading && isBackendHealthy && completedDocumentCount > 0
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 hover:shadow-xl hover:scale-105 border-blue-400/30'
                    : 'bg-gray-200/60 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-300/30 dark:border-gray-600/30'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Helper Text - Compact */}
          <div className="flex items-center justify-between mt-3 px-3">
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Press Enter to send, Shift+Enter for new line
              </p>
              {/* Mode Indicator */}
              <div className={`flex items-center gap-1.5 glassmorphic px-2 py-1 rounded-lg border shadow-sm ${
                chatMode === 'chat'
                  ? 'bg-blue-50/80 dark:bg-blue-900/30 border-blue-200/50 dark:border-blue-700/30'
                  : 'bg-emerald-50/80 dark:bg-emerald-900/30 border-emerald-200/50 dark:border-emerald-700/30'
              }`}>
                {chatMode === 'chat' ? (
                  <MessageCircle className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Quote className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                )}
                <span className={`text-xs font-semibold ${
                  chatMode === 'chat'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  {chatMode === 'chat' ? 'Chat Mode' : 'Citation Mode'}
                </span>
              </div>
            </div>
            {isBackendHealthy && completedDocumentCount > 0 && (
              <div className="flex items-center gap-2 glassmorphic bg-emerald-50/80 dark:bg-emerald-900/30 px-3 py-1 rounded-xl border border-emerald-200/50 dark:border-emerald-700/30">
                <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-sm animate-pulse"></div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                  {completedDocumentCount} of {documentCount} documents ready
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Document Upload Modal */}
      {showUploadModal && (
        <DocumentUpload
          onClose={() => setShowUploadModal(false)}
          onUpload={handleDocumentUpload}
        />
      )}

      {/* Progress Indicator */}
      {progressState && progressState.isActive && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glassmorphic bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/30 dark:border-gray-700/30 min-w-80">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">{progressState.message}</p>
                {progressState.details && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{progressState.details}</p>
                )}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-3">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressState.progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">{progressState.progress}%</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookChat;
