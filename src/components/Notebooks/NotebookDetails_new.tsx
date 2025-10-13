import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  Trash2, 
  Search,
  Network,
  Calendar,
  FileType,
  Settings,
  AlertCircle,
  Bot,
  Layers,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  X,
  BookOpen,
  BarChart3,
  TrendingUp,
  Sparkles,
  PieChart,
  RefreshCw,
  AlertTriangle,
  Maximize2,
  File,
  FileSpreadsheet,
  Presentation,
  Globe,
  FileImage,
  Tags,
  Plus,
  Minus,
  Save
} from 'lucide-react';
import DocumentUpload from './DocumentUpload';
import CreateDocumentModal from './CreateDocumentModal';
import FileViewerModal from './FileViewerModal';
import NotebookChat from './NotebookChat_clara';
import GraphViewer from './GraphViewer';
import GraphViewerModal from './GraphViewerModal';
import { 
  claraNotebookService, 
  NotebookResponse, 
  NotebookDocumentResponse,
  EntityTypesResponse,
  DocumentReprocessResponse
} from '../../services/claraNotebookService';
import { useProviders } from '../../contexts/ProvidersContext';
import { claraApiService } from '../../services/claraApiService';
import { ClaraModel } from '../../types/clara_assistant_types';
import { notebookFileStorage } from '../../services/notebookFileStorage';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  role?: 'user' | 'assistant';
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

interface NotebookDetailsNewProps {
  notebook: NotebookResponse;
  onClose: () => void;
  onNotebookUpdated: (notebook: NotebookResponse) => void;
  onNotebookDeleted: () => void;
}

const NotebookDetails_new: React.FC<NotebookDetailsNewProps> = ({ 
  notebook, 
  onClose, 
  onNotebookUpdated,
  onNotebookDeleted 
}) => {
  const [documents, setDocuments] = useState<NotebookDocumentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateDocModal, setShowCreateDocModal] = useState(false);
  const [showFileViewerModal, setShowFileViewerModal] = useState(false);
  const [selectedDocumentForViewing, setSelectedDocumentForViewing] = useState<NotebookDocumentResponse | null>(null);
  const [localFileAvailability, setLocalFileAvailability] = useState<Record<string, boolean>>({});
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [showGraphViewerModal, setShowGraphViewerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isEditingLLM, setIsEditingLLM] = useState(false);
  const [selectedLLMProvider, setSelectedLLMProvider] = useState('');
  const [selectedLLMModel, setSelectedLLMModel] = useState('');
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useState('');
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState('');
  const [models, setModels] = useState<ClaraModel[]>([]);
  const [studioActiveTab, setStudioActiveTab] = useState<'sources' | 'graph' | 'analytics'>('sources');
  const [selectedDocument, setSelectedDocument] = useState<NotebookDocumentResponse | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isBackendHealthy, setIsBackendHealthy] = useState(true);
  
  // Notebook-specific model connectivity status
  const [modelStatus, setModelStatus] = useState<{
    llm_accessible: boolean;
    llm_error: string | null;
    embedding_accessible: boolean;
    embedding_error: string | null;
    overall_status: 'success' | 'partial' | 'failed' | 'error';
    lastChecked: Date | null;
  }>({ llm_accessible: false, llm_error: null, embedding_accessible: false, embedding_error: null, overall_status: 'error', lastChecked: null });
  const [showModelStatus, setShowModelStatus] = useState(true);
  const [modelStatusDismissed, setModelStatusDismissed] = useState(false);
  
  // Entity types and configuration management
  const [entityTypesData, setEntityTypesData] = useState<EntityTypesResponse | null>(null);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<string[]>([]);
  const [customEntityType, setCustomEntityType] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [isEditingEntityTypes, setIsEditingEntityTypes] = useState(false);
  const [isUpdatingConfiguration, setIsUpdatingConfiguration] = useState(false);
  const [isReprocessingDocuments, setIsReprocessingDocuments] = useState(false);
  const [reprocessingProgress, setReprocessingProgress] = useState<DocumentReprocessResponse | null>(null);
  
  // Get providers from context
  const { providers } = useProviders();

  // Load documents from API
  useEffect(() => {
    loadDocuments();
  }, [notebook.id]);

  // Check local file availability when documents change
  useEffect(() => {
    checkLocalFileAvailability();
  }, [documents]);

  // Load models when providers change
  useEffect(() => {
    if (providers.length > 0) {
      loadModels();
    }
  }, [providers]);

  // Validate current notebook's models (LLM and Embedding) periodically
  // Once connected successfully, stop checking to reduce pressure on models
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    const checkNotebookModelStatus = async () => {
      try {
        if (!claraNotebookService.isBackendHealthy()) return false;
        if (!notebook.llm_provider || !notebook.embedding_provider) return false;
        
        const validation = await claraNotebookService.validateModels({
          name: notebook.name,
          description: notebook.description,
          llm_provider: notebook.llm_provider,
          embedding_provider: notebook.embedding_provider,
          entity_types: notebook.entity_types,
          language: notebook.language
        });
        
        setModelStatus({
          llm_accessible: validation.llm_accessible,
          llm_error: validation.llm_error,
          embedding_accessible: validation.embedding_accessible,
          embedding_error: validation.embedding_error,
          overall_status: validation.overall_status,
          lastChecked: new Date()
        });
        
        // Auto-hide when fully connected, unless user dismissed earlier
        if (validation.overall_status === 'success') {
          if (!modelStatusDismissed) {
            setShowModelStatus(false);
          }
          // Stop checking once successfully connected
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return true; // Success - stop checking
        } else {
          // Always show on any degraded status
          setShowModelStatus(true);
          return false; // Keep checking
        }
      } catch (e: any) {
        setModelStatus(prev => ({
          ...prev,
          llm_accessible: false,
          embedding_accessible: false,
          overall_status: 'error',
          llm_error: e?.message ?? 'Validation failed',
          embedding_error: e?.message ?? 'Validation failed',
          lastChecked: new Date()
        }));
        setShowModelStatus(true);
        return false; // Keep checking
      }
    };

    // Initial check
    checkNotebookModelStatus().then(success => {
      // Only set up interval if initial check failed
      if (!success) {
        // Check every 2 minutes (120000ms) to reduce load on smaller machines
        interval = setInterval(async () => {
          await checkNotebookModelStatus();
          // Interval will be cleared inside the function if connection succeeds
        }, 120000);
      }
    });

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [notebook.id, notebook.llm_provider, notebook.embedding_provider, modelStatusDismissed]);

  // Initialize LLM and embedding selection with current notebook values
  useEffect(() => {
    if (notebook.llm_provider) {
      setSelectedLLMProvider(notebook.llm_provider.name);
      setSelectedLLMModel(notebook.llm_provider.model);
    }
    if (notebook.embedding_provider) {
      setSelectedEmbeddingProvider(notebook.embedding_provider.name);
      setSelectedEmbeddingModel(notebook.embedding_provider.model);
    }
  }, [notebook]);

  // Load entity types and initialize state
  useEffect(() => {
    const loadEntityTypes = async () => {
      try {
        if (claraNotebookService.isBackendHealthy()) {
          const entityData = await claraNotebookService.getEntityTypes();
          setEntityTypesData(entityData);
        }
      } catch (error) {
        console.error('Failed to load entity types:', error);
      }
    };

    loadEntityTypes();
  }, []);

  // Initialize entity types and language from notebook
  useEffect(() => {
    if (notebook.entity_types) {
      setSelectedEntityTypes(notebook.entity_types);
    }
    if (notebook.language) {
      setSelectedLanguage(notebook.language);
    }
  }, [notebook.entity_types, notebook.language]);

  // Auto-refresh documents every 5 seconds if there are processing documents
  useEffect(() => {
    const hasProcessingDocs = documents.some(doc => doc.status === 'processing');
    
    if (!hasProcessingDocs) return;

    const interval = setInterval(() => {
      loadDocuments();
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, notebook.id]);

  const loadDocuments = async () => {
    if (!claraNotebookService.isBackendHealthy()) {
      setError('Notebook backend is not available');
      setIsLoading(false);
      return;
    }

    // Only show loading on initial load, not on auto-refresh
    if (documents.length === 0) {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      const data = await claraNotebookService.listDocuments(notebook.id);
      setDocuments(data);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const allModels = await claraApiService.getModels();
      setModels(allModels);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const checkLocalFileAvailability = async () => {
    if (documents.length === 0) return;

    try {
      const availability: Record<string, boolean> = {};
      
      // Check each document's availability in parallel
      const availabilityPromises = documents.map(async (doc) => {
        const isAvailable = await notebookFileStorage.isFileAvailable(doc.id);
        availability[doc.id] = isAvailable;
        return { id: doc.id, available: isAvailable };
      });

      await Promise.all(availabilityPromises);
      setLocalFileAvailability(availability);
    } catch (error) {
      console.error('Failed to check local file availability:', error);
    }
  };

  const handleDocumentClick = (document: NotebookDocumentResponse) => {
    setSelectedDocumentForViewing(document);
    setShowFileViewerModal(true);
  };

  const storeFileLocally = async (file: File, documentId: string) => {
    try {
      await notebookFileStorage.storeFile(documentId, notebook.id, file);
      
      // Update availability state
      setLocalFileAvailability(prev => ({
        ...prev,
        [documentId]: true
      }));
    } catch (error) {
      console.error('Failed to store file locally:', error);
      // Don't throw error - local storage is optional
    }
  };

  const storeTextFileLocally = async (filename: string, content: string, documentId: string) => {
    try {
      await notebookFileStorage.storeTextFile(documentId, notebook.id, filename, content);
      
      // Update availability state
      setLocalFileAvailability(prev => ({
        ...prev,
        [documentId]: true
      }));
    } catch (error) {
      console.error('Failed to store text file locally:', error);
      // Don't throw error - local storage is optional
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    switch (extension) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-600" />;
      
      // Text formats
      case 'txt':
      case 'md':
      case 'rtf':
        return <FileText className="w-4 h-4 text-blue-600" />;
      
      // Microsoft Office Document formats
      case 'doc':
      case 'docx':
      case 'odt':
        return <File className="w-4 h-4 text-blue-700" />;
      
      // Spreadsheet formats
      case 'xls':
      case 'xlsx':
      case 'ods':
        return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
      
      // Presentation formats
      case 'ppt':
      case 'pptx':
      case 'odp':
        return <Presentation className="w-4 h-4 text-orange-600" />;
      
      // Web formats
      case 'html':
      case 'htm':
      case 'xml':
        return <Globe className="w-4 h-4 text-purple-600" />;
      
      // Data formats
      case 'csv':
      case 'json':
        return <FileType className="w-4 h-4 text-green-600" />;
      
      // Image formats (for reference, though not processed as documents)
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
        return <FileImage className="w-4 h-4 text-pink-600" />;
      
      default:
        return <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string, error?: string) => {
    switch (status) {
      case 'completed':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Completed
          </div>
        );
      case 'processing':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3 animate-spin" />
            Processing
          </div>
        );
      case 'failed':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 rounded-full text-xs font-medium" title={error ? `Error: ${error}. Click retry button to try again.` : "Processing failed. Click retry button to try again."}>
            <XCircle className="w-3 h-3" />
            Failed - Click retry
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            {status}
          </div>
        );
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDocumentUpload = async (files: File[]) => {
    if (!claraNotebookService.isBackendHealthy()) {
      throw new Error('Notebook backend is not available');
    }

    try {
      // Check if notebook has required provider configuration
      if (!notebook.llm_provider || !notebook.embedding_provider) {
        throw new Error('Notebook configuration is incomplete. Please update settings with valid LLM and embedding providers.');
      }

      // CRITICAL: Validate models before uploading documents
      console.log('🔍 Validating models before document upload...');
      const validation = await claraNotebookService.validateModels({
        name: notebook.name,
        description: notebook.description,
        llm_provider: notebook.llm_provider,
        embedding_provider: notebook.embedding_provider,
        entity_types: notebook.entity_types,
        language: notebook.language
      });

      console.log('✓ Validation results:', validation);

      // Check validation results
      if (validation.overall_status === 'failed' || validation.overall_status === 'error') {
        const errorMessages = [];
        if (!validation.llm_accessible && validation.llm_error) {
          errorMessages.push(`❌ LLM Error: ${validation.llm_error}`);
        }
        if (!validation.embedding_accessible && validation.embedding_error) {
          errorMessages.push(`❌ Embedding Error: ${validation.embedding_error}`);
        }
        
        throw new Error(
          `⚠️ Cannot Process Documents - Models Not Accessible\n\n${errorMessages.join('\n\n')}\n\n` +
          `Your documents will upload but will fail to process!\n\n` +
          `Please check:\n` +
          `• Model services are running (Clara Core / Ollama / OpenAI)\n` +
          `• API keys are valid\n` +
          `• Network connectivity\n` +
          `• Model names in Settings are correct\n\n` +
          `Fix these issues before uploading documents.`
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
        
        // Show warning but allow upload
        console.warn('Partial validation:', partialMessage.join(', '));
        const continueUpload = window.confirm(
          `${partialMessage.join('\n\n')}\n\n` +
          `Document processing will likely fail!\n\n` +
          `Continue anyway?`
        );
        
        if (!continueUpload) {
          throw new Error('Upload cancelled by user');
        }
      }

      console.log('✓ Models validated successfully, uploading documents...');

      const uploadedDocs = await claraNotebookService.uploadDocuments(notebook.id, files);
      
      // Store files locally in IndexedDB (in parallel with upload)
      const storePromises = files.map((file, index) => {
        const doc = uploadedDocs[index];
        if (doc) {
          return storeFileLocally(file, doc.id);
        }
        return Promise.resolve();
      });
      
      // Don't await - let local storage happen in background
      Promise.all(storePromises).catch(error => {
        console.warn('Some files could not be stored locally:', error);
      });
      
      // Add new documents to the list
      setDocuments(prev => [...uploadedDocs, ...prev]);
      
      // Update notebook document count
      const updatedNotebook = {
        ...notebook,
        document_count: notebook.document_count + uploadedDocs.length
      };
      onNotebookUpdated(updatedNotebook);
      
      setShowUploadModal(false);
      setShowCreateDocModal(false);
    } catch (error) {
      console.error('Upload failed:', error);
      throw error; // Re-throw so the modal can handle it
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    if (!claraNotebookService.isBackendHealthy()) {
      setError('Notebook backend is not available');
      return;
    }

    try {
      await claraNotebookService.deleteDocument(notebook.id, documentId);
      
      // Remove from local storage (don't await - it's optional)
      notebookFileStorage.deleteFile(documentId).catch(error => {
        console.warn('Failed to delete file from local storage:', error);
      });
      
      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      // Update availability state
      setLocalFileAvailability(prev => {
        const updated = { ...prev };
        delete updated[documentId];
        return updated;
      });
      
      // Update notebook document count
      const updatedNotebook = {
        ...notebook,
        document_count: Math.max(0, notebook.document_count - 1)
      };
      onNotebookUpdated(updatedNotebook);
    } catch (error) {
      console.error('Failed to delete document:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete document');
    }
  };

  const handleRetryDocument = async (documentId: string) => {
    if (!claraNotebookService.isBackendHealthy()) {
      setError('Notebook backend is not available');
      return;
    }

    try {
      // Call the retry API
      const retryResponse = await claraNotebookService.retryDocument(notebook.id, documentId);
      
      // Update the document status in local state
      setDocuments(prev => prev.map(doc => 
        doc.id === documentId 
          ? { ...doc, status: 'processing' as const, error: undefined }
          : doc
      ));
      
      // Show success notification
      setNotification({ 
        message: 'Document retry initiated successfully. Processing will resume from where it failed.', 
        type: 'success' 
      });
      
      console.log('Document retry initiated:', retryResponse.message);
    } catch (error) {
      console.error('Failed to retry document:', error);
      setError(error instanceof Error ? error.message : 'Failed to retry document');
      
      // Show error notification
      setNotification({ 
        message: error instanceof Error ? error.message : 'Failed to retry document', 
        type: 'error' 
      });
    }
  };

  // Auto-clear notifications after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleUpdateLLM = async () => {
    if (!selectedLLMProvider || !selectedLLMModel) {
      setNotification({ message: 'Please select LLM provider and model', type: 'error' });
      return;
    }

    if (!selectedEmbeddingProvider || !selectedEmbeddingModel) {
      setNotification({ message: 'Please select embedding provider and model', type: 'error' });
      return;
    }

    setIsUpdatingConfiguration(true);
    try {
      const llmProvider = providers.find(p => p.name === selectedLLMProvider);
      const llmModel = models.find(m => m.name === selectedLLMModel);
      const embeddingProvider = providers.find(p => p.name === selectedEmbeddingProvider);
      const embeddingModel = models.find(m => m.name === selectedEmbeddingModel);

      if (!llmProvider || !llmModel || !embeddingProvider || !embeddingModel) {
        throw new Error('Provider or model not found');
      }

      const newConfig = {
        name: notebook.name,
        description: notebook.description,
        llm_provider: {
          name: llmProvider.name,
          type: llmProvider.type as 'openai' | 'openai_compatible' | 'ollama',
          baseUrl: llmProvider.baseUrl,
          apiKey: llmProvider.apiKey,
          model: llmModel.name
        },
        embedding_provider: {
          name: embeddingProvider.name,
          type: embeddingProvider.type as 'openai' | 'openai_compatible' | 'ollama',
          baseUrl: embeddingProvider.baseUrl,
          apiKey: embeddingProvider.apiKey,
          model: embeddingModel.name
        },
        entity_types: selectedEntityTypes,
        language: selectedLanguage
      };

      // CRITICAL: Validate new configuration before applying
      console.log('🔍 Validating new configuration before update...');
      const validation = await claraNotebookService.validateModels(newConfig);
      console.log('✓ Validation results:', validation);

      // Check validation results
      if (validation.overall_status === 'failed' || validation.overall_status === 'error') {
        const errorMessages = [];
        if (!validation.llm_accessible && validation.llm_error) {
          errorMessages.push(`❌ LLM Error: ${validation.llm_error}`);
        }
        if (!validation.embedding_accessible && validation.embedding_error) {
          errorMessages.push(`❌ Embedding Error: ${validation.embedding_error}`);
        }
        
        throw new Error(
          `⚠️ Configuration Validation Failed\n\n${errorMessages.join('\n\n')}\n\n` +
          `Cannot update configuration - models are not accessible.\n\n` +
          `Please check:\n` +
          `• Model services are running\n` +
          `• API keys are correct\n` +
          `• Model names are valid\n` +
          `• Network connectivity`
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
        
        // Show warning but allow update
        console.warn('Partial validation:', partialMessage.join(', '));
        const continueUpdate = window.confirm(
          `${partialMessage.join('\n\n')}\n\n` +
          `Future document processing will fail!\n\n` +
          `Continue anyway?`
        );
        
        if (!continueUpdate) {
          setIsUpdatingConfiguration(false);
          return;
        }
      }

      console.log('✓ Configuration validated successfully, updating notebook...');

      // Detect if embedding model changed (requires rebuild)
      const embeddingModelChanged = 
        notebook.embedding_provider?.model !== embeddingModel.name ||
        notebook.embedding_provider?.name !== embeddingProvider.name;

      const response = await claraNotebookService.updateNotebookConfiguration(notebook.id, newConfig);

      // Update the notebook with the new configuration
      onNotebookUpdated(response.notebook);
      setIsEditingLLM(false);
      
      // If embedding model changed, automatically trigger rebuild
      if (embeddingModelChanged && notebook.document_count > 0) {
        const shouldRebuild = window.confirm(
          '🔄 Embedding Model Changed!\n\n' +
          'The embedding model has changed. To ensure consistency, all documents should be rebuilt with the new embeddings.\n\n' +
          `This will:\n` +
          `• Clear the current knowledge graph\n` +
          `• Reprocess all ${notebook.document_count} documents\n` +
          `• Generate new embeddings with the updated model\n\n` +
          'Rebuild now? (Recommended)'
        );

        if (shouldRebuild) {
          try {
            setIsReprocessingDocuments(true);
            console.log('🔄 Triggering automatic rebuild due to embedding model change...');
            
            const rebuildResponse = await claraNotebookService.rebuildNotebook(notebook.id);
            
            setNotification({ 
              message: `Notebook rebuild initiated! ${rebuildResponse.queued_for_reprocessing} documents queued with new embedding model.`, 
              type: 'success' 
            });
            
            // Refresh documents to show new status
            await loadDocuments();
          } catch (rebuildError) {
            console.error('Failed to rebuild after embedding change:', rebuildError);
            setNotification({ 
              message: 'Configuration updated but rebuild failed. Use the Rebuild button in Danger Zone to retry.', 
              type: 'error' 
            });
          } finally {
            setIsReprocessingDocuments(false);
          }
        } else {
          // User declined rebuild - show manual option
          setNotification({ 
            message: 'Configuration updated. Use "Rebuild Notebook" in Danger Zone when ready to reprocess documents.', 
            type: 'success' 
          });
        }
      } else {
        // No embedding change or no documents - just show success
        setNotification({ 
          message: `Configuration updated successfully. ${response.recommendation}`, 
          type: 'success' 
        });

        // Show reprocessing progress if documents need reprocessing (for other changes)
        if (response.reprocessing_info.needs_reprocessing > 0 && !embeddingModelChanged) {
          setReprocessingProgress({
            message: `${response.reprocessing_info.needs_reprocessing} documents may need reprocessing for consistency`,
            total_documents: response.reprocessing_info.total_documents,
            queued_for_reprocessing: 0,
            note: 'Click "Reprocess Documents" to update existing documents with new configuration'
          });
        }
      }
    } catch (error) {
      console.error('Failed to update configuration:', error);
      setNotification({ 
        message: error instanceof Error ? error.message : 'Failed to update configuration', 
        type: 'error' 
      });
    } finally {
      setIsUpdatingConfiguration(false);
    }
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

  const handleUpdateEntityTypes = async () => {
    setIsUpdatingConfiguration(true);
    try {
      const updatedNotebook = await claraNotebookService.updateNotebookSchema(notebook.id, {
        entity_types: selectedEntityTypes,
        language: selectedLanguage
      });

      onNotebookUpdated(updatedNotebook);
      setIsEditingEntityTypes(false);
      setNotification({ 
        message: 'Entity types and language updated successfully', 
        type: 'success' 
      });
    } catch (error) {
      console.error('Failed to update entity types:', error);
      setNotification({ 
        message: error instanceof Error ? error.message : 'Failed to update entity types', 
        type: 'error' 
      });
    } finally {
      setIsUpdatingConfiguration(false);
    }
  };

  const handleReprocessDocuments = async (force: boolean = false) => {
    setIsReprocessingDocuments(true);
    try {
      const response = await claraNotebookService.reprocessDocuments(notebook.id, force);
      setReprocessingProgress(response);
      setNotification({ 
        message: response.message, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Failed to reprocess documents:', error);
      setNotification({ 
        message: error instanceof Error ? error.message : 'Failed to reprocess documents', 
        type: 'error' 
      });
    } finally {
      setIsReprocessingDocuments(false);
    }
  };

  const getLLMModels = (providerName: string) => {
    // Find the provider by name to get its ID
    const provider = providers.find(p => p.name === providerName);
    if (!provider) return [];
    
    return models.filter(m => 
      m.provider === provider.id && 
      (m.type === 'text' || m.type === 'multimodal')
    );
  };

  const getEmbeddingModels = (providerName: string) => {
    // Find the provider by name to get its ID
    const provider = providers.find(p => p.name === providerName);
    if (!provider) return [];
    
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
      if (m.provider !== provider.id) return false;
      
      // Check if it's explicitly marked as embedding type
      if (m.type === 'embedding') return true;
      
      // Check if the model name matches supported embedding models
      const modelNameLower = m.name.toLowerCase();
      return supportedEmbeddingModels.some(supported => 
        modelNameLower.includes(supported.toLowerCase())
      );
    });
  };

  const getDocumentStats = () => {
    const total = documents.length;
    const completed = documents.filter(doc => doc.status === 'completed').length;
    const processing = documents.filter(doc => doc.status === 'processing').length;
    const failed = documents.filter(doc => doc.status === 'failed').length;
    
    return { total, completed, processing, failed };
  };

  // Chat functionality
  const checkBackendHealth = async () => {
    const healthy = claraNotebookService.isBackendHealthy();
    setIsBackendHealthy(healthy);
    return healthy;
  };

  const handleSendMessage = async (message: string, mode?: 'local' | 'global' | 'hybrid' | 'naive' | 'mix') => {
    if (!message.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim(),
      timestamp: new Date(),
      role: 'user',
      mode: 'citation' // Always use enhanced citation mode
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      const response = await claraNotebookService.sendChatMessage(notebook.id, {
        question: message.trim(),
        use_chat_history: true,
        mode: mode || 'hybrid' // Pass the selected query mode
      });
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.answer || 'Sorry, I could not process your request.',
        timestamp: new Date(),
        role: 'assistant',
        citations: response.citations || []
      };

      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
        timestamp: new Date(),
        role: 'assistant'
      };

      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Check backend health on component mount
  useEffect(() => {
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const stats = getDocumentStats();

  const renderStudioContent = () => {
    switch (studioActiveTab) {
      case 'sources':
        return (
          <div className="h-full flex flex-col">
            {/* Sources Header Actions - More compact */}
            <div className="flex-shrink-0 p-4 border-b border-white/20 dark:border-gray-800/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Sources
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCreateDocModal(true)}
                    className="glassmorphic bg-white/60 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-white/30 dark:border-gray-700/30 shadow-md flex items-center space-x-1.5 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all"
                  >
                    <FileText className="h-3 w-3 text-xs font-semibold text-sakura-600 dark:text-sakura-400" />
                    <span className="text-xs font-semibold text-sakura-700 dark:text-sakura-300">Create Doc</span>
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="glassmorphic bg-white/60 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-white/30 dark:border-gray-700/30 shadow-md flex items-center space-x-1.5 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all"
                  >
                    <Upload className="h-3 w-3 text-xs font-semibold text-gray-700 dark:text-gray-300" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Upload Docs</span>
                  </button>
                  
                </div>
              </div>
              
              {/* Search - More compact */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 dark:focus:ring-blue-400/50 dark:focus:border-blue-400/50 transition-all duration-200 border border-white/30 dark:border-gray-700/30 shadow-md backdrop-blur-xl text-sm"
                />
              </div>
            </div>

            {/* Error state - More compact */}
            {error && (
              <div className="mx-4 mt-3 glassmorphic bg-red-50/90 dark:bg-red-900/40 border border-red-200/50 dark:border-red-700/30 rounded-lg p-3 backdrop-blur-xl shadow-md">
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" />
                  <p className="text-xs font-medium text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            )}

            {/* Documents list - More compact */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
              {isLoading && documents.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="glassmorphic bg-white/60 dark:bg-gray-800/60 rounded-xl p-6 border border-white/30 dark:border-gray-700/30 shadow-lg backdrop-blur-xl">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Loading documents...</span>
                    </div>
                  </div>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-8">
                  <div className="glassmorphic bg-white/60 dark:bg-gray-800/60 rounded-lg p-4 border border-white/30 dark:border-gray-700/30 shadow-md backdrop-blur-xl mx-auto max-w-xs">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-3 shadow-md">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-2">
                      {documents.length === 0 ? 'No documents yet' : 'No matches'}
                    </h3>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                      {documents.length === 0 
                        ? 'Upload documents to start building your knowledge base.'
                        : 'Try adjusting your search terms.'
                      }
                    </p>
                    {documents.length === 0 && (
                      <div className="flex items-center gap-2 justify-center">
                        <button
                          onClick={() => setShowCreateDocModal(true)}
                          className="inline-flex items-center gap-1 glassmorphic bg-gradient-to-r from-sakura-500 to-pink-500 hover:from-sakura-600 hover:to-pink-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200 shadow-md hover:shadow-lg border border-white/20"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          Create Document
                        </button>
                        <button
                          onClick={() => setShowUploadModal(true)}
                          className="inline-flex items-center gap-1 glassmorphic bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200 shadow-md hover:shadow-lg border border-white/20"
                        >
                          <Upload className="h-2.5 w-2.5" />
                          Upload Documents
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mt-4">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`glassmorphic rounded-lg cursor-pointer transition-all duration-200 border backdrop-blur-xl shadow-md hover:shadow-lg ${
                        selectedDocument?.id === doc.id 
                          ? 'ring-1 ring-blue-500/50 bg-blue-50/80 dark:bg-blue-900/30 border-blue-200/50 dark:border-blue-700/30' 
                          : 'bg-white/60 dark:bg-gray-800/60 border-white/30 dark:border-gray-700/30 hover:bg-white/80 dark:hover:bg-gray-800/80 hover:border-gray-300/50 dark:hover:border-gray-600/50'
                      }`}
                    >
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <div 
                            className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                            onClick={() => {
                              setSelectedDocument(doc);
                              handleDocumentClick(doc);
                            }}
                          >
                            <div className="relative p-1.5 glassmorphic bg-white/60 dark:bg-gray-700/60 rounded-lg border border-white/30 dark:border-gray-600/30">
                              {getFileIcon(doc.filename)}
                              {/* Local availability indicator */}
                              {localFileAvailability[doc.id] && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 shadow-sm" title="Available locally" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                                  {doc.filename}
                                </p>
                                {localFileAvailability[doc.id] && (
                                  <span className="text-[8px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full font-medium">
                                    LOCAL
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mb-1">
                                {getStatusBadge(doc.status, doc.error)}
                              </div>
                              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                {formatDate(doc.uploaded_at)}
                                {localFileAvailability[doc.id] && (
                                  <span className="ml-2 text-green-600 dark:text-green-400">• Click to view</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 ml-3">
                            {/* Show retry button for failed documents */}
                            {doc.status === 'failed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetryDocument(doc.id);
                                }}
                                className="p-1.5 glassmorphic bg-white/60 dark:bg-gray-700/60 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 rounded-lg border border-white/30 dark:border-gray-600/30 shadow-sm hover:shadow-md"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(doc.id);
                              }}
                              className="p-1.5 glassmorphic bg-white/60 dark:bg-gray-700/60 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 rounded-lg border border-white/30 dark:border-gray-600/30 shadow-sm hover:shadow-md"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Document details when selected - Compact */}
                        {selectedDocument?.id === doc.id && (
                          <div className="mt-3 pt-3 border-t border-white/30 dark:border-gray-700/30 space-y-2 animate-in slide-in-from-top-2 fade-in-0">
                            <div className="text-[10px] text-gray-600 dark:text-gray-400">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="glassmorphic bg-white/40 dark:bg-gray-700/40 p-2 rounded-lg border border-white/20 dark:border-gray-600/20">
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Status:</span>
                                  <span className="ml-1 font-medium">{doc.status}</span>
                                </div>
                                <div className="glassmorphic bg-white/40 dark:bg-gray-700/40 p-2 rounded-lg border border-white/20 dark:border-gray-600/20">
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Uploaded:</span>
                                  <span className="ml-1 font-medium">{formatDate(doc.uploaded_at)}</span>
                                </div>
                              </div>
                              {doc.error && (
                                <div className="mt-2 glassmorphic bg-red-50/80 dark:bg-red-900/30 rounded-lg border border-red-200/50 dark:border-red-700/30 p-2 backdrop-blur-sm">
                                  <div className="text-red-600 dark:text-red-400 text-[10px] font-medium mb-2">
                                    <span className="font-semibold">Error:</span> {doc.error}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRetryDocument(doc.id);
                                      }}
                                      className="inline-flex items-center gap-1 glassmorphic bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-2 py-1 rounded-lg transition-all duration-200 border border-blue-500/30 shadow-md hover:shadow-lg font-semibold"
                                    >
                                      <RefreshCw className="w-2.5 h-2.5" />
                                      Retry
                                    </button>
                                    <span className="text-[9px] text-gray-500 dark:text-gray-400">
                                      Skips processed chunks
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'graph':
        return (
          <div className="h-full flex flex-col">
            {/* Graph Header with Full View Button */}
            <div className="flex-shrink-0 p-4 border-b border-white/20 dark:border-gray-800/30">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent flex items-center gap-2">
                  <Network className="w-5 h-5 text-green-500" />
                  Knowledge Graph
                </h3>
                <button
                  onClick={() => setShowGraphViewerModal(true)}
                  className="glassmorphic bg-white/60 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-white/30 dark:border-gray-700/30 shadow-md flex items-center space-x-1.5 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all"
                >
                  <Maximize2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-300">Open 3D View</span>
                </button>
              </div>
            </div>

            {/* Graph Content */}
            <div className="flex-1 p-1">
              <div className="h-full glassmorphic rounded-2xl overflow-hidden bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 shadow-xl">
                <div className="h-full bg-gradient-to-br from-white/80 to-white/40 dark:from-gray-900/80 dark:to-gray-900/40 backdrop-blur-sm">
                  <GraphViewer 
                    notebookId={notebook.id}
                    onViewFull={() => setShowGraphViewerModal(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'analytics':
        return (
          // text is white in dark mode but in light mode text should be dark  a
          <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="glassmorphic bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 rounded-2xl p-6 shadow-xl">
              <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 dark:from-purple-400 dark:to-violet-400 bg-clip-text text-transparent mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-violet-500 rounded-xl shadow-lg">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                Analytics Dashboard
              </h3>
              
              {/* Document Type Distribution */}
              <div className="glassmorphic bg-white/40 dark:bg-gray-700/40 border border-white/20 dark:border-gray-600/20 p-5 rounded-xl mb-6 backdrop-blur-sm shadow-lg">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                    <PieChart className="w-4 h-4 text-white" />
                  </div>
                  Document Types
                </h4>
                <div className="space-y-3">
                  {(() => {
                    const typeCount: Record<string, number> = {};
                    documents.forEach(doc => {
                      const ext = doc.filename.split('.').pop()?.toLowerCase() || 'unknown';
                      typeCount[ext] = (typeCount[ext] || 0) + 1;
                    });
                    
                    return Object.entries(typeCount).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between glassmorphic bg-white/50 dark:bg-gray-800/50 p-3 rounded-xl border border-white/20 dark:border-gray-600/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 glassmorphic bg-white/60 dark:bg-gray-700/60 rounded-lg border border-white/30 dark:border-gray-600/30">
                            {getFileIcon(`file.${type}`)}
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{type}</span>
                        </div>
                        <div className="glassmorphic bg-white/60 dark:bg-gray-700/60 px-3 py-1 rounded-lg border border-white/30 dark:border-gray-600/30">
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{count}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Processing Status */}
              <div className="glassmorphic bg-white/40 dark:bg-gray-700/40 border border-white/20 dark:border-gray-600/20 p-5 rounded-xl mb-6 backdrop-blur-sm shadow-lg">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-lg">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  Processing Status
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Success Rate</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 glassmorphic bg-emerald-50/80 dark:bg-emerald-900/30 px-3 py-1 rounded-xl border border-emerald-200/50 dark:border-emerald-600/30">
                      {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full glassmorphic bg-gray-200/60 dark:bg-gray-600/60 rounded-full h-3 border border-white/20 dark:border-gray-500/20 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-green-500 h-3 rounded-full transition-all duration-1000 ease-out shadow-lg"
                      style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="text-center glassmorphic bg-emerald-50/80 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-200/50 dark:border-emerald-600/30">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</div>
                      <div className="text-gray-600 dark:text-gray-400 font-medium">Completed</div>
                    </div>
                    <div className="text-center glassmorphic bg-blue-50/80 dark:bg-blue-900/30 p-3 rounded-xl border border-blue-200/50 dark:border-blue-600/30">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.processing}</div>
                      <div className="text-gray-600 dark:text-gray-400 font-medium">Processing</div>
                    </div>
                    <div className="text-center glassmorphic bg-red-50/80 dark:bg-red-900/30 p-3 rounded-xl border border-red-200/50 dark:border-red-600/30">
                      <div className="text-lg font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
                      <div className="text-gray-600 dark:text-gray-400 font-medium">Failed</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Failed Documents - Retry Available */}
              {stats.failed > 0 && (
                <div className="glassmorphic bg-red-50/80 dark:bg-red-900/30 border border-red-200/50 dark:border-red-700/30 p-5 rounded-xl mb-6 backdrop-blur-sm shadow-lg">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-red-500 to-pink-500 rounded-xl shadow-lg">
                      <RefreshCw className="w-4 h-4 text-white" />
                    </div>
                    Failed Documents
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between glassmorphic bg-white/60 dark:bg-gray-800/60 p-3 rounded-xl border border-white/20 dark:border-gray-600/20">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ready for Retry</span>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400 glassmorphic bg-red-50/80 dark:bg-red-900/40 px-3 py-1 rounded-lg border border-red-200/50 dark:border-red-600/30">
                        {stats.failed} document{stats.failed !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 font-medium glassmorphic bg-white/40 dark:bg-gray-700/40 p-3 rounded-xl border border-white/20 dark:border-gray-600/20">
                      Click the retry button next to any failed document to resume processing. 
                      LightRAG will skip chunks that were already processed successfully.
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Timeline */}
              <div className="glassmorphic bg-white/40 dark:bg-gray-700/40 border border-white/20 dark:border-gray-600/20 p-5 rounded-xl backdrop-blur-sm shadow-lg">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl shadow-lg">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  Upload Timeline
                </h4>
                <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar">
                  {documents
                    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
                    .slice(0, 5)
                    .map((doc) => (
                      <div key={doc.id} className="flex items-center gap-4 text-xs glassmorphic bg-white/50 dark:bg-gray-800/50 p-3 rounded-xl border border-white/20 dark:border-gray-600/20">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex-shrink-0 shadow-lg"></div>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-900 dark:text-white font-semibold truncate block">{doc.filename}</span>
                        </div>
                        <div className="text-gray-600 dark:text-gray-400 font-medium glassmorphic bg-white/60 dark:bg-gray-700/60 px-2 py-1 rounded-lg border border-white/30 dark:border-gray-600/30">
                          {formatDate(doc.uploaded_at)}
                        </div>
                      </div>
                    ))}
                  {documents.length === 0 && (
                    <div className="text-center text-gray-600 dark:text-gray-400 py-6 glassmorphic bg-white/40 dark:bg-gray-700/40 rounded-xl border border-white/20 dark:border-gray-600/20">
                      <div className="font-medium">No upload history</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-br from-sakura-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 relative overflow-hidden">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 glassmorphic rounded-xl shadow-2xl backdrop-blur-xl transition-all duration-500 transform ${
          notification.type === 'success' 
            ? 'bg-emerald-50/90 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200/50 dark:border-emerald-600/30' 
            : 'bg-red-50/90 dark:bg-red-900/50 text-red-800 dark:text-red-200 border border-red-200/50 dark:border-red-600/30'
        } animate-in slide-in-from-top-2 fade-in-0`}>
          <div className="flex items-start gap-3 p-3">
            <div className="flex-shrink-0">
              {notification.type === 'success' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg p-1 hover:bg-white/20"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      
      {/* Header - Compact and responsive */} 
      <div className="flex-shrink-0 glassmorphic bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border-b border-white/20 dark:border-gray-800/30 shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 min-h-[60px]">
          {/* Left side - Back button and notebook info */}
          <div className="flex items-center space-x-3 lg:space-x-4 flex-1 min-w-0">
            <button
              onClick={onClose}
              className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 group glassmorphic px-3 py-2 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 border border-white/30 dark:border-gray-700/30"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium hidden sm:inline">Back</span>
            </button>
            
            <div className="h-6 w-px bg-gradient-to-b from-transparent via-gray-300/50 dark:via-gray-600/50 to-transparent hidden sm:block"></div>
            
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="p-2 bg-gradient-to-br from-sakura-500 to-blue-500 rounded-xl shadow-lg">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent truncate">
                  {notebook.name}
                </h1>
                <div className="flex items-center space-x-3 lg:space-x-4 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center space-x-1">
                    <FileText className="h-3 w-3" />
                    <span>{notebook.document_count} docs</span>
                  </div>
                  <div className="flex items-center space-x-1 hidden sm:flex">
                    <Bot className="h-3 w-3" />
                    <span className="truncate max-w-24">{notebook.llm_provider?.name || 'No AI'}</span>
                  </div>
                  <div className="flex items-center space-x-1 hidden lg:flex">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(notebook.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - 2 column layout with proper height constraints */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Studio Panel (Left) - Contains Sources, Graph, and Analytics */}
        <div className="w-[320px] sm:w-[400px] lg:w-[480px] max-w-[50vw] xl:max-w-[40vw] glassmorphic bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl border-r border-white/20 dark:border-gray-800/30 flex flex-col shadow-2xl relative z-10">
          {/* Studio Header - More compact */}
          <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-white/20 dark:border-gray-800/30">
            <h2 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg shadow-lg">
                <Sparkles className="h-4 w-4 text-white drop-shadow-md" />
              </div>
              Studio
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 glassmorphic bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 rounded-lg transition-all duration-200 border border-white/30 dark:border-gray-700/30 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shadow-lg"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
              {/* Studio Sidebar Navigation */}
              <div className=" flex-shrink-0 w-16 sm:w-20 border-r border-white/20 dark:border-gray-800/30 ">
                <div className="flex flex-col items-center gap-2 p-2">
                  {[
                    { id: 'sources', label: 'Sources', icon: FileText, color: 'from-blue-500 to-cyan-500', solidColor: 'bg-blue-600' },
                    { id: 'graph', label: 'Graph', icon: Network, color: 'from-green-500 to-emerald-500', solidColor: 'bg-green-600' },
                    { id: 'analytics', label: 'Analytics', icon: BarChart3, color: 'from-purple-500 to-violet-500', solidColor: 'bg-purple-600' }
                  ].map((tab) => {
                    const IconComponent = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setStudioActiveTab(tab.id as any)}
                        className={`w-12 h-12 sm:w-14 sm:h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-all duration-200 border shadow-md ${
                          studioActiveTab === tab.id
                            ? `${tab.solidColor} dark:bg-gradient-to-br dark:${tab.color} text-white border-white/30 shadow-lg`
                            : 'bg-white/60 dark:bg-gray-800/60 border-white/30 dark:border-gray-700/30 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-800/80 hover:shadow-lg'
                        }`}
                      >
                        <IconComponent className={`h-3 w-3 sm:h-4 sm:w-4 ${
                          studioActiveTab === tab.id ? 'text-white filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''
                        }`} />
                        <span className={`text-[8px] sm:text-[9px] leading-none font-semibold hidden sm:block ${
                          studioActiveTab === tab.id ? 'text-white filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''
                        }`}>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Studio Content Area */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {renderStudioContent()}
              </div>
            </div>
        </div>

        {/* Chat Panel (Right) - Takes remaining space and is responsive */}
        <div className="flex-1 glassmorphic bg-white/30 dark:bg-gray-900/20 backdrop-blur-xl flex flex-col relative min-w-0">
          <NotebookChat 
            notebookId={notebook.id} 
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isChatLoading}
            documentCount={notebook.document_count}
            completedDocumentCount={documents.filter(doc => doc.status === 'completed').length}
            isBackendHealthy={isBackendHealthy}
            onDocumentUpload={handleDocumentUpload}
          />
        </div>
      </div>

      {/* Modals */}
      {showUploadModal && (
        <DocumentUpload 
          onClose={() => setShowUploadModal(false)}
          onUpload={handleDocumentUpload}
        />
      )}

      {showCreateDocModal && (
        <CreateDocumentModal 
          onClose={() => setShowCreateDocModal(false)}
          onUpload={handleDocumentUpload}
          onTextFileCreated={(filename, content, documentId) => {
            storeTextFileLocally(filename, content, documentId);
          }}
        />
      )}

      {showFileViewerModal && selectedDocumentForViewing && (
        <FileViewerModal 
          documentId={selectedDocumentForViewing.id}
          filename={selectedDocumentForViewing.filename}
          onClose={() => {
            setShowFileViewerModal(false);
            setSelectedDocumentForViewing(null);
          }}
        />
      )}

      {showGraphModal && (
        <GraphViewer 
          notebookId={notebook.id}
          onClose={() => setShowGraphModal(false)}
        />
      )}

      {showGraphViewerModal && (
        <GraphViewerModal
          notebookId={notebook.id}
          onClose={() => setShowGraphViewerModal(false)}
          initialViewMode="html"
        />
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glassmorphic w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200">
                  <Settings className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Notebook Settings
                </h2>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="px-4 py-3 space-y-3 overflow-y-auto custom-scrollbar max-h-[calc(85vh-80px)]">
              {/* AI Configuration */}
              <div className="glassmorphic rounded-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <div className="p-1.5 rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200">
                      <Bot className="w-4 h-4" />
                    </div>
                    AI Configuration
                  </h3>
                  {!isEditingLLM && notebook.llm_provider && (
                    <button
                      onClick={() => setIsEditingLLM(true)}
                      className="p-1.5 rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                      title="Edit LLM Configuration"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {notebook.llm_provider && notebook.embedding_provider ? (
                  <div className="space-y-3">
                    {/* LLM Configuration */}
                    <div className="glassmorphic rounded-md bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1 rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200">
                          <Bot className="w-3 h-3" />
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Language Model</span>
                      </div>
                      {isEditingLLM ? (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
                            <select
                              value={selectedLLMProvider}
                              onChange={(e) => {
                                setSelectedLLMProvider(e.target.value);
                                setSelectedLLMModel('');
                              }}
                              className="w-full px-2 py-1.5 text-sm rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                            >
                              <option value="">Select Provider</option>
                              {providers.filter(p => p.isEnabled).map(provider => (
                                <option key={provider.id} value={provider.name}>
                                  {provider.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Model</label>
                            <select
                              value={selectedLLMModel}
                              onChange={(e) => setSelectedLLMModel(e.target.value)}
                              disabled={!selectedLLMProvider}
                              className="w-full px-2 py-1.5 text-sm rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-60"
                            >
                              <option value="">Select Model</option>
                              {selectedLLMProvider && getLLMModels(selectedLLMProvider).map(model => (
                                <option key={model.id} value={model.name}>
                                  {model.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <div className="text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5 rounded-md glassmorphic bg-blue-50/80 dark:bg-blue-900/30 p-2">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              <span>Save updates all model settings at once.</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={handleUpdateLLM}
                                disabled={isUpdatingConfiguration}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium transition-colors"
                              >
                                {isUpdatingConfiguration ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Updating...
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-3 h-3" />
                                    Save Changes
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => setIsEditingLLM(false)}
                                disabled={isUpdatingConfiguration}
                                className="inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 p-2">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{notebook.llm_provider.name}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">{notebook.llm_provider.model}</div>
                        </div>
                      )}
                    </div>

                    {/* Embedding Configuration */}
                    <div className="rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1 rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200">
                          <Layers className="w-3 h-3" />
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Embedding Model</span>
                      </div>
                      {isEditingLLM ? (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
                            <select
                              value={selectedEmbeddingProvider}
                              onChange={(e) => {
                                setSelectedEmbeddingProvider(e.target.value);
                                setSelectedEmbeddingModel('');
                              }}
                              className="w-full px-2 py-1.5 text-sm rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            >
                              <option value="">Select Provider</option>
                              {providers.filter(p => p.isEnabled).map(provider => (
                                <option key={provider.id} value={provider.name}>
                                  {provider.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Model</label>
                            <select
                              value={selectedEmbeddingModel}
                              onChange={(e) => setSelectedEmbeddingModel(e.target.value)}
                              disabled={!selectedEmbeddingProvider}
                              className="w-full px-2 py-1.5 text-sm rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-60"
                            >
                              <option value="">Select Model</option>
                              {selectedEmbeddingProvider && getEmbeddingModels(selectedEmbeddingProvider).map(model => (
                                <option key={model.id} value={model.name}>
                                  {model.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5 rounded-md glassmorphic bg-amber-50/80 dark:bg-amber-900/30 p-2">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              <span>Changing embeddings requires reprocessing documents.</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={handleUpdateLLM}
                                disabled={isUpdatingConfiguration}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium transition-colors"
                              >
                                {isUpdatingConfiguration ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Updating...
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-3 h-3" />
                                    Save Changes
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => setIsEditingLLM(false)}
                                disabled={isUpdatingConfiguration}
                                className="inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 p-2">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{notebook.embedding_provider.name}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">{notebook.embedding_provider.model}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 rounded-lg glassmorphic bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Provider configuration not available (legacy notebook)
                    </div>
                  </div>
                )}
              </div>

              {/* Entity Types & Language Configuration */}
              <div className="rounded-lg glassmorphic bg-white/60 dark:bg-gray-800/60 p-3 shadow-sm mb-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                      <Tags className="w-3 h-3" />
                    </div>
                    Entity Types & Language
                  </h3>
                  {!isEditingEntityTypes && (
                    <button
                      onClick={() => setIsEditingEntityTypes(true)}
                      className="p-1.5 rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                      title="Edit Entity Types"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {isEditingEntityTypes ? (
                  <div className="space-y-3">
                    {/* Language Selection */}
                    <div className="rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-3">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Processing Language
                      </label>
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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

                    {/* Entity Types Management */}
                    <div className="rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-3 space-y-2">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Custom Entity Types
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customEntityType}
                          onChange={(e) => setCustomEntityType(e.target.value)}
                          placeholder="Add custom type (e.g., CUSTOM_TYPE)"
                          className="flex-1 px-2 py-1.5 text-sm rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>

                      {/* Selected Entity Types */}
                      {selectedEntityTypes.length > 0 && (
                        <div className="rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 p-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              Selected Types ({selectedEntityTypes.length})
                            </span>
                            {entityTypesData && (
                              <button
                                type="button"
                                onClick={() => setSelectedEntityTypes(entityTypesData.specialized_sets.minimal_set || [])}
                                className="text-[10px] font-medium text-purple-600 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200"
                              >
                                Reset to Minimal
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                            {selectedEntityTypes.map((type) => (
                              <span
                                key={type}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 text-[10px] font-medium"
                              >
                                {type}
                                <button
                                  type="button"
                                  onClick={() => removeEntityType(type)}
                                  className="hover:text-purple-600 dark:hover:text-purple-300"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Quick Add Categories */}
                      {entityTypesData && (
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Quick Add from Categories
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {Object.entries(entityTypesData.specialized_sets).map(([setName, types]) => (
                              <button
                                key={setName}
                                type="button"
                                onClick={() => setSelectedEntityTypes(types)}
                                className="rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 px-2 py-1.5 text-left text-[10px] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                <div className="font-medium text-gray-900 dark:text-gray-100 capitalize">
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
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={handleUpdateEntityTypes}
                        disabled={isUpdatingConfiguration}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-semibold transition-colors"
                      >
                        {isUpdatingConfiguration ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Updating...
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3" />
                            Save Entity Types
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingEntityTypes(false);
                          if (notebook.entity_types) {
                            setSelectedEntityTypes(notebook.entity_types);
                          }
                          if (notebook.language) {
                            setSelectedLanguage(notebook.language);
                          }
                        }}
                        disabled={isUpdatingConfiguration}
                        className="inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-3">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Language</div>
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{selectedLanguage.toUpperCase()}</div>
                    </div>
                    {selectedEntityTypes.length > 0 && (
                      <div className="rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-3">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                          Entity Types ({selectedEntityTypes.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                          {selectedEntityTypes.slice(0, 20).map((type) => (
                            <span
                              key={type}
                              className="px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 text-[10px] font-medium"
                            >
                              {type}
                            </span>
                          ))}
                          {selectedEntityTypes.length > 20 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-medium">
                              +{selectedEntityTypes.length - 20} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Document Reprocessing */}
              {reprocessingProgress && (
                <div className="rounded-lg glassmorphic bg-amber-50/80 dark:bg-amber-900/20 backdrop-blur-xl p-3 shadow-sm mb-3">
                  <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                      <RefreshCw className="w-3 h-3" />
                    </div>
                    Document Reprocessing
                  </h3>
                  <div className="rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 p-2 mb-2">
                    <div className="text-xs text-gray-800 dark:text-gray-300 mb-1">
                      {reprocessingProgress.message}
                    </div>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400">
                      {reprocessingProgress.note}
                    </div>
                  </div>
                  <button
                    onClick={() => handleReprocessDocuments(false)}
                    disabled={isReprocessingDocuments}
                    className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-semibold transition-colors"
                  >
                    {isReprocessingDocuments ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Reprocessing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        Reprocess All Documents
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* System Status */}
              <div className="rounded-lg glassmorphic bg-white/60 dark:bg-gray-800/60 p-3 shadow-sm mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  System Status
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Backend Connection</span>
                    <div className={`flex items-center gap-2 ${claraNotebookService.isBackendHealthy() ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${claraNotebookService.isBackendHealthy() ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                      <span className="font-semibold text-xs">{claraNotebookService.isBackendHealthy() ? 'Connected' : 'Disconnected'}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md glassmorphic bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm p-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Documents</span>
                    <span className="px-2 py-1 rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 text-xs font-semibold text-gray-900 dark:text-gray-100">{notebook.document_count}</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-lg glassmorphic bg-red-50/80 dark:bg-red-900/20 backdrop-blur-xl p-3 shadow-sm">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-3 h-3" />
                  </div>
                  Danger Zone
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={loadDocuments}
                    disabled={!claraNotebookService.isBackendHealthy()}
                    className="w-full inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-md glassmorphic bg-white/60 dark:bg-gray-800/60 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
                  >
                    Refresh All Documents
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm('⚠️ Rebuild Notebook?\n\nThis will:\n• Clear all indexed data (LightRAG storage)\n• Reset document processing states to "pending"\n• Reprocess ALL documents from scratch\n• Documents will be preserved and reprocessed\n\nThis is useful for recovery after power loss or corruption.\n\nContinue?')) {
                        try {
                          setIsReprocessingDocuments(true);
                          
                          // Call the new rebuild endpoint (clears storage + reprocesses in one step)
                          const response = await claraNotebookService.rebuildNotebook(notebook.id);
                          
                          // Check if any documents failed due to missing content
                          if (response.failed_no_content && response.failed_no_content > 0) {
                            // Try to recover from local storage
                            const shouldRecover = window.confirm(
                              `⚠️ ${response.failed_no_content} document(s) have no stored content!\n\n` +
                              `Would you like to try recovering them from local browser storage?\n\n` +
                              `This will re-upload the documents if they're available locally.`
                            );
                            
                            if (shouldRecover) {
                              let recovered = 0;
                              const failedDocs = documents.filter(doc => 
                                doc.status === 'failed' && 
                                doc.error?.includes('No content available')
                              );
                              
                              for (const doc of failedDocs) {
                                try {
                                  const localFile = await notebookFileStorage.getFileAsBlob(doc.id);
                                  if (localFile) {
                                    console.log(`Recovering ${localFile.filename} from local storage...`);
                                    
                                    // Re-upload the file
                                    await claraNotebookService.uploadDocuments(notebook.id, [localFile.file]);
                                    recovered++;
                                  }
                                } catch (error) {
                                  console.error(`Failed to recover ${doc.filename}:`, error);
                                }
                              }
                              
                              if (recovered > 0) {
                                setNotification({ 
                                  message: `Recovered ${recovered} document(s) from local storage and queued for processing!`, 
                                  type: 'success' 
                                });
                              } else {
                                setNotification({ 
                                  message: `Could not recover documents from local storage. Please re-upload manually.`, 
                                  type: 'error' 
                                });
                              }
                            } else {
                              setNotification({ 
                                message: `${response.queued_for_reprocessing} documents queued. ${response.failed_no_content} documents need manual re-upload.`, 
                                type: 'success' 
                              });
                            }
                          } else {
                            setNotification({ 
                              message: `Notebook rebuild initiated! ${response.queued_for_reprocessing} documents queued for reprocessing.`, 
                              type: 'success' 
                            });
                          }
                          
                          // Refresh documents to show new status
                          await loadDocuments();
                        } catch (error) {
                          console.error('Failed to rebuild notebook:', error);
                          setNotification({ 
                            message: error instanceof Error ? error.message : 'Failed to rebuild notebook', 
                            type: 'error' 
                          });
                        } finally {
                          setIsReprocessingDocuments(false);
                        }
                      }
                    }}
                    disabled={!claraNotebookService.isBackendHealthy() || isReprocessingDocuments}
                    className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-md bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-semibold transition-colors"
                  >
                    {isReprocessingDocuments ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Rebuilding...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        Rebuild Notebook
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      onNotebookDeleted();
                    }}
                    className="w-full inline-flex items-center justify-center px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                  >
                    Delete Notebook
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notebook Model Status Banner (pinned left, offset ~5rem). Auto-hide on success or manual dismiss. */}
      {(showModelStatus || modelStatus.overall_status !== 'success') && (
      <div className="fixed bottom-4 left-[12.5rem] z-40">
        <div className="glassmorphic rounded-xl shadow-2xl backdrop-blur-xl border border-white/30 dark:border-gray-700/30 p-3 w-[340px] bg-white/85 dark:bg-gray-900/80">
          <div className="flex items-center justify-between mb-2">
            <div className={`text-sm font-bold ${modelStatus.overall_status === 'success' ? 'text-gray-900 dark:text-white' : 'text-red-700 dark:text-red-300'}`}>{modelStatus.overall_status === 'success' ? 'Model Connectivity' : 'Notebook cannot connect'}</div>
            <button
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              onClick={async () => {
                try {
                  if (!claraNotebookService.isBackendHealthy()) return;
                  if (!notebook.llm_provider || !notebook.embedding_provider) {
                    setModelStatus(prev => ({
                      ...prev,
                      llm_accessible: false,
                      embedding_accessible: false,
                      overall_status: 'error',
                      llm_error: 'LLM provider not configured',
                      embedding_error: 'Embedding provider not configured',
                      lastChecked: new Date()
                    }));
                    setShowModelStatus(true);
                    return;
                  }
                  const validation = await claraNotebookService.validateModels({
                    name: notebook.name,
                    description: notebook.description,
                    llm_provider: notebook.llm_provider,
                    embedding_provider: notebook.embedding_provider,
                    entity_types: notebook.entity_types,
                    language: notebook.language
                  });
                  setModelStatus({
                    llm_accessible: validation.llm_accessible,
                    llm_error: validation.llm_error,
                    embedding_accessible: validation.embedding_accessible,
                    embedding_error: validation.embedding_error,
                    overall_status: validation.overall_status,
                    lastChecked: new Date()
                  });
                  if (validation.overall_status === 'success') {
                    if (!modelStatusDismissed) setShowModelStatus(false);
                  } else {
                    setShowModelStatus(true);
                  }
                } catch (e: any) {
                  setModelStatus(prev => ({
                    ...prev,
                    llm_accessible: false,
                    embedding_accessible: false,
                    overall_status: 'error',
                    llm_error: e?.message ?? 'Validation failed',
                    embedding_error: e?.message ?? 'Validation failed',
                    lastChecked: new Date()
                  }));
                  setShowModelStatus(true);
                }
              }}
            >
              Recheck
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300 font-medium">LLM</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${modelStatus.llm_accessible ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40'}`}
                    title={modelStatus.llm_error || ''}>
                <span className={`w-2 h-2 rounded-full ${modelStatus.llm_accessible ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                {modelStatus.llm_accessible ? 'Connected' : 'Failed'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300 font-medium">Embedding</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${modelStatus.embedding_accessible ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40'}`}
                    title={modelStatus.embedding_error || ''}>
                <span className={`w-2 h-2 rounded-full ${modelStatus.embedding_accessible ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                {modelStatus.embedding_accessible ? 'Connected' : 'Failed'}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              Last checked: {modelStatus.lastChecked ? modelStatus.lastChecked.toLocaleTimeString() : '—'}
            </div>
            <div className="flex justify-end mt-1">
              <button
                className="text-[10px] px-2 py-0.5 rounded-md border border-white/30 dark:border-gray-700/30 text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-800/50"
                onClick={() => { setShowModelStatus(false); setModelStatusDismissed(true); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default NotebookDetails_new;
