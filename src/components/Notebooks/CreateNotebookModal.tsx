import React, { useState, useEffect } from 'react';
import { X, BookOpen, AlertCircle, Bot, ChevronDown, Tags, Plus, Minus } from 'lucide-react';
import { useProviders } from '../../contexts/ProvidersContext';
import { claraApiService } from '../../services/claraApiService';
import { ClaraModel } from '../../types/clara_assistant_types';
import { ProviderConfig, claraNotebookService, EntityTypesResponse } from '../../services/claraNotebookService';

// Utility to check if a provider configuration uses Clara Core
const usesClaraCore = (providerId: string, providers: any[]): boolean => {
  const provider = providers.find(p => p.id === providerId);
  if (!provider) return false;
  
  return provider.type === 'claras-pocket' || 
         provider.name?.toLowerCase().includes('clara') ||
         provider.name?.toLowerCase().includes('pocket') ||
         provider.baseUrl?.includes('localhost');
};

interface CreateNotebookModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, llmProvider: ProviderConfig, embeddingProvider: ProviderConfig, entityTypes?: string[], language?: string, manualEmbeddingDimensions?: number, manualEmbeddingMaxTokens?: number) => Promise<void>;
}

const CreateNotebookModal: React.FC<CreateNotebookModalProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; description?: string; providers?: string; api?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Provider selection state
  const { providers } = useProviders();
  const [models, setModels] = useState<ClaraModel[]>([]);
  const [selectedLLMProvider, setSelectedLLMProvider] = useState<string>('');
  const [selectedLLMModel, setSelectedLLMModel] = useState<string>('');
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useState<string>('');
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Entity types and language state
  const [entityTypesData, setEntityTypesData] = useState<EntityTypesResponse | null>(null);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<string[]>([]);
  const [customEntityType, setCustomEntityType] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [showEntityTypes, setShowEntityTypes] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Embedding dimension validation state
  const [embeddingValidation, setEmbeddingValidation] = useState<{
    dimensions?: number;
    max_tokens?: number;
    confidence?: number;
    detected_pattern?: string;
    warning?: string;
    override_options?: Array<{ dimensions: number; max_tokens: number; label: string }>;
  } | null>(null);
  const [isValidatingEmbedding, setIsValidatingEmbedding] = useState(false);
  const [manualDimensions, setManualDimensions] = useState<number | null>(null);
  const [manualMaxTokens, setManualMaxTokens] = useState<number | null>(null);
  const [showDimensionOverride, setShowDimensionOverride] = useState(false);

  // Load models and set default providers
  useEffect(() => {
    const loadModelsAndDefaults = async () => {
      setIsLoadingModels(true);
      try {
        // Load all models
        const allModels = await claraApiService.getModels();
        setModels(allModels);

        // Set default providers (use primary provider if available)
        const enabledProviders = providers.filter(p => p.isEnabled);
        const primaryProvider = providers.find(p => p.isPrimary && p.isEnabled) || enabledProviders[0];
        
        if (primaryProvider) {
          setSelectedLLMProvider(primaryProvider.id);
          setSelectedEmbeddingProvider(primaryProvider.id);
          
          // Set default models for the primary provider
          const providerModels = allModels.filter(m => m.provider === primaryProvider.id);
          
          // Find a good text/multimodal model for LLM
          const llmModel = providerModels.find(m => 
            m.type === 'text' || m.type === 'multimodal'
          );
          if (llmModel) setSelectedLLMModel(llmModel.id);
          
          // Find an embedding model, or fallback to text model
          const embeddingModel = providerModels.find(m => m.type === 'embedding') || 
                                 providerModels.find(m => m.type === 'text');
          if (embeddingModel) setSelectedEmbeddingModel(embeddingModel.id);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };

    if (providers.length > 0) {
      loadModelsAndDefaults();
    }
  }, [providers]);

  // Load entity types
  useEffect(() => {
    const loadEntityTypes = async () => {
      try {
        if (claraNotebookService.isBackendHealthy()) {
          const entityData = await claraNotebookService.getEntityTypes();
          setEntityTypesData(entityData);
          // Set default entity types from minimal set
          setSelectedEntityTypes(entityData.specialized_sets.minimal_set || []);
        }
      } catch (error) {
        console.error('Failed to load entity types:', error);
      }
    };

    loadEntityTypes();
  }, []);

  // Validate embedding dimensions when model changes
  useEffect(() => {
    const validateEmbeddingDimensions = async () => {
      if (!selectedEmbeddingModel) {
        setEmbeddingValidation(null);
        setShowDimensionOverride(false);
        return;
      }

      // Extract just the model name from the full model ID (format: provider-id:model-name)
      const modelName = selectedEmbeddingModel.includes(':') 
        ? selectedEmbeddingModel.split(':')[1] 
        : selectedEmbeddingModel;

      setIsValidatingEmbedding(true);
      try {
        const response = await fetch(
          `http://localhost:5001/notebooks/validate-embedding-dimensions?model_name=${encodeURIComponent(modelName)}${
            manualDimensions ? `&manual_dimensions=${manualDimensions}` : ''
          }${
            manualMaxTokens ? `&manual_max_tokens=${manualMaxTokens}` : ''
          }`
        );

        if (response.ok) {
          const data = await response.json();
          setEmbeddingValidation({
            dimensions: data.specifications.dimensions,
            max_tokens: data.specifications.max_tokens,
            confidence: data.specifications.confidence,
            detected_pattern: data.specifications.detected_pattern,
            warning: data.warning,
            override_options: data.specifications.override_options
          });

          // Show override UI if confidence is low
          if (data.specifications.confidence < 0.8 && !manualDimensions) {
            setShowDimensionOverride(true);
          }
        }
      } catch (error) {
        console.error('Failed to validate embedding dimensions:', error);
      } finally {
        setIsValidatingEmbedding(false);
      }
    };

    validateEmbeddingDimensions();
  }, [selectedEmbeddingModel, manualDimensions, manualMaxTokens]);

  const validateForm = () => {
    const newErrors: { name?: string; description?: string; providers?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    
    if (description.trim().length > 200) {
      newErrors.description = 'Description must be less than 200 characters';
    }

    if (!selectedLLMProvider || !selectedLLMModel) {
      newErrors.providers = 'Please select an LLM provider and model';
    }

    if (!selectedEmbeddingProvider || !selectedEmbeddingModel) {
      newErrors.providers = 'Please select an embedding provider and model';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Helper function to transform URLs for Docker container access
  const transformUrlForDocker = (url: string): string => {
    if (!url) return url;
    
    try {
      const urlObj = new URL(url);
      
      // Replace localhost with host.docker.internal for Docker container access
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        urlObj.hostname = 'host.docker.internal';
      }
      
      // Remove /v1 suffix if port is 11434 (Ollama default port)
      if (urlObj.port === '11434' && urlObj.pathname.endsWith('/v1')) {
        urlObj.pathname = urlObj.pathname.replace(/\/v1$/, '');
      }
      
      return urlObj.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      console.warn('Failed to parse URL for Docker transformation:', url, error);
      return url;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    setErrors({}); // Clear any previous API errors
    
    try {
      const llmProvider = providers.find(p => p.id === selectedLLMProvider);
      console.log('llmProvider', llmProvider);
      const embeddingProvider = providers.find(p => p.id === selectedEmbeddingProvider);
      const llmModel = models.find(m => m.id === selectedLLMModel);
      const embeddingModel = models.find(m => m.id === selectedEmbeddingModel);

      if (!llmProvider || !embeddingProvider || !llmModel || !embeddingModel) {
        throw new Error('Selected providers or models not found');
      }

      const llmProviderConfig: ProviderConfig = {
        name: llmProvider.name,
        type: llmProvider.type as 'openai' | 'openai_compatible' | 'ollama',
        baseUrl: llmProvider.baseUrl ? transformUrlForDocker(llmProvider.baseUrl) : llmProvider.baseUrl,
        apiKey: llmProvider.apiKey,
        model: llmModel.name
      };

      const embeddingProviderConfig: ProviderConfig = {
        name: embeddingProvider.name,
        type: embeddingProvider.type as 'openai' | 'openai_compatible' | 'ollama',
        baseUrl: embeddingProvider.baseUrl ? transformUrlForDocker(embeddingProvider.baseUrl) : embeddingProvider.baseUrl,
        apiKey: embeddingProvider.apiKey,
        model: embeddingModel.name
      };

      // CRITICAL: Validate models before creating notebook
      console.log('🔍 Validating models before notebook creation...');
      const validation = await claraNotebookService.validateModels({
        name: name.trim(),
        description: description.trim(),
        llm_provider: llmProviderConfig,
        embedding_provider: embeddingProviderConfig,
        entity_types: selectedEntityTypes.length > 0 ? selectedEntityTypes : undefined,
        language: selectedLanguage
      });

      console.log('✓ Validation results:', validation);

      // Check validation results
      if (validation.overall_status === 'failed' || validation.overall_status === 'error') {
        const errorMessages = [];
        if (!validation.llm_accessible && validation.llm_error) {
          errorMessages.push(`LLM Error: ${validation.llm_error}`);
        }
        if (!validation.embedding_accessible && validation.embedding_error) {
          errorMessages.push(`Embedding Error: ${validation.embedding_error}`);
        }
        
        throw new Error(
          `⚠️ Model Validation Failed\n\n${errorMessages.join('\n\n')}\n\n` +
          `Please check:\n` +
          `• Model names are correct\n` +
          `• API keys are valid\n` +
          `• Services are running (Clara Core / Ollama / OpenAI)\n` +
          `• Network connectivity\n\n` +
          `If you proceed, document processing will fail silently.`
        );
      }

      if (validation.overall_status === 'partial') {
        const partialMessage = [];
        if (!validation.llm_accessible) {
          partialMessage.push(`⚠️ LLM not accessible: ${validation.llm_error}`);
        }
        if (!validation.embedding_accessible) {
          partialMessage.push(`⚠️ Embedding not accessible: ${validation.embedding_error}`);
        }
        
        // Show warning but allow creation
        console.warn('Partial validation:', partialMessage.join(', '));
        if (!confirm(`${partialMessage.join('\n\n')}\n\nContinue anyway? Document processing may fail.`)) {
          setIsSubmitting(false);
          return;
        }
      }

      console.log('✓ Models validated successfully, creating notebook...');

      await onCreate(
        name.trim(), 
        description.trim(), 
        llmProviderConfig, 
        embeddingProviderConfig,
        selectedEntityTypes.length > 0 ? selectedEntityTypes : undefined,
        selectedLanguage,
        manualDimensions || undefined,
        manualMaxTokens || undefined
      );
      onClose();
    } catch (error) {
      console.error('Error creating notebook:', error);
      setErrors({ api: error instanceof Error ? error.message : 'Failed to create notebook' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Filter models by provider and type
  const getLLMModels = (providerId: string) => {
    return models.filter(m => 
      m.provider === providerId && 
      (m.type === 'text' || m.type === 'multimodal')
    );
  };

  const getEmbeddingModels = (providerId: string) => {
    // Comprehensive list of supported embedding models (verified against backend)
    const supportedEmbeddingModels = [
      // OpenAI Models
      'text-embedding-ada-002',
      'text-embedding-3-small', 
      'text-embedding-3-large',
      // MixedBread AI
      'mxbai-embed-large',
      // Nomic AI
      'nomic-embed',
      // Microsoft E5 Models
      'e5-large-v2',
      'e5-base-v2',
      'e5-small-v2',
      // Sentence Transformers - All-MiniLM
      'all-minilm-l6-v2',
      'all-minilm-l12-v2',
      'all-minilm',
      'all-mpnet-base-v2',
      // BAAI BGE Models (Beijing Academy AI)
      'bge-large',
      'bge-base',
      'bge-small',
      'bge-m3',
      // Qwen Models (Alibaba)
      'qwen',
      'qwen2',
      'qwen2.5-coder',
      'qwen3-embedding',
      // Jina AI Models
      'jina-embeddings-v2',
      'jina-embeddings',
      // Cohere Models
      'embed-english',
      'embed-multilingual',
      // Voyage AI
      'voyage-large-2',
      'voyage-code-2',
      'voyage-2',
      'voyage',
      // Snowflake Arctic Embed
      'snowflake-arctic-embed2',
      'snowflake-arctic-embed',
      // Google EmbeddingGemma
      'embeddinggemma',
      'embedding-gemma',
      // IBM Granite Embedding
      'granite-embedding',
      // Sentence-Transformers Paraphrase
      'paraphrase-multilingual',
      'paraphrase-mpnet',
      'paraphrase-albert',
      'paraphrase-minilm',
      // Sentence-T5
      'sentence-t5',
      // Alibaba GTE Models
      'gte-large',
      'gte-base',
      'gte-small',
      'gte-qwen',
      // UAE (Universal AnglE Embedding)
      'uae-large-v1',
      // Instructor Models
      'instructor-xl',
      'instructor-large',
      'instructor-base',
      // NVIDIA NV-Embed
      'nv-embed-v2',
      'nv-embed',
      // Stella Models
      'stella'
    ];

    return models.filter(m => {
      if (m.provider !== providerId) return false;
      
      // Check if it's explicitly marked as embedding type
      if (m.type === 'embedding') return true;
      
      // Check if the model name matches supported embedding models
      const modelNameLower = m.name.toLowerCase();
      return supportedEmbeddingModels.some(supported => 
        modelNameLower.includes(supported.toLowerCase())
      );
    });
  };

  // Entity type management functions
  const addEntityType = (entityType: string) => {
    if (entityType && !selectedEntityTypes.includes(entityType)) {
      setSelectedEntityTypes(prev => [...prev, entityType]);
    }
  };

  const removeEntityType = (entityType: string) => {
    setSelectedEntityTypes(prev => prev.filter(type => type !== entityType));
  };

  const addCustomEntityType = () => {
    if (customEntityType.trim()) {
      addEntityType(customEntityType.trim().toUpperCase());
      setCustomEntityType('');
    }
  };

  const addCategoryTypes = (category: string) => {
    if (entityTypesData?.categories[category]) {
      const categoryTypes = entityTypesData.categories[category];
      setSelectedEntityTypes(prev => {
        const newTypes = [...prev];
        categoryTypes.forEach(type => {
          if (!newTypes.includes(type)) {
            newTypes.push(type);
          }
        });
        return newTypes;
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-black rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-sakura-50 dark:bg-sakura-900/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sakura-500 rounded-lg text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Create New Notebook
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* API Error */}
          {errors.api && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300">{errors.api}</span>
              </div>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label htmlFor="notebook-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="notebook-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors(prev => ({ ...prev, name: undefined }));
                }
              }}
              placeholder="Enter notebook name..."
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors ${
                errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              autoFocus
            />
            {errors.name && (
              <div className="flex items-center gap-1 mt-1 text-sm text-red-600">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </div>
            )}
          </div>

          {/* Description Field */}
          <div>
            <label htmlFor="notebook-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              id="notebook-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) {
                  setErrors(prev => ({ ...prev, description: undefined }));
                }
              }}
              placeholder="Describe what this notebook will contain..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors resize-none ${
                errors.description ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.description ? (
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  {errors.description}
                </div>
              ) : (
                <div></div>
              )}
              <span className={`text-xs ${
                description.length > 180 ? 'text-red-500' : 'text-gray-500'
              }`}>
                {description.length}/200
              </span>
            </div>
          </div>

          {/* Provider Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Bot className="w-4 h-4" />
              AI Configuration
            </h3>

            {/* LLM Provider Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  LLM Provider <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedLLMProvider}
                    onChange={(e) => {
                      setSelectedLLMProvider(e.target.value);
                      setSelectedLLMModel(''); // Reset model selection
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none"
                  >
                    <option value="">Select Provider</option>
                    {providers.filter(p => p.isEnabled).map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  LLM Model <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedLLMModel}
                    onChange={(e) => {
                      setSelectedLLMModel(e.target.value);
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    disabled={!selectedLLMProvider || isLoadingModels}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none disabled:opacity-50"
                  >
                    <option value="">Select Model</option>
                    {selectedLLMProvider && getLLMModels(selectedLLMProvider).map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Embedding Provider Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Embedding Provider <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedEmbeddingProvider}
                    onChange={(e) => {
                      setSelectedEmbeddingProvider(e.target.value);
                      setSelectedEmbeddingModel(''); // Reset model selection
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none"
                  >
                    <option value="">Select Provider</option>
                    {providers.filter(p => p.isEnabled).map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Embedding Model <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedEmbeddingModel}
                    onChange={(e) => {
                      setSelectedEmbeddingModel(e.target.value);
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    disabled={!selectedEmbeddingProvider || isLoadingModels}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none disabled:opacity-50"
                  >
                    <option value="">Select Model</option>
                    {selectedEmbeddingProvider && getEmbeddingModels(selectedEmbeddingProvider).map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Embedding Dimension Validation */}
            {embeddingValidation && (() => {
              const confidence = embeddingValidation.confidence || 0;
              return (
              <div className={`rounded-lg p-3 border ${
                confidence >= 0.8 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : confidence >= 0.5
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-start gap-2 mb-2">
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                    confidence >= 0.8
                      ? 'bg-green-500'
                      : confidence >= 0.5
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}>
                    <span className="text-white text-xs font-bold">
                      {confidence >= 0.8 ? '✓' : '!'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h4 className={`text-sm font-medium ${
                      confidence >= 0.8
                        ? 'text-green-800 dark:text-green-200'
                        : confidence >= 0.5
                        ? 'text-yellow-800 dark:text-yellow-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      Embedding Model Detected
                      <span className="ml-2 text-xs font-normal">
                        (Confidence: {(confidence * 100).toFixed(0)}%)
                      </span>
                    </h4>
                    <p className={`text-xs mt-1 ${
                      confidence >= 0.8
                        ? 'text-green-700 dark:text-green-300'
                        : confidence >= 0.5
                        ? 'text-yellow-700 dark:text-yellow-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      Dimensions: {manualDimensions || embeddingValidation.dimensions}d • 
                      Max Tokens: {manualMaxTokens || embeddingValidation.max_tokens} • 
                      Pattern: {embeddingValidation.detected_pattern}
                    </p>
                    {embeddingValidation.warning && (
                      <p className={`text-xs mt-1 font-medium ${
                        confidence >= 0.5
                          ? 'text-yellow-700 dark:text-yellow-300'
                          : 'text-red-700 dark:text-red-300'
                      }`}>
                        ⚠️ {embeddingValidation.warning}
                      </p>
                    )}
                  </div>
                </div>

                {/* Manual Override Toggle */}
                {confidence < 0.8 && (
                  <button
                    type="button"
                    onClick={() => setShowDimensionOverride(!showDimensionOverride)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors mt-2"
                  >
                    {showDimensionOverride ? '− Hide Manual Override' : '+ Set Dimensions Manually'}
                  </button>
                )}

                {/* Manual Dimension Override Selector */}
                {showDimensionOverride && embeddingValidation.override_options && (
                  <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Embedding Dimensions
                    </label>
                    <select
                      value={manualDimensions || embeddingValidation.dimensions}
                      onChange={(e) => {
                        const selected = embeddingValidation.override_options?.find(
                          opt => opt.dimensions === Number(e.target.value)
                        );
                        setManualDimensions(Number(e.target.value));
                        if (selected) {
                          setManualMaxTokens(selected.max_tokens);
                        }
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      {embeddingValidation.override_options.map(option => (
                        <option key={option.dimensions} value={option.dimensions}>
                          {option.label} - {option.dimensions}d, {option.max_tokens} tokens
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Choose the correct dimensions if auto-detection is inaccurate
                    </p>
                  </div>
                )}
              </div>
              );
            })()}

            {isValidatingEmbedding && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-gray-400"></div>
                <span>Validating embedding model...</span>
              </div>
            )}

            {/* Provider Errors */}
            {errors.providers && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="w-3 h-3" />
                {errors.providers}
              </div>
            )}

            {/* Clara Core Indicator */}
            {(usesClaraCore(selectedLLMProvider, providers) || usesClaraCore(selectedEmbeddingProvider, providers)) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mt-0.5">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Clara Core Required
                    </h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                      This notebook uses Clara Core for local AI processing. Clara Core will be automatically started when you open this notebook.
                    </p>
                    <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <span>• Local processing (no data sent to cloud)</span>
                      <span>• Automatic startup</span>
                      <span>• GPU acceleration available</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Entity Types Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Tags className="w-4 h-4" />
                Entity Types & Language
              </h3>
              <button
                type="button"
                onClick={() => setShowEntityTypes(!showEntityTypes)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
              >
                {showEntityTypes ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </div>

            {showEntityTypes && (
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {/* Language Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Processing Language
                  </label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>

                {/* Entity Type Categories */}
                {entityTypesData && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Quick Add Categories
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(entityTypesData.specialized_sets).map(([setName, types]) => (
                        <button
                          key={setName}
                          type="button"
                          onClick={() => setSelectedEntityTypes(types)}
                          className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-left"
                        >
                          <div className="font-medium text-gray-900 dark:text-white capitalize">
                            {setName.replace(/_/g, ' ')}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            {types.length} types
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Entity Type Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Add Custom Entity Type
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customEntityType}
                      onChange={(e) => setCustomEntityType(e.target.value)}
                      placeholder="Enter entity type (e.g., CUSTOM_TYPE)"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomEntityType();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addCustomEntityType}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Selected Entity Types */}
                {selectedEntityTypes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Selected Entity Types ({selectedEntityTypes.length})
                    </label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {selectedEntityTypes.map((type) => (
                        <span
                          key={type}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-lg text-xs"
                        >
                          {type}
                          <button
                            type="button"
                            onClick={() => removeEntityType(type)}
                            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Entity types help the AI identify and extract specific concepts from your documents. 
                  You can customize these later in the notebook settings.
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || isLoadingModels}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                'Create Notebook'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNotebookModal; 