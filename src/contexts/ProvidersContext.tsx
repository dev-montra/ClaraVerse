import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db, Provider } from '../db';
import { ProviderConfig } from '../services/claraNotebookService';

interface ProvidersContextType {
  providers: Provider[];
  primaryProvider: Provider | null;
  loading: boolean;
  addProvider: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setPrimaryProvider: (id: string) => Promise<void>;
  refreshProviders: () => Promise<void>;
  // Notebook service helpers
  getNotebookCompatibleProviders: () => Provider[];
  convertProviderToConfig: (provider: Provider) => ProviderConfig;
}

const ProvidersContext = createContext<ProvidersContextType | undefined>(undefined);

export const useProviders = () => {
  const context = useContext(ProvidersContext);
  if (context === undefined) {
    throw new Error('useProviders must be used within a ProvidersProvider');
  }
  return context;
};

interface ProvidersProviderProps {
  children: ReactNode;
}

export const ProvidersProvider: React.FC<ProvidersProviderProps> = ({ children }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [primaryProvider, setPrimaryProviderState] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProviders = async () => {
    try {
      setLoading(true);
      const allProviders = await db.getAllProviders();
      setProviders(allProviders);
      
      const primary = await db.getPrimaryProvider();
      setPrimaryProviderState(primary);
    } catch (error) {
      console.error('Error refreshing providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const addProvider = async (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const id = await db.addProvider(provider);
      await refreshProviders();
      return id;
    } catch (error) {
      console.error('Error adding provider:', error);
      // Re-throw the error so the UI can handle it
      throw error;
    }
  };

  const updateProvider = async (id: string, updates: Partial<Provider>) => {
    await db.updateProvider(id, updates);
    await refreshProviders();
  };

  const deleteProvider = async (id: string) => {
    await db.deleteProvider(id);
    await refreshProviders();
  };

  const setPrimaryProvider = async (id: string) => {
    await db.setPrimaryProvider(id);
    await refreshProviders();
  };

  useEffect(() => {
    const initializeProviders = async () => {
      await db.initializeDefaultProviders();
      await refreshProviders();
    };

    initializeProviders();
  }, []);

  const getNotebookCompatibleProviders = () => {
    return providers.filter(provider => 
      provider.isEnabled && 
      ['openai', 'openai_compatible', 'ollama'].includes(provider.type)
    );
  };

  const convertProviderToConfig = (provider: Provider): ProviderConfig => {
    // Auto-detect provider type based on baseUrl for non-ollama providers
    let providerType = provider.type as 'openai' | 'openai_compatible' | 'ollama';
    
    if (provider.type !== 'ollama' && provider.type !== 'claras-pocket') {
      // Check if baseUrl is official OpenAI API
      if (provider.baseUrl === 'https://api.openai.com/v1' || provider.baseUrl === 'https://api.openai.com') {
        providerType = 'openai';
      } else {
        providerType = 'openai_compatible';
      }
    }
    
    return {
      name: provider.name,
      type: providerType,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: getDefaultModelForProvider(providerType),
    };
  };

  const getDefaultModelForProvider = (type: string): string => {
    switch (type) {
      case 'openai':
        return 'gpt-4o-mini';
      case 'openai_compatible':
        return 'anthropic/claude-3.5-sonnet';
      case 'ollama':
        return 'llama3.2:3b';
      default:
        return 'gpt-4o-mini';
    }
  };

  const value: ProvidersContextType = {
    providers,
    primaryProvider,
    loading,
    addProvider,
    updateProvider,
    deleteProvider,
    setPrimaryProvider,
    refreshProviders,
    getNotebookCompatibleProviders,
    convertProviderToConfig
  };

  return (
    <ProvidersContext.Provider value={value}>
      {children}
    </ProvidersContext.Provider>
  );
}; 