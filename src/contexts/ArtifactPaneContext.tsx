/**
 * Artifact Pane Context
 *
 * Global state management for the Claude-style artifact pane.
 * Manages artifact visibility, current artifacts, and pane state across the app.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ClaraArtifact } from '../types/clara_assistant_types';

interface ArtifactPaneContextType {
  // State
  isOpen: boolean;
  artifacts: ClaraArtifact[];
  currentMessageId: string | null;

  // Actions
  openArtifactPane: (artifacts: ClaraArtifact[], messageId: string) => void;
  closeArtifactPane: () => void;
  addArtifact: (artifact: ClaraArtifact, messageId: string) => void;
  clearArtifacts: () => void;
  setArtifacts: (artifacts: ClaraArtifact[], messageId: string) => void;
}

const ArtifactPaneContext = createContext<ArtifactPaneContextType | undefined>(undefined);

export const useArtifactPane = () => {
  const context = useContext(ArtifactPaneContext);
  if (!context) {
    throw new Error('useArtifactPane must be used within ArtifactPaneProvider');
  }
  return context;
};

interface ArtifactPaneProviderProps {
  children: ReactNode;
}

export const ArtifactPaneProvider: React.FC<ArtifactPaneProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [artifacts, setArtifactsState] = useState<ClaraArtifact[]>([]);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

  const openArtifactPane = useCallback((newArtifacts: ClaraArtifact[], messageId: string) => {
    setArtifactsState(newArtifacts);
    setCurrentMessageId(messageId);
    setIsOpen(true);
  }, []);

  const closeArtifactPane = useCallback(() => {
    setIsOpen(false);
    // Keep artifacts for a moment in case user wants to reopen
    setTimeout(() => {
      if (!isOpen) {
        setArtifactsState([]);
        setCurrentMessageId(null);
      }
    }, 300);
  }, [isOpen]);

  const addArtifact = useCallback((artifact: ClaraArtifact, messageId: string) => {
    setArtifactsState((prev) => {
      // Avoid duplicates
      if (prev.some((a) => a.id === artifact.id)) {
        return prev;
      }
      return [...prev, artifact];
    });
    setCurrentMessageId(messageId);
    setIsOpen(true);
  }, []);

  const clearArtifacts = useCallback(() => {
    setArtifactsState([]);
    setCurrentMessageId(null);
    setIsOpen(false);
  }, []);

  const setArtifacts = useCallback((newArtifacts: ClaraArtifact[], messageId: string) => {
    setArtifactsState(newArtifacts);
    setCurrentMessageId(messageId);
  }, []);

  const value: ArtifactPaneContextType = {
    isOpen,
    artifacts,
    currentMessageId,
    openArtifactPane,
    closeArtifactPane,
    addArtifact,
    clearArtifacts,
    setArtifacts,
  };

  return (
    <ArtifactPaneContext.Provider value={value}>
      {children}
    </ArtifactPaneContext.Provider>
  );
};
