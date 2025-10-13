/**
 * Clara Assistant Chat Window Component
 * 
 * This component serves as the main chat interface for the Clara assistant.
 * It displays the conversation history, handles message rendering, and manages
 * the chat window state including scrolling, loading states, and empty states.
 * 
 * Features:
 * - Message history display with virtualization for performance
 * - Smooth auto-scrolling like Claude/ChatGPT
 * - Loading states and indicators
 * - Empty state with welcome message
 * - Content chunking for large messages
 * - Message interaction handling
 * - Session management
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  MessageCircle,
  Sparkles,
  FileText,
  Code,
  Search,
  Bot,
  ArrowDown,
  RefreshCw,
  Loader2,
  Brain,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Import types and components
import { 
  ClaraMessage, 
  ClaraChatWindowProps,
  ClaraProcessingState
} from '../../types/clara_assistant_types';
import ClaraMessageBubble from './clara_assistant_message_bubble';
import { useSmoothScroll } from '../../hooks/useSmoothScroll';

/**
 * Virtual scrolling configuration
 */
const VIRTUAL_CONFIG = {
  ESTIMATED_MESSAGE_HEIGHT: 150, // Estimated height per message in pixels
  BUFFER_SIZE: 5, // Number of extra messages to render above/below visible area
  CONTAINER_PADDING: 48, // Top/bottom padding in pixels
  SCROLL_DEBOUNCE: 16, // Scroll event debounce in ms (~60fps)
  OVERSCAN: 2 // Additional messages to render for smoother scrolling
};

/**
 * Content chunking configuration for large messages
 */
const CONTENT_CONFIG = {
  CHUNK_SIZE: 2000, // Characters per chunk
  INITIAL_CHUNKS: 2, // Number of chunks to show initially
  EXPAND_THRESHOLD: 5000, // Show "Show More" if content is longer than this
};

/**
 * Industry-standard scroll configuration (ChatGPT/Claude style)
 */
const SCROLL_CONFIG = {
  SCROLL_THRESHOLD: 150, // Pixels from bottom to consider "at bottom" (ChatGPT uses ~200px)
};

/**
 * Virtual message item interface
 */
interface VirtualMessageItem {
  message: ClaraMessage;
  index: number;
  top: number;
  height: number;
  isVisible: boolean;
}

/**
 * Content chunk interface for large message content
 */
interface ContentChunk {
  id: string;
  content: string;
  isVisible: boolean;
}

/**
 * Chunked Message Content Component
 * Handles large content by breaking it into chunks
 */
const ChunkedMessageContent: React.FC<{
  message: ClaraMessage;
  userName?: string;
  isEditable?: boolean;
  onCopy?: (content: string) => void;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
}> = ({ message, userName, isEditable, onCopy, onRetry, onEdit }) => {
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // Check if content needs chunking
  const needsChunking = message.content.length > CONTENT_CONFIG.EXPAND_THRESHOLD;
  
  // Create chunks if needed
  const chunks: ContentChunk[] = useMemo(() => {
    if (!needsChunking) {
      return [{
        id: `${message.id}-full`,
        content: message.content,
        isVisible: true
      }];
    }

    const chunkArray: ContentChunk[] = [];
    const content = message.content;
    
    for (let i = 0; i < content.length; i += CONTENT_CONFIG.CHUNK_SIZE) {
      const chunkContent = content.slice(i, i + CONTENT_CONFIG.CHUNK_SIZE);
      const chunkIndex = Math.floor(i / CONTENT_CONFIG.CHUNK_SIZE);
      
      chunkArray.push({
        id: `${message.id}-chunk-${chunkIndex}`,
        content: chunkContent,
        isVisible: chunkIndex < CONTENT_CONFIG.INITIAL_CHUNKS || showAll
      });
    }
    
    return chunkArray;
  }, [message.content, message.id, needsChunking, showAll]);

  // Handle expand/collapse
  const handleToggleExpand = useCallback(() => {
    setShowAll(!showAll);
  }, [showAll]);

  // For streaming messages, always show all content
  const isStreaming = message.metadata?.isStreaming;
  const chunksToShow = isStreaming || !needsChunking ? chunks : chunks.filter(chunk => chunk.isVisible);

  return (
    <div className="space-y-2">
      {/* Render visible chunks */}
      {chunksToShow.map((chunk, index) => (
        <div key={chunk.id} className={index > 0 ? "pt-2" : ""}>
          <ClaraMessageBubble
            message={{
              ...message,
              content: chunk.content,
              id: chunk.id
            }}
            userName={userName}
            isEditable={isEditable && index === 0} // Only first chunk is editable
            onCopy={onCopy}
            onRetry={index === 0 ? onRetry : undefined} // Only first chunk can retry
            onEdit={index === 0 ? onEdit : undefined} // Only first chunk can edit
          />
        </div>
      ))}
      
      {/* Show More/Less button */}
      {needsChunking && !isStreaming && (
        <div className="flex justify-center mt-3">
          <button
            onClick={handleToggleExpand}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            {showAll ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show More ({Math.ceil((message.content.length - (CONTENT_CONFIG.INITIAL_CHUNKS * CONTENT_CONFIG.CHUNK_SIZE)) / CONTENT_CONFIG.CHUNK_SIZE)} more sections)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Virtualized Message List Component
 * Only renders visible messages plus a buffer for performance
 */
const VirtualizedMessageList: React.FC<{
  messages: ClaraMessage[];
  userName?: string;
  containerHeight: number;
  scrollTop: number;
  onMessageAction: (action: string, messageId: string, data?: any) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}> = ({ 
  messages, 
  userName, 
  containerHeight, 
  scrollTop, 
  onMessageAction,
  messagesEndRef 
}) => {
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(new Map());
  const measurementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastMeasurements = useRef<Map<string, number>>(new Map());

  // Debounce state updates to prevent rapid updates
  const debouncedSetHeights = useCallback(
    (newHeights: Map<string, number>) => {
      // Only update if heights have actually changed
      const hasChanges = Array.from(newHeights.entries()).some(([id, height]) => {
        const lastHeight = lastMeasurements.current.get(id);
        return lastHeight === undefined || lastHeight !== height;
      });

      if (hasChanges) {
        setMeasuredHeights(newHeights);
        // Update last measurements
        lastMeasurements.current = new Map(newHeights);
      }
    },
    []
  );

  // Measure message heights for more accurate virtualization
  const measureMessage = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      measurementRefs.current.set(messageId, element);
      const height = element.offsetHeight;
      
      // Only update state if height has changed significantly
      const lastHeight = lastMeasurements.current.get(messageId);
      const heightDiff = lastHeight ? Math.abs(height - lastHeight) : Infinity;
      
      // Only update if height has changed by more than 2 pixels
      if (heightDiff > 2) {
        const newHeights = new Map(measuredHeights);
        newHeights.set(messageId, height);
        debouncedSetHeights(newHeights);
      }
    }
  }, [measuredHeights, debouncedSetHeights]);

  // Calculate virtual items with actual measured heights when available
  const virtualItems = useMemo((): VirtualMessageItem[] => {
    let currentTop = VIRTUAL_CONFIG.CONTAINER_PADDING;
    
    return messages.map((message, index) => {
      const measuredHeight = measuredHeights.get(message.id);
      // Increase estimated height for long messages
      const contentLength = message.content.length;
      const estimatedHeight = contentLength > CONTENT_CONFIG.EXPAND_THRESHOLD 
        ? Math.min(800, Math.max(VIRTUAL_CONFIG.ESTIMATED_MESSAGE_HEIGHT, contentLength / 10))
        : VIRTUAL_CONFIG.ESTIMATED_MESSAGE_HEIGHT;
      
      const height = measuredHeight || estimatedHeight;
      
      const item: VirtualMessageItem = {
        message,
        index,
        top: currentTop,
        height,
        isVisible: false
      };
      
      currentTop += height + 20; // 20px gap between messages
      return item;
    });
  }, [messages, measuredHeights]);

  // Calculate total height for scrollbar
  const totalHeight = virtualItems.length > 0 
    ? virtualItems[virtualItems.length - 1].top + virtualItems[virtualItems.length - 1].height + VIRTUAL_CONFIG.CONTAINER_PADDING
    : VIRTUAL_CONFIG.CONTAINER_PADDING * 2;

  // Determine which messages are visible
  const visibleItems = useMemo(() => {
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + containerHeight;
    
    return virtualItems.filter(item => {
      const itemBottom = item.top + item.height;
      return itemBottom >= visibleTop - (VIRTUAL_CONFIG.BUFFER_SIZE * VIRTUAL_CONFIG.ESTIMATED_MESSAGE_HEIGHT) &&
             item.top <= visibleBottom + (VIRTUAL_CONFIG.BUFFER_SIZE * VIRTUAL_CONFIG.ESTIMATED_MESSAGE_HEIGHT);
    });
  }, [virtualItems, scrollTop, containerHeight]);

  // Message action handlers
  const handleCopyMessage = useCallback((content: string) => {
    onMessageAction('copy', '', content);
  }, [onMessageAction]);

  const handleRetryMessage = useCallback((messageId: string) => {
    onMessageAction('retry', messageId);
  }, [onMessageAction]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    onMessageAction('edit', messageId, newContent);
  }, [onMessageAction]);

  return (
    <div style={{ height: totalHeight, position: 'relative' }}>
      {visibleItems.map(({ message, top, height }) => (
        <div
          key={message.id}
          style={{
            position: 'absolute',
            top: top,
            left: 0,
            right: 0,
            minHeight: height
          }}
          ref={(el) => measureMessage(message.id, el)}
        >
          <div className="mb-5">
            <ClaraMessageBubble
              message={message}
              userName={userName}
              isEditable={message.role === 'user'}
              onCopy={handleCopyMessage}
              onRetry={handleRetryMessage}
              onEdit={handleEditMessage}
            />
          </div>
        </div>
      ))}
      
      {/* Messages end marker */}
      <div 
        ref={messagesEndRef}
        style={{
          position: 'absolute',
          top: totalHeight - VIRTUAL_CONFIG.CONTAINER_PADDING,
          height: 1,
          width: '100%'
        }}
      />
    </div>
  );
};

/**
 * Industry-Standard Auto-Scroll Engine (ChatGPT/Claude Style)
 * Uses direct scrollTop manipulation for instant, natural scrolling
 * Bottom-pins during streaming for seamless experience
 */
class SmoothAutoScroller {
  private container: HTMLElement | null = null;
  private target: HTMLElement | null = null;
  private isUserScrolling = false;
  private userScrollTimeout: NodeJS.Timeout | null = null;
  private lastScrollHeight = 0;
  private rafId: number | null = null;
  private wasAtBottomWhenStreamStarted = false; // Track if user was at bottom when streaming started
  private scrollHandler: ((e: Event) => void) | null = null;

  constructor(container: HTMLElement | null, target: HTMLElement | null) {
    this.container = container;
    this.target = target;
    this.setupScrollListener();
  }

  updateRefs(container: HTMLElement | null, target: HTMLElement | null) {
    // Clean up old listener before updating
    this.removeScrollListener();

    this.container = container;
    this.target = target;
    this.setupScrollListener();
  }

  private setupScrollListener(): void {
    if (!this.container) return;

    // Detect when user manually scrolls
    this.scrollHandler = () => {
      const isAtBottom = this.isNearBottom();

      if (!isAtBottom) {
        // User has scrolled away from bottom - IMMEDIATELY respect their position
        // Set flag synchronously (no debounce) to prevent race conditions with streaming updates
        this.isUserScrolling = true;

        // If streaming is active, remember they scrolled away
        if (this.wasAtBottomWhenStreamStarted) {
          // User was following along but now scrolled up - stop auto-scroll
          this.wasAtBottomWhenStreamStarted = false;
        }

        // Clear existing timeout
        if (this.userScrollTimeout) {
          clearTimeout(this.userScrollTimeout);
          this.userScrollTimeout = null;
        }

        // Don't auto-reset - keep user in control until they scroll back to bottom
        // This prevents forced scrolling when user is reading older content
      } else {
        // User is at bottom - allow auto-scroll again
        this.isUserScrolling = false;

        // Clear timeout since we're at bottom
        if (this.userScrollTimeout) {
          clearTimeout(this.userScrollTimeout);
          this.userScrollTimeout = null;
        }
      }
    };

    this.container.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private removeScrollListener(): void {
    if (this.container && this.scrollHandler) {
      this.container.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  private isNearBottom(): boolean {
    if (!this.container) return false;
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    return scrollHeight - scrollTop - clientHeight < SCROLL_CONFIG.SCROLL_THRESHOLD;
  }

  /**
   * Instant scroll to bottom (ChatGPT/Claude style)
   * No animation, just direct position update
   */
  private scrollToBottomInstant(): void {
    if (!this.container) return;

    // Cancel any pending RAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    // Use RAF to sync with browser paint cycle for smoothness
    this.rafId = requestAnimationFrame(() => {
      if (!this.container) return;

      const scrollHeight = this.container.scrollHeight;
      const clientHeight = this.container.clientHeight;

      // Direct scrollTop manipulation - instant and natural
      this.container.scrollTop = scrollHeight - clientHeight;

      this.lastScrollHeight = scrollHeight;
      this.rafId = null;
    });
  }

  /**
   * For new messages - instant scroll to bottom
   */
  scrollToNewMessage(): void {
    // Don't interrupt if user is actively scrolling
    if (this.isUserScrolling) return;

    // Only scroll if user is near bottom
    if (!this.isNearBottom()) return;

    this.scrollToBottomInstant();
  }

  /**
   * For streaming content - instant bottom-pinning (industry standard)
   * This is how ChatGPT/Claude keep you locked to bottom during streaming
   */
  startStreamingScroll(): void {
    // Check if this is the first call for this streaming session
    // If so, record whether user is at bottom
    if (!this.wasAtBottomWhenStreamStarted) {
      this.wasAtBottomWhenStreamStarted = this.isNearBottom();
    }

    // Don't scroll if user has scrolled away during streaming
    if (this.isUserScrolling) return;

    // Only auto-scroll if user was at bottom when streaming started
    // This prevents forcing scroll when user is reading older messages
    if (!this.wasAtBottomWhenStreamStarted) return;

    // Instant scroll - will be called on every content update
    this.scrollToBottomInstant();
  }

  stopStreamingScroll(): void {
    // No intervals to stop in the new approach
    // Just cancel any pending RAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Reset the flag for the next streaming session
    this.wasAtBottomWhenStreamStarted = false;
  }

  /**
   * Force scroll to bottom (for button click)
   * Even if user scrolled away, bring them back
   */
  forceScrollToBottom(): void {
    this.isUserScrolling = false; // Override user scroll state
    this.wasAtBottomWhenStreamStarted = true; // Re-enable auto-scroll for streaming
    this.scrollToBottomInstant();
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.stopStreamingScroll();
    this.removeScrollListener();

    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }
}

/**
 * Welcome screen component displayed when there are no messages
 */
const WelcomeScreen: React.FC<{
  userName?: string;
  onStartChat?: () => void;
  onSendExamplePrompt?: (prompt: string) => void;
}> = ({ userName, onStartChat, onSendExamplePrompt }) => {
  // Random example selection
  const getRandomExample = (examples: string[]) => {
    return examples[Math.floor(Math.random() * examples.length)];
  };

  const allSuggestions = [
    {
      icon: FileText,
      title: "Analyze Documents",
      description: "Upload PDFs, docs, or text files for analysis",
      examples: [
        "Summarize the main points from this document",
        "Extract key information and create a table",
        "What are the action items in this file?"
      ],
      mode: "chat" as const
    },
    {
      icon: Brain,
      title: "Clara Remembers",
      description: "I remember our conversations and your preferences",
      examples: [
        "What do you know about me?",
        "What have we discussed before?",
        "What are my preferences?"
      ],
      mode: "chat" as const
    },
    {
      icon: Code,
      title: "Code Assistance",
      description: "Get help with programming and debugging",
      examples: [
        "Make a page in HTML that shows an animation of a ball bouncing in a rotating hypercube",
        "Help me generate an SVG of 5 Pokémons, include details",
        "How many 'r's are in the word 'strawberry'? Make a cute little card!",
        "I want a TODO list that allows me to add tasks, delete tasks, and I would like the overall color theme to be purple"
      ],
      mode: "chat" as const
    },
    {
      icon: Search,
      title: "Research & Analysis",
      description: "Deep research with web search (Agent Mode)",
      examples: [
        "Search about ClaraVerse on the web",
        "Research the latest AI developments",
        "Find information about quantum computing trends"
      ],
      mode: "agent" as const
    }
  ];

  // Select random examples for each suggestion
  const suggestions = React.useMemo(() =>
    allSuggestions.map(suggestion => ({
      ...suggestion,
      example: getRandomExample(suggestion.examples)
    })),
    [] // Only randomize once on mount
  );

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-2xl text-center">
        {/* Hero Section */}
        <div className="mb-8">
          

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Welcome{userName ? ` back, ${userName}` : ''} to Clara!
            <Sparkles className="inline-block w-6 h-6 ml-2 text-sakura-500" />
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
           Clara Can Help You With Anything - From Quick Answers to Deep Research
          </p>

        
        </div>

        {/* Suggestions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all hover:shadow-md group text-left"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
                  <suggestion.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                    {suggestion.title}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {suggestion.description}
                  </p>
                </div>
              </div>

              {/* Example prompt with mode badge */}
              <button
                onClick={() => onSendExamplePrompt?.(suggestion.example, suggestion.mode)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors border border-transparent hover:border-sakura-300 dark:hover:border-sakura-600 mt-2 group"
                title={suggestion.mode === 'agent' ? '🤖 Uses autonomous capabilities & web search' : '💬 Fast, direct conversation'}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 min-w-0">Try: "{suggestion.example}"</span>
                  <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    suggestion.mode === 'agent'
                      ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                      : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  }`}>
                    {suggestion.mode === 'agent' ? '🤖 Agent' : '💬 Chat'}
                  </span>
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Mode explanation */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Understanding Modes - Which One to Use? 
          </h4>
          <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-bold">💬 Chat Mode:</span>
              <span>Quick responses, document analysis, code help, conversations</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">🤖 Agent Mode:</span>
              <span>Deep research, web search, multi-step tasks, autonomous problem solving</span>
            </div>
            {/* how to toggle between modes */}
            <div className="flex items-start gap-2">
              <span className="text-gray-600 dark:text-gray-400">🔄 Toggle Modes:</span>
              <span>Click the mode button to switch between Chat and Agent modes or Ctrl+M</span>
            </div>
          </div>
        </div>

        {/* Quick start tips */}
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <p className="mb-2">
            💡 <strong>Pro tip:</strong> You can drag and drop files directly into the chat!
          </p>
          <p>
            🔄 Clara automatically detects file types and uses the best AI models for each task.
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Loading screen component displayed when Clara is initializing
 */
const LoadingScreen: React.FC<{
  userName?: string;
}> = ({ userName }) => {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-md text-center">
        {/* Loading Animation */}
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 via-pink-500 to-sakura-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse">
          <Bot className="w-10 h-10 text-white" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Initializing Clara... (Updating Backend & Loading Models)
        </h2>
        
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {userName ? `Welcome back, ${userName}! ` : ''}
          Loading and Updating Backend & Loading Models...
        </p>

        {/* Loading Steps */}
        <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-sakura-500 rounded-full animate-bounce"></div>
            <span>Loading chat sessions...</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <span>Initializing AI models...</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <span>Preparing workspace...</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div className="bg-gradient-to-r from-purple-500 to-sakura-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
        </div>
      </div>
    </div>
  );
};

/**
 * Scroll to bottom button component
 */
const ScrollToBottomButton: React.FC<{
  onClick: () => void;
  show: boolean;
}> = ({ onClick, show }) => {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      style={{ position: 'fixed', top: '6rem', right: '22rem', zIndex: 50 }}
      className="bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg hover:shadow-xl transition-all hover:scale-105 group"
    >
      <ArrowDown className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-sakura-600 dark:group-hover:text-sakura-400" />
    </button>
  );
};

/**
 * Processing indicator component
 */
const ProcessingIndicator: React.FC<{
  processingState: ClaraProcessingState;
  message?: string;
}> = ({ processingState, message }) => {
  const getIndicatorContent = () => {
    switch (processingState) {
      case 'processing':
        return {
          icon: <Loader2 className="w-5 h-5 animate-spin" />,
          text: message || 'Clara is thinking...',
          bgColor: 'bg-blue-500'
        };
      case 'success':
        return {
          icon: <Bot className="w-5 h-5" />,
          text: 'Response generated!',
          bgColor: 'bg-green-500'
        };
      case 'error':
        return {
          icon: <Bot className="w-5 h-5" />,
          text: message || 'Something went wrong',
          bgColor: 'bg-red-500'
        };
      default:
        return null;
    }
  };

  const content = getIndicatorContent();
  if (!content) return null;

  return (
    <div className="flex justify-center mb-4">
      <div className={`flex items-center gap-2 px-4 py-2 ${content.bgColor} text-white rounded-full text-sm`}>
        {content.icon}
        <span>{content.text}</span>
      </div>
    </div>
  );
};

/**
 * Main Clara Chat Window Component
 */
const ClaraChatWindow: React.FC<ClaraChatWindowProps> = ({
  messages,
  userName,
  isLoading = false,
  isInitializing = false,
  onRetryMessage,
  onCopyMessage,
  onEditMessage,
  onSendExamplePrompt
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [processingState, setProcessingState] = useState<ClaraProcessingState>('idle');
  
  // Virtual scrolling state
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Smooth auto-scroll engine
  const autoScrollerRef = useRef<SmoothAutoScroller | null>(null);

  // Initialize auto-scroller
  useEffect(() => {
    autoScrollerRef.current = new SmoothAutoScroller(scrollRef.current, messagesEndRef.current);
    
    return () => {
      autoScrollerRef.current?.destroy();
    };
  }, []);

  // Update auto-scroller refs when elements change
  useEffect(() => {
    autoScrollerRef.current?.updateRefs(scrollRef.current, messagesEndRef.current);
  }, [scrollRef.current, messagesEndRef.current]);

  // Update container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (scrollRef.current) {
        setContainerHeight(scrollRef.current.clientHeight);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Handle scroll events with debouncing for performance
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const element = scrollRef.current;
    const newScrollTop = element.scrollTop;
    const { scrollHeight, clientHeight } = element;
    const nearBottom = scrollHeight - newScrollTop - clientHeight < SCROLL_CONFIG.SCROLL_THRESHOLD;
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce scroll state updates for performance
    scrollTimeoutRef.current = setTimeout(() => {
      setScrollTop(newScrollTop);
      setIsNearBottom(nearBottom);
      setShowScrollButton(!nearBottom && messages.length > 0);
    }, VIRTUAL_CONFIG.SCROLL_DEBOUNCE);
  }, [messages.length]);

  // Set up scroll listener
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        scrollElement.removeEventListener('scroll', handleScroll);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }
  }, [handleScroll]);

  // Industry-standard auto-scroll: scroll on EVERY content update (ChatGPT/Claude style)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    const isStreaming = lastMessage?.metadata?.isStreaming;

    if (isStreaming) {
      // Instant bottom-pin on every streaming update (no intervals!)
      // This is called on EVERY token/chunk, creating seamless scrolling
      autoScrollerRef.current?.startStreamingScroll();
    } else {
      // Stop streaming and do final scroll to new message
      autoScrollerRef.current?.stopStreamingScroll();
      autoScrollerRef.current?.scrollToNewMessage();
    }
  }, [messages.length, messages[messages.length - 1]?.content]); // Triggers on EVERY content change

  // Update processing state based on loading and messages
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    if (isLoading) {
      setProcessingState('processing');
    } else {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.metadata?.error) {
        setProcessingState('error');
        timeoutId = setTimeout(() => setProcessingState('idle'), 3000);
      } else if (lastMessage && lastMessage.role === 'assistant') {
        setProcessingState('success');
        timeoutId = setTimeout(() => setProcessingState('idle'), 2000);
      } else {
        setProcessingState('idle');
      }
    }

    // Cleanup timeout on dependency change
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoading, messages.length, messages[messages.length - 1]?.metadata?.error]);

  // Handle message actions
  const handleMessageAction = useCallback((action: string, messageId: string, data?: any) => {
    switch (action) {
      case 'copy':
        onCopyMessage?.(data);
        break;
      case 'retry':
        onRetryMessage?.(messageId);
        break;
      case 'edit':
        onEditMessage?.(messageId, data);
        break;
    }
  }, [onCopyMessage, onRetryMessage, onEditMessage]);

  // Force scroll to bottom
  const forceScrollToBottom = useCallback(() => {
    autoScrollerRef.current?.forceScrollToBottom();
  }, []);

  // Performance optimization: Use a threshold to decide between virtual and normal rendering
  const shouldUseVirtualization = messages.length > 50; // Use virtualization for 50+ messages

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6 relative"
      style={{ scrollBehavior: 'auto' }} // No smooth scrolling - instant updates like ChatGPT/Claude
    >
      <div className="max-w-4xl mx-auto">
        {/* Loading screen when Clara is initializing */}
        {isInitializing ? (
          <LoadingScreen userName={userName} />
        ) : /* Welcome screen when no messages */ messages.length === 0 ? (
          <WelcomeScreen userName={userName} onSendExamplePrompt={onSendExamplePrompt} />
        ) : shouldUseVirtualization ? (
          // Use virtualized rendering for large message lists
          <VirtualizedMessageList
            messages={messages}
            userName={userName}
            containerHeight={containerHeight}
            scrollTop={scrollTop}
            onMessageAction={handleMessageAction}
            messagesEndRef={messagesEndRef}
          />
        ) : (
          // Use normal rendering for smaller message lists
          <div className="space-y-5">
            {/* Message list */}
            {messages.map((message) => (
              <ClaraMessageBubble
                key={message.id}
                message={message}
                userName={userName}
                isEditable={message.role === 'user'}
                onCopy={(content) => handleMessageAction('copy', '', content)}
                onRetry={(messageId) => handleMessageAction('retry', messageId)}
                onEdit={(messageId, newContent) => handleMessageAction('edit', messageId, newContent)}
              />
            ))}
            
            {/* Processing indicator */}
            <ProcessingIndicator 
              processingState={processingState}
              message={
                processingState === 'processing' 
                  ? '' 
                  : undefined
              }
            />
            
            {/* Invisible element to track end of messages */}
            <div ref={messagesEndRef} />
          </div>
        )}
        
        {/* Processing indicator for virtualized view */}
        {shouldUseVirtualization && (
          <div style={{ position: 'relative', zIndex: 1 }}>
            <ProcessingIndicator 
              processingState={processingState}
              message={
                processingState === 'processing' 
                  ? '' 
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <ScrollToBottomButton 
        show={showScrollButton}
        onClick={forceScrollToBottom}
      />
    </div>
  );
};

export default ClaraChatWindow; 