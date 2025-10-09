import React, { useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Maximize2, Minimize2 } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebContainer } from '@webcontainer/api';
import '@xterm/xterm/css/xterm.css';

interface TerminalComponentProps {
  webContainer: WebContainer | null;
  isVisible: boolean;
  onToggle: () => void;
  terminalRef: React.MutableRefObject<Terminal | null>;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ 
  isVisible, 
  onToggle, 
  terminalRef 
}) => {
  const terminalElementRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (terminalElementRef.current && !terminalRef.current) {
      // Wait for the DOM element to have dimensions before initializing
      const element = terminalElementRef.current;

      // Check if element has dimensions
      const hasValidDimensions = () => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const initializeTerminal = () => {
        if (!hasValidDimensions()) {
          // Element not ready, wait and retry
          const retryTimeout = setTimeout(initializeTerminal, 50);
          return () => clearTimeout(retryTimeout);
        }

        try {
          // Initialize terminal
          const terminal = new Terminal({
            theme: {
              background: '#1e1e1e',
              foreground: '#cccccc',
              cursor: '#ffffff',
            },
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            cursorBlink: true,
            convertEol: true,
          });

          const fitAddon = new FitAddon();
          const webLinksAddon = new WebLinksAddon();

          terminal.loadAddon(fitAddon);
          terminal.loadAddon(webLinksAddon);

          terminal.open(element);

          // Wait a frame before fitting to ensure layout is complete
          requestAnimationFrame(() => {
            try {
              fitAddon.fit();
            } catch (error) {
              console.warn('Terminal fit failed on initialization, will retry:', error);
              // Retry fit after a short delay
              setTimeout(() => {
                try {
                  fitAddon.fit();
                } catch (retryError) {
                  console.warn('Terminal fit retry failed:', retryError);
                }
              }, 100);
            }
          });

          terminalRef.current = terminal;
          fitAddonRef.current = fitAddon;

          // Add some initial text
          terminal.writeln('\x1b[32m🚀 Lumaui Terminal Ready\x1b[0m');
          terminal.writeln('WebContainer processes will appear here when you start a project...\n');
        } catch (error) {
          console.error('Failed to initialize terminal:', error);
        }
      };

      initializeTerminal();
    } else if (terminalElementRef.current && terminalRef.current) {
      // Terminal exists but component was remounted (switching modes)
      // ALWAYS reattach - don't check if already attached
      try {
        const element = terminalElementRef.current;
        const terminal = terminalRef.current;

        console.log('Terminal instance exists, reattaching to DOM...');

        // Recreate fitAddon since we're reattaching
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;

        // Reattach terminal to DOM element
        terminal.open(element);

        // Fit after reattachment with multiple attempts
        const attemptFit = (attempts = 0) => {
          if (attempts > 3) return;

          setTimeout(() => {
            try {
              const rect = element.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                fitAddon.fit();
                console.log('✅ Terminal reattached and fitted successfully');
              } else {
                console.log('Element not ready, retrying fit...');
                attemptFit(attempts + 1);
              }
            } catch (e) {
              console.warn('Fit error, retrying...:', e);
              attemptFit(attempts + 1);
            }
          }, 50 * (attempts + 1));
        };

        attemptFit();
      } catch (error) {
        console.error('Error reattaching terminal:', error);
      }
    }

    // DON'T dispose terminal on unmount to persist output across project switches
    // Terminal will be cleaned up when component is fully removed from DOM
    return () => {
      // Only clear fitAddon reference, keep terminal alive
      if (fitAddonRef.current) {
        fitAddonRef.current = null;
      }
    };
  }, [terminalRef]);

  useEffect(() => {
    if (fitAddonRef.current && isVisible && terminalElementRef.current) {
      // Fit terminal when visibility changes or container resizes
      const fitTerminal = () => {
        try {
          // Check if element has valid dimensions before fitting
          const element = terminalElementRef.current;
          if (element) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              fitAddonRef.current?.fit();
            }
          }
        } catch (error) {
          // Silently ignore fit errors - they're not critical
          console.debug('Terminal fit error (non-critical):', error);
        }
      };
      
      // Initial fit with delay to ensure layout is complete
      const initialFitTimeout = setTimeout(fitTerminal, 100);
      
      // Add resize observer to handle container size changes
      const resizeObserver = new ResizeObserver(() => {
        // Debounce resize events
        setTimeout(fitTerminal, 50);
      });
      
      if (terminalElementRef.current) {
        resizeObserver.observe(terminalElementRef.current);
      }
      
      return () => {
        clearTimeout(initialFitTimeout);
        resizeObserver.disconnect();
      };
    }
  }, [isVisible]);

  if (!isVisible) {
    return (
      <div className="h-8 border-t border-gray-200 dark:border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between px-3 py-1 h-full">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-300">Terminal</span>
          </div>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <Maximize2 className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full border-t border-gray-200 dark:border-gray-700 bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-600 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-green-400" />
          <span className="text-sm text-gray-300">Terminal</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <Minimize2 className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div 
        ref={terminalElementRef} 
        className="flex-1 p-2"
      />
    </div>
  );
};

export default TerminalComponent; 