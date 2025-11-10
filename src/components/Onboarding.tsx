import {useState, useEffect} from 'react';
import {
    User,
    Mail,
    Globe,
    Check,
    Loader,
    Shield,
    Brain,
    Terminal,
    Zap,
    Bot,
    Database,
    Sunrise,
    Sun,
    Moon,
    Palette,
    Download,
    Server,
    HardDrive,
    Plus,
    Router,
    Edit3,
    X,
    ExternalLink,
    Image,
    Mic,
    FileText,
    Workflow,
    BookOpen,
    Blocks,
    Wrench,
    Network,
} from 'lucide-react';
import {db, Provider} from '../db';
import logoImage from '../assets/logo.png';

interface OnboardingProps {
    onComplete: () => void;
}

const Onboarding = ({onComplete}: OnboardingProps) => {
    const [section, setSection] = useState<'welcome' | 'setup'>('welcome');
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme_preference: 'dark' as 'light' | 'dark' | 'system', // Default to dark mode
        avatar_url: '',
        clara_core_url: 'http://localhost:8091',
        comfyui_url: 'http://localhost:8188',
        model_folder_path: '',
        openai_api_key: '',
        openai_base_url: 'https://api.openai.com/v1',
        api_type: 'clara_core' as 'clara_core' | 'openai'
    });
    const [loading, setLoading] = useState(false);
    const [claraStatus, setClaraStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [animationClass, setAnimationClass] = useState('animate-fadeIn');
    const [logoError, setLogoError] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [checkingModels, setCheckingModels] = useState(false);
    const [downloadingModel, setDownloadingModel] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    
    // Provider management state
    const [providers, setProviders] = useState<Provider[]>([]);
    const [showAddProviderModal, setShowAddProviderModal] = useState(false);
    const [setupMethod, setSetupMethod] = useState<'clara-core' | 'external-provider'>('clara-core');
    const [newProviderForm, setNewProviderForm] = useState({
        name: '',
        type: 'openai' as Provider['type'],
        baseUrl: '',
        apiKey: '',
        isEnabled: true
    });
    const [addingProvider, setAddingProvider] = useState(false);
    const [providerError, setProviderError] = useState<string | null>(null);
    const [selectedServices, setSelectedServices] = useState({
        comfyui: false,
        tts: false,
        n8n: false
    });
    const [serviceModes, setServiceModes] = useState<{[key: string]: 'docker' | 'manual'}>({
        comfyui: 'docker',
        tts: 'docker', // Always docker for Clara's service
        n8n: 'docker'
    });
    const [serviceUrls, setServiceUrls] = useState({
        comfyui: 'http://localhost:8188',
        tts: 'http://localhost:8765',
        n8n: 'http://localhost:5678'
    });
    const [serviceStatuses, setServiceStatuses] = useState<{[key: string]: 'checking' | 'available' | 'unavailable' | 'starting' | 'pulling'}>({});
    const [serviceStartupProgress, setServiceStartupProgress] = useState<{[key: string]: string}>({});
    const [_featureConfig, setFeatureConfig] = useState({
        comfyUI: true,
        n8n: true,
        ragAndTts: true,
        claraCore: true
    });
    
    // Custom model path management
    const [isSettingCustomPath, setIsSettingCustomPath] = useState(false);
    const [folderPickerMessage, setFolderPickerMessage] = useState<string | null>(null);
    const [scannedModelsCount, setScannedModelsCount] = useState(0);
    const [generatingConfig, setGeneratingConfig] = useState(false);
    const [configProgress, setConfigProgress] = useState<{
        status: string;
        progress: number;
        currentStep: string;
        processedModels: number;
        totalModels: number;
    } | null>(null);

    // Real-time progress tracking for initialization
    const [initializationStatus, setInitializationStatus] = useState<string>('');
    const [initializationProgress, setInitializationProgress] = useState<number>(0);
    const [initializationDetails, setInitializationDetails] = useState<string[]>([]);
    const [binaryDownloadProgress, setBinaryDownloadProgress] = useState<number>(0);
    const [binaryDownloadStatus, setBinaryDownloadStatus] = useState<string>('');

    // Use claraStatus to avoid lint warning
    console.log('Clara status:', claraStatus);

    // Apply theme immediately when selected
    useEffect(() => {
        const htmlElement = document.documentElement;
        if (formData.theme_preference === 'dark') {
            htmlElement.classList.add('dark');
        } else {
            htmlElement.classList.remove('dark');
        }
    }, [formData.theme_preference]);

    // Auto-check Clara Core status when reaching step 4
    useEffect(() => {
        if (step === 4) {
            checkClaraCore();
        }
    }, [step]);

    // Load providers when reaching step 5
    useEffect(() => {
        if (step === 5) {
            loadProviders();
        }
    }, [step]);

    // Clean up any active downloads when component unmounts
    useEffect(() => {
        return () => {
            // Cleanup is handled by Clara Core API - downloads continue in background
            console.log('Onboarding unmounting, downloads continue in Clara Core');
        };
    }, []);

    // Listen for background service status updates
    useEffect(() => {
        const handleServiceStatusUpdate = (event: any) => {
            const { serviceName, status, error, progress } = event.detail || {};
            
            if (serviceName && status) {
                // Update service status
                if (status === 'running') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'available'}));
                    setServiceStartupProgress(prev => ({...prev, [serviceName]: ''}));
                } else if (status === 'starting') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'starting'}));
                    if (progress) {
                        setServiceStartupProgress(prev => ({...prev, [serviceName]: progress}));
                    }
                } else if (status === 'error') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'unavailable'}));
                    setServiceStartupProgress(prev => ({...prev, [serviceName]: error || 'Service failed to start'}));
                } else if (status === 'stopped') {
                    setServiceStatuses(prev => ({...prev, [serviceName]: 'unavailable'}));
                    setServiceStartupProgress(prev => ({...prev, [serviceName]: ''}));
                }
            }
        };

        // Listen for app initialization status updates
        const handleAppStatusUpdate = (event: any) => {
            const { status, message, progress } = event.detail || {};
            
            console.log('🔄 App status update:', { status, message, progress });
            
            // Handle different initialization phases
            switch (status) {
                case 'downloading-binaries':
                    setInitializationStatus('Downloading required binaries...');
                    setBinaryDownloadStatus('Starting download...');
                    setInitializationProgress(10);
                    setInitializationDetails(prev => [...prev, 'Starting binary download']);
                    break;
                    
                case 'binaries-ready':
                    setInitializationStatus('Binaries ready');
                    setBinaryDownloadStatus('Download complete');
                    setBinaryDownloadProgress(100);
                    setInitializationProgress(40);
                    setInitializationDetails(prev => [...prev, 'Binary download completed']);
                    break;
                    
                case 'binaries-error':
                    setInitializationStatus('Binary download failed');
                    setBinaryDownloadStatus(`Error: ${message}`);
                    setInitializationDetails(prev => [...prev, `Binary download failed: ${message}`]);
                    break;
                    
                case 'validating':
                    setInitializationStatus('Validating system...');
                    setInitializationProgress(20);
                    setInitializationDetails(prev => [...prev, 'Validating system resources']);
                    break;
                    
                case 'initializing':
                    setInitializationStatus('Initializing services...');
                    setInitializationProgress(60);
                    setInitializationDetails(prev => [...prev, 'Setting up service configuration']);
                    break;
                    
                case 'checking-docker':
                    setInitializationStatus('Checking Docker...');
                    setInitializationProgress(30);
                    setInitializationDetails(prev => [...prev, 'Checking Docker availability']);
                    break;
                    
                case 'ready':
                    setInitializationStatus('Ready!');
                    setInitializationProgress(100);
                    setInitializationDetails(prev => [...prev, 'Initialization complete']);
                    break;
                    
                default:
                    if (message) {
                        setInitializationStatus(message);
                        setInitializationDetails(prev => [...prev, message]);
                    }
                    break;
            }
        };

        // Listen for background service status events
        window.addEventListener('background-service-status', handleServiceStatusUpdate);
        
        // Listen for app initialization status events
        if ((window as any).electronAPI?.onServiceStatusUpdate) {
            (window as any).electronAPI.onServiceStatusUpdate(handleAppStatusUpdate);
        }
        
        // Also listen for IPC events directly if available
        if ((window as any).electronAPI?.on) {
            (window as any).electronAPI.on('service-status-update', handleAppStatusUpdate);
        }
        
        return () => {
            window.removeEventListener('background-service-status', handleServiceStatusUpdate);
        };
    }, []);



    const checkClaraCore = async () => {
        setClaraStatus('success'); // Clara Core is always available
        setCheckingModels(true);
        setDownloadError(null);
        
        try {
            // Use Clara Core API to check for existing models
            const response = await fetch(`${formData.clara_core_url}/v1/models`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Clara Core models check:', data);
                
                // API returns: { object: "list", data: [{ id, object, created, owned_by, ... }] }
                if (data.data && Array.isArray(data.data)) {
                    const modelNames = data.data.map((model: any) => model.id);
                    setAvailableModels(modelNames);
                } else {
                    setAvailableModels([]);
                }
            } else {
                console.warn('Failed to fetch models from Clara Core:', response.statusText);
                setAvailableModels([]);
            }
        } catch (error) {
            console.error('Error checking existing models:', error);
            setAvailableModels([]);
        } finally {
            setCheckingModels(false);
        }
    };

    const handleGenerateConfig = async () => {
        setGeneratingConfig(true);
        setConfigProgress({
            status: 'starting',
            progress: 0,
            currentStep: 'Initializing configuration generation & Downloading backend...',
            processedModels: 0,
            totalModels: scannedModelsCount
        });
        
        try {
            // Start config regeneration
            const regenerateResponse = await fetch(`${formData.clara_core_url}/api/config/regenerate-from-db`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    options: {
                        enableJinja: true,
                        throughputFirst: true,
                        preferredContext: 65536
                    }
                })
            });
            
            if (!regenerateResponse.ok) {
                throw new Error('Failed to start config generation');
            }
            
            // Poll for progress using the /api/setup/progress endpoint
            const pollProgress = setInterval(async () => {
                try {
                    const progressResponse = await fetch(`${formData.clara_core_url}/api/setup/progress`);
                    
                    if (progressResponse.ok) {
                        const progressData = await progressResponse.json();
                        
                        setConfigProgress({
                            status: progressData.status,
                            progress: progressData.progress || 0,
                            currentStep: progressData.current_step || 'Processing...',
                            processedModels: progressData.processed_models || 0,
                            totalModels: progressData.total_models || scannedModelsCount
                        });
                        
                        // Check if completed
                        if (progressData.completed || progressData.status === 'completed') {
                            clearInterval(pollProgress);
                            
                            // Refresh available models
                            await checkClaraCore();
                            
                            setGeneratingConfig(false);
                            setFolderPickerMessage(`✅ Configuration generated successfully! ${progressData.total_models || scannedModelsCount} models are ready to use.`);
                        } else if (progressData.status === 'error') {
                            clearInterval(pollProgress);
                            setGeneratingConfig(false);
                            setFolderPickerMessage(`❌ Config generation failed: ${progressData.error || 'Unknown error'}`);
                        }
                    }
                } catch (error) {
                    console.error('Error polling config progress:', error);
                }
            }, 1000); // Poll every second
            
            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(pollProgress);
                if (generatingConfig) {
                    setGeneratingConfig(false);
                    setFolderPickerMessage('⚠️ Config generation timed out. Please check Clara Core logs.');
                }
            }, 5 * 60 * 1000);
            
        } catch (error: any) {
            console.error('Error generating config:', error);
            setGeneratingConfig(false);
            setFolderPickerMessage(`❌ Failed to generate config: ${error.message}`);
        }
    };

    // const checkOllamaModels = async (url: string) => {
    //     setCheckingModels(true);
    //     try {
    //         const client = new OllamaClient(url);
    //         const models = await client.listModels();
    //         setAvailableModels(models.map(model => model.name));
    //     } catch (error) {
    //         console.error('Error checking Ollama models:', error);
    //         setAvailableModels([]);
    //     } finally {
    //         setCheckingModels(false);
    //     }
    // };

    const handleModelDownload = async () => {
        setDownloadingModel(true);
        setDownloadProgress(0);
        setDownloadError(null);

        try {
            // Use Clara Core API to download Qwen3 0.6B Q8_0 model from Unsloth
            const modelUrl = 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf';
            const modelId = 'qwen3-0.6b';
            const fileName = 'Qwen3-0.6B-Q8_0.gguf';
            
            // Start download via Clara Core API
            const downloadResponse = await fetch(`${formData.clara_core_url}/api/models/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: modelUrl,
                    modelId: modelId,
                    filename: fileName
                })
            });

            if (!downloadResponse.ok) {
                const errorText = await downloadResponse.text();
                throw new Error(`Download request failed (${downloadResponse.status}): ${errorText || downloadResponse.statusText}`);
            }

            const downloadData = await downloadResponse.json();
            console.log('Download API response:', downloadData);
            
            // API returns: { downloadId, status, modelId, filename }
            const downloadId = downloadData.downloadId;

            if (!downloadId) {
                console.error('Invalid download response:', downloadData);
                throw new Error('Failed to start download - no download ID returned');
            }

            console.log('Download started successfully. ID:', downloadId, 'Status:', downloadData.status);

            // Poll for download progress
            const pollInterval = setInterval(async () => {
                try {
                    const progressResponse = await fetch(`${formData.clara_core_url}/api/models/downloads/${downloadId}`);
                    
                    if (!progressResponse.ok) {
                        clearInterval(pollInterval);
                        setDownloadError('Failed to check download progress');
                        setDownloadingModel(false);
                        return;
                    }

                    const progressData = await progressResponse.json();
                    console.log('Download progress data:', progressData);
                    
                    // Based on API docs, the response structure is:
                    // { id, modelId, filename, url, status, progress, downloadedBytes, totalBytes, speed, eta }
                    
                    // Update progress - handle both percentage and 0-1 range
                    if (progressData.progress !== undefined) {
                        const progress = progressData.progress > 1 
                            ? Math.round(progressData.progress) 
                            : Math.round(progressData.progress * 100);
                        setDownloadProgress(progress);
                    }

                    // Check if download is complete
                    if (progressData.status === 'completed') {
                        clearInterval(pollInterval);
                        setDownloadProgress(100);
                        setDownloadingModel(false);
                        
                        // Store model count
                        setScannedModelsCount(1); // Downloaded 1 model
                        
                        // Automatically generate config after download
                        await handleGenerateConfig();
                    } else if (progressData.status === 'error' || progressData.status === 'failed') {
                        clearInterval(pollInterval);
                        setDownloadError(progressData.error || 'Download failed');
                        setDownloadProgress(0);
                        setDownloadingModel(false);
                    }
                } catch (error: any) {
                    console.error('Error checking download progress:', error);
                    clearInterval(pollInterval);
                    setDownloadError(error.message || 'Failed to check download progress');
                    setDownloadingModel(false);
                }
            }, 2000); // Poll every 2 seconds

            // Set timeout for download (30 minutes)
            setTimeout(() => {
                clearInterval(pollInterval);
                if (downloadingModel) {
                    setDownloadError('Download timeout - please try again');
                    setDownloadingModel(false);
                }
            }, 30 * 60 * 1000);

        } catch (error: any) {
            console.error('Model download error:', error);
            setDownloadError(error.message || 'Download failed');
            setDownloadProgress(0);
            setDownloadingModel(false);
        }
    };

    const checkModelsAfterDownload = async () => {
        // Brief delay to ensure model is registered in Clara Core
        setTimeout(async () => {
            try {
                // Use Clara Core API to get available models
                const response = await fetch(`${formData.clara_core_url}/v1/models`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Available models after download:', data);
                    
                    // API returns: { object: "list", data: [{ id, object, created, owned_by, ... }] }
                    if (data.data && Array.isArray(data.data)) {
                        const modelNames = data.data.map((model: any) => model.id);
                        setAvailableModels(modelNames);
                    }
                } else {
                    console.error('Failed to fetch models:', response.statusText);
                }
            } catch (error) {
                console.error('Error refreshing models after download:', error);
            }
        }, 3000); // Increased delay to give Clara Core time to register the model
    };

    const checkRealServiceAvailability = async () => {
        try {
            // First check Docker services using the existing IPC handler
            if (window.electronAPI?.invoke) {
                const dockerStatus = await window.electronAPI.invoke('check-docker-services');
                
                console.log('Docker service status:', dockerStatus);
                
                // Update service statuses based on Docker data
                const newStatuses: {[key: string]: 'checking' | 'available' | 'unavailable' | 'starting' | 'pulling'} = {};
                
                // Set ComfyUI status
                newStatuses.comfyui = dockerStatus.comfyuiAvailable ? 'available' : 'unavailable';
                
                // Set TTS (Python backend) status
                newStatuses.tts = dockerStatus.pythonAvailable ? 'available' : 'unavailable';
                
                // Set N8N status
                newStatuses.n8n = dockerStatus.n8nAvailable ? 'available' : 'unavailable';
                
                setServiceStatuses(newStatuses);
                
                // If Docker is not available, offer to start it
                if (!dockerStatus.dockerAvailable && dockerStatus.message === 'Docker is not running') {
                    setServiceStartupProgress(prev => ({
                        ...prev,
                        comfyui: 'Docker Desktop is installed but not running',
                        tts: 'Docker Desktop is installed but not running',
                        n8n: 'Docker Desktop is installed but not running'
                    }));
                } else if (!dockerStatus.dockerAvailable) {
                    setServiceStartupProgress(prev => ({
                        ...prev,
                        comfyui: dockerStatus.message || 'Docker not available',
                        tts: dockerStatus.message || 'Docker not available',
                        n8n: dockerStatus.message || 'Docker not available'
                    }));
                }
                
                // Also get enhanced status for additional service info
                const enhancedStatus = await window.electronAPI.invoke('service-config:get-enhanced-status');
                
                if (enhancedStatus) {
                    // Update service URLs and modes from enhanced status
                    if (enhancedStatus.comfyui?.serviceUrl) {
                        setServiceUrls(prev => ({...prev, comfyui: enhancedStatus.comfyui.serviceUrl}));
                    }
                    if (enhancedStatus.comfyui?.deploymentMode) {
                        setServiceModes(prev => ({...prev, comfyui: enhancedStatus.comfyui.deploymentMode}));
                    }
                    if (enhancedStatus.n8n?.serviceUrl) {
                        setServiceUrls(prev => ({...prev, n8n: enhancedStatus.n8n.serviceUrl}));
                    }
                    if (enhancedStatus.n8n?.deploymentMode) {
                        setServiceModes(prev => ({...prev, n8n: enhancedStatus.n8n.deploymentMode}));
                    }
                }
            }
        } catch (error) {
            console.error('Error checking real service availability:', error);
            // Set all to unavailable on error
            setServiceStatuses({
                comfyui: 'unavailable',
                tts: 'unavailable',
                n8n: 'unavailable'
            });
        }
    };

    const startDockerDesktop = async () => {
        try {
            if (window.electronAPI?.invoke) {
                // Use docker-detect-installations to check if Docker is available first
                try {
                    const installations = await window.electronAPI.invoke('docker-detect-installations');
                    if (!installations || installations.length === 0) {
                        setServiceStartupProgress(prev => ({
                            ...prev,
                            comfyui: 'Docker Desktop not found on system',
                            tts: 'Docker Desktop not found on system',
                            n8n: 'Docker Desktop not found on system'
                        }));
                        return;
                    }
                } catch (detectionError) {
                    console.log('Docker detection failed, trying alternative approach');
                }
                
                // For now, let's use the existing service startup approach
                // This will attempt to start the Docker containers, which will trigger Docker Desktop startup
                setServiceStartupProgress(prev => ({
                    ...prev,
                    comfyui: 'Starting Docker Desktop...',
                    tts: 'Starting Docker Desktop...',
                    n8n: 'Starting Docker Desktop...'
                }));
                
                // Try to start a Docker service to trigger Docker Desktop startup
                try {
                    const result = await window.electronAPI.invoke('start-docker-service', 'comfyui');
                    if (result.success) {
                        setServiceStartupProgress(prev => ({
                            ...prev,
                            comfyui: 'Docker Desktop started successfully',
                            tts: 'Docker Desktop started successfully',
                            n8n: 'Docker Desktop started successfully'
                        }));
                        
                        // Wait a bit and then recheck services
                        setTimeout(() => {
                            checkRealServiceAvailability();
                        }, 5000);
                    } else {
                        setServiceStartupProgress(prev => ({
                            ...prev,
                            comfyui: result.error || 'Failed to start Docker Desktop',
                            tts: result.error || 'Failed to start Docker Desktop',
                            n8n: result.error || 'Failed to start Docker Desktop'
                        }));
                    }
                } catch (serviceError) {
                    setServiceStartupProgress(prev => ({
                        ...prev,
                        comfyui: 'Please start Docker Desktop manually',
                        tts: 'Please start Docker Desktop manually',
                        n8n: 'Please start Docker Desktop manually'
                    }));
                }
            }
        } catch (error) {
            console.error('Error starting Docker Desktop:', error);
            setServiceStartupProgress(prev => ({
                ...prev,
                comfyui: 'Please start Docker Desktop manually',
                tts: 'Please start Docker Desktop manually',
                n8n: 'Please start Docker Desktop manually'
            }));
        }
    };

    const loadFeatureConfig = async () => {
        try {
            if ((window as any).featureConfig?.getFeatureConfig) {
                const config = await (window as any).featureConfig.getFeatureConfig();
                if (config) {
                    setFeatureConfig(config);
                    
                    // During onboarding, don't auto-check services based on existing config
                    // Always start with unchecked services to let user make explicit choice
                    // Services remain unchecked by default (as set in initial state)
                }
            }
        } catch (error) {
            console.error('Failed to load feature configuration:', error);
        }
    };

    // Note: Services are not started during onboarding
    // They will be initialized after the main app starts up based on user preferences

    // Check service availability when reaching step 6
    useEffect(() => {
        if (step === 6) {
            // Check all services using real service manager
            checkRealServiceAvailability();
            loadFeatureConfig();
        }
    }, [step]);

    const handleSubmit = async () => {
        // Save personal info to database
        await db.updatePersonalInfo({
            name: formData.name,
            email: formData.email,
            timezone: formData.timezone,
            theme_preference: formData.theme_preference,
            avatar_url: formData.avatar_url,
            startup_settings: {
                autoStart: false,
                startMinimized: false,
                startFullscreen: false,
                checkForUpdates: true,
                restoreLastSession: true
            }
        });

        // Initialize API config with Ollama URL, ComfyUI URL, and OpenAI settings
        await db.updateAPIConfig({
            ollama_base_url: formData.clara_core_url,
            comfyui_base_url: formData.comfyui_url,
            openai_api_key: formData.openai_api_key,
            openai_base_url: formData.openai_base_url,
            api_type: formData.api_type
        });

        // Save user's explicit service selections
        if ((window as any).featureConfig?.updateFeatureConfig) {
            try {
                const newConfig = {
                    comfyUI: selectedServices.comfyui,
                    ragAndTts: false, // Don't auto-enable during onboarding to prevent downloads
                    n8n: selectedServices.n8n,
                    claraCore: true, // Always enabled
                    userConsentGiven: true, // Flag to indicate user has completed onboarding
                    onboardingMode: true, // Flag to indicate this is during onboarding
                    servicePreferences: {
                        // Store actual user preferences separately
                        comfyUI: selectedServices.comfyui,
                        ragAndTts: selectedServices.tts,
                        n8n: selectedServices.n8n,
                        claraCore: true
                    }
                };
                await (window as any).featureConfig.updateFeatureConfig(newConfig);
                console.log('User service selections saved:', selectedServices);
                
                // Dispatch event to notify other components about the config change
                const event = new CustomEvent('feature-config-updated', { detail: newConfig });
                window.dispatchEvent(event);
                console.log('🔄 Onboarding - Dispatched feature-config-updated event');
            } catch (error) {
                console.error('Failed to save service selections:', error);
            }
        }

        // Create user consent file for watchdog service
        if ((window as any).electronAPI?.createUserConsentFile) {
            try {
                await (window as any).electronAPI.createUserConsentFile({
                    hasConsented: true,
                    onboardingMode: true, // Flag to indicate this is during onboarding
                    autoStartServices: false, // Don't auto-start services during onboarding
                    services: {
                        comfyui: selectedServices.comfyui,
                        python: false, // Don't auto-start Python backend during onboarding
                        n8n: selectedServices.n8n,
                        'clara-core': true // Always enabled
                    },
                    servicePreferences: {
                        // Store user preferences separately from auto-start decisions
                        comfyui: selectedServices.comfyui,
                        tts: selectedServices.tts,
                        n8n: selectedServices.n8n,
                        'clara-core': true
                    },
                    timestamp: new Date().toISOString(),
                    onboardingVersion: '1.0'
                });
                console.log('User consent file created for watchdog service (onboarding mode)');
            } catch (error) {
                console.error('Failed to create user consent file:', error);
            }
        }

        // Save service configuration URLs for selected services
        if ((window as any).electronAPI?.invoke) {
            try {
                const configResults = [];

                for (const [serviceName, enabled] of Object.entries(selectedServices)) {
                    if (enabled) {
                        // Skip TTS service during onboarding to prevent automatic Python backend startup
                        if (serviceName === 'tts') {
                            console.log('TTS service preference noted but not configured during onboarding to prevent auto-start');
                            continue;
                        }
                        
                        const mode = serviceModes[serviceName as keyof typeof serviceModes];
                        const serviceUrl = serviceUrls[serviceName as keyof typeof serviceUrls];
                        
                        // Save service configuration
                        if (mode === 'manual' && serviceUrl) {
                            const result = await (window as any).electronAPI.invoke('service-config:set-manual-url', serviceName, serviceUrl);
                            configResults.push({ service: serviceName, mode: 'manual', url: serviceUrl, success: result.success, error: result.error });
                            
                            if (result.success) {
                                console.log(`✓ Service ${serviceName} URL saved: ${serviceUrl}`);
                            } else {
                                console.error(`✗ Failed to save ${serviceName} URL:`, result.error);
                            }
                        } else if (mode === 'docker') {
                            // For Docker services, save the mode without URL (uses defaults)
                            const result = await (window as any).electronAPI.invoke('service-config:set-config', serviceName, 'docker', null);
                            configResults.push({ service: serviceName, mode: 'docker', success: result.success, error: result.error });
                            
                            if (result.success) {
                                console.log(`✓ Service ${serviceName} configured for Docker mode`);
                            } else {
                                console.error(`✗ Failed to configure ${serviceName} for Docker:`, result.error);
                            }
                        }
                    }
                }
                
                // Verify configurations were saved by retrieving them
                try {
                    const savedConfigs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
                    const verificationResults = [];
                    
                    for (const result of configResults) {
                        if (result.success) {
                            const savedConfig = savedConfigs[result.service];
                            if (savedConfig) {
                                if (result.mode === 'manual' && savedConfig.serviceUrl === result.url) {
                                    verificationResults.push(`✓ ${result.service}: ${result.url}`);
                                } else if (result.mode === 'docker' && savedConfig.deploymentMode === 'docker') {
                                    verificationResults.push(`✓ ${result.service}: Docker mode`);
                                } else {
                                    verificationResults.push(`⚠ ${result.service}: Configuration mismatch`);
                                }
                            } else {
                                verificationResults.push(`⚠ ${result.service}: Not found in saved configurations`);
                            }
                        } else {
                            verificationResults.push(`✗ ${result.service}: ${result.error}`);
                        }
                    }
                    
                    if (verificationResults.length > 0) {
                        console.log('Service configuration verification:', verificationResults);
                    }
                } catch (verifyError) {
                    console.warn('Could not verify service configurations:', verifyError);
                }
                
                // Explicitly disable Python/TTS service during onboarding to prevent auto-downloads
                try {
                    const disablePythonResult = await (window as any).electronAPI.invoke('service-config:disable-service', 'python');
                    if (disablePythonResult.success) {
                        console.log('✓ Python/TTS service explicitly disabled during onboarding');
                    } else {
                        console.warn('⚠ Could not disable Python/TTS service:', disablePythonResult.error);
                    }
                } catch (disableError) {
                    console.warn('Could not disable Python/TTS service during onboarding:', disableError);
                }
                
            } catch (error) {
                console.error('Failed to save service configurations:', error);
            }
        }
    };

    // New function to handle the complete launch process with waiting for initialization
    const handleLaunchClara = async () => {
        setLoading(true);
        
        try {
            // Step 1: Save all preferences and configurations
            setInitializationStatus('Saving preferences...');
            setInitializationProgress(5);
            setInitializationDetails(['Saving user preferences and configurations']);
            
            await handleSubmit();
            
            setInitializationStatus('Preferences saved');
            setInitializationProgress(10);
            setInitializationDetails(prev => [...prev, 'Preferences saved successfully']);
            
            // Step 2: Request backend initialization and wait for completion
            setInitializationStatus('Initializing Clara Core...');
            setInitializationDetails(prev => [...prev, 'Starting backend initialization']);
            
            // Trigger backend initialization if not already started
            if ((window as any).electronAPI?.requestInitialization) {
                const initResult = await (window as any).electronAPI.requestInitialization();
                if (initResult.success) {
                    setInitializationDetails(prev => [...prev, `Initialization ${initResult.status}`]);
                }
            }
            
            // Set up a timeout to prevent indefinite waiting
            const maxWaitTime = 120000; // 2 minutes
            
            // Create a promise that resolves when initialization is complete
            const waitForInitialization = new Promise<boolean>((resolve) => {
                let statusCheckInterval: NodeJS.Timeout;
                let timeoutId: NodeJS.Timeout;
                
                // Check initialization status every 1 second
                statusCheckInterval = setInterval(async () => {
                    try {
                        if ((window as any).electronAPI?.getInitializationStatus) {
                            const status = await (window as any).electronAPI.getInitializationStatus();
                            
                            if (status.success && status.complete) {
                                clearInterval(statusCheckInterval);
                                clearTimeout(timeoutId);
                                resolve(true);
                            } else if (status.success && status.inProgress) {
                                // Update progress based on service status updates we're receiving
                                const currentProgress = Math.min(90, initializationProgress + 1);
                                setInitializationProgress(currentProgress);
                            }
                        }
                    } catch (error) {
                        console.warn('Error checking initialization status:', error);
                    }
                }, 1000);
                
                // Timeout after maxWaitTime
                timeoutId = setTimeout(() => {
                    clearInterval(statusCheckInterval);
                    resolve(false); // Timeout, but don't fail
                }, maxWaitTime);
            });
            
            const initializationComplete = await waitForInitialization;
            
            if (initializationComplete) {
                setInitializationStatus('Clara is ready!');
                setInitializationProgress(100);
                setInitializationDetails(prev => [...prev, 'Clara initialization complete']);
                
                // Wait a moment to show the completion message
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                // Timeout - but still proceed to avoid blocking the user
                setInitializationStatus('Launching Clara (initialization continuing in background)...');
                setInitializationProgress(80);
                setInitializationDetails(prev => [...prev, 'Initialization taking longer than expected, proceeding with launch']);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Complete onboarding
            onComplete();
            
        } catch (error) {
            console.error('Error during Clara launch:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setInitializationStatus('Error occurred, but launching anyway...');
            setInitializationDetails(prev => [...prev, `Error: ${errorMessage}`]);
            
            // Still proceed to avoid blocking the user
            await new Promise(resolve => setTimeout(resolve, 1000));
            onComplete();
        } finally {
            setLoading(false);
        }
    };

    const handleNextSection = (nextSection: 'welcome' | 'setup') => {
        setAnimationClass('animate-fadeOut');
        setTimeout(() => {
            setSection(nextSection);
            if (nextSection === 'setup') setStep(1);
            setAnimationClass('animate-fadeIn');
        }, 300);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (section === 'setup') {
                if (step < 8) { // Now 8 steps
                    if ((step === 1 && formData.name) ||
                        (step === 2 && formData.email) ||
                        step === 3 || step === 4 || step === 5 || step === 6 || step === 7) {
                        setStep(step + 1);
                    }
                } else {
                    if (formData.timezone) {
                        handleSubmit();
                    }
                }
            }
        }
    };

    // Load existing providers
    const loadProviders = async () => {
        try {
            const allProviders = await db.getAllProviders();
            setProviders(allProviders);
        } catch (error) {
            console.error('Error loading providers:', error);
        }
    };

    // Provider management functions
    const getProviderIcon = (type: Provider['type']) => {
        switch (type) {
            case 'claras-pocket':
                return Bot;
            case 'openai':
                return Zap;
            case 'openai_compatible':
                return Router;
            case 'ollama':
                return Server;
            case 'openrouter':
                return ExternalLink;
            default:
                return Globe;
        }
    };

    const getDefaultProviderConfig = (type: Provider['type']) => {
        switch (type) {
            case 'openai':
                return { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' };
            case 'openai_compatible':
                return { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
            case 'openrouter':
                return { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
            case 'ollama':
                return { baseUrl: 'http://localhost:11434/v1', name: 'Ollama' };
            default:
                return { baseUrl: '', name: '' };
        }
    };

    const handleAddProvider = async () => {
        setAddingProvider(true);
        setProviderError(null);
        try {
            const providerId = await db.addProvider({
                name: newProviderForm.name,
                type: newProviderForm.type,
                baseUrl: newProviderForm.baseUrl,
                apiKey: newProviderForm.apiKey,
                isEnabled: newProviderForm.isEnabled,
                isPrimary: true // Set as primary since it's the first one being added during onboarding
            });

            // Set this provider as the API type
            setFormData(prev => ({...prev, api_type: 'external' as any}));

            // Reload providers
            await loadProviders();

            setShowAddProviderModal(false);
            setNewProviderForm({
                name: '',
                type: 'openai',
                baseUrl: '',
                apiKey: '',
                isEnabled: true
            });
        } catch (error: any) {
            console.error('Error adding provider:', error);
            setProviderError(error.message || 'Failed to add provider');
        } finally {
            setAddingProvider(false);
        }
    };

    const handleDeleteProvider = async (providerId: string) => {
        try {
            await db.deleteProvider(providerId);
            await loadProviders();
        } catch (error) {
            console.error('Error deleting provider:', error);
        }
    };

    // Check if user has configured something to proceed
    const hasValidSetup = () => {
        if (setupMethod === 'clara-core') {
            // User must have models available and NOT be in the middle of config generation
            return availableModels.length > 0 && !generatingConfig;
        } else {
            const enabledProviders = providers.filter(p => p.isEnabled);
            return enabledProviders.length > 0;
        }
    };

    // Features of Clara - Enhanced showcase
    const features = [
        {
            title: "Privacy First",
            description: "Your data never leaves your device unless you explicitly allow it. All processing happens locally.",
            icon: <Shield className="w-8 h-8 text-sakura-500"/>,
            highlight: "100% Local"
        },
        {
            title: "Powerful AI",
            description: "Access state-of-the-art AI models through Clara Core with built-in model management and optimization.",
            icon: <Brain className="w-8 h-8 text-sakura-500"/>,
            highlight: "8+ AI Models"
        },
        {
            title: "Visual App Builder",
            description: "Create custom AI applications with our intuitive node-based flow builder and N8N integration.",
            icon: <Terminal className="w-8 h-8 text-sakura-500"/>,
            highlight: "No-Code"
        },
        {
            title: "Rich Ecosystem",
            description: "Integrated ComfyUI, Jupyter notebooks, TTS services, and document processing capabilities.",
            icon: <Database className="w-8 h-8 text-sakura-500"/>,
            highlight: "All-in-One"
        }
    ];

    // Key capabilities to showcase with icons
    const capabilities = [
        {
            name: "Image Generation (ComfyUI)",
            icon: <Image className="w-4 h-4" />
        },
        {
            name: "Text-to-Speech & Voice",
            icon: <Mic className="w-4 h-4" />
        },
        {
            name: "Document Processing (Graph RAG)",
            icon: <FileText className="w-4 h-4" />
        },
        {
            name: "Inbuilt Agent and Workflow Automation",
            icon: <Workflow className="w-4 h-4" />
        },
        {
            name: "Notebooks (Rag)",
            icon: <BookOpen className="w-4 h-4" />
        },
        {
            name: "LumaUI Studio (Web App Builder)",
            icon: <Blocks className="w-4 h-4" />
        },
        {
            name: "MCP Support",
            icon: <Wrench className="w-4 h-4" />
        },
        {
            name: "Multi-Provider Support",
            icon: <Network className="w-4 h-4" />
        }
    ];

    // Helper function to get timezone display name with UTC offset
    const getTimezoneDisplay = (timezone: string) => {
        try {
            const offset = getTimezoneOffset(timezone);
            const offsetString = offset >= 0 ? `+${offset}` : `${offset}`;
            return `${timezone} (UTC${offsetString})`;
        } catch {
            return timezone;
        }
    };

    // Helper function to get timezone offset in hours
    const getTimezoneOffset = (timezone: string) => {
        try {
            const now = new Date();
            const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
            return Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60));
        } catch {
            return 0;
        }
    };

    // Welcome section
    if (section === "welcome") {
        return (
            <div
                className="fixed inset-0 bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 z-50 overflow-y-auto">
                <div className="min-h-screen w-full flex flex-col">
                    <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                        <div className="w-full max-w-7xl mx-auto">
                            <div className="flex flex-col items-center gap-8 lg:gap-12">
                                {/* Hero Section */}
                                <div className="text-center space-y-4 sm:space-y-6 max-w-4xl">
                                    <div className="flex justify-center">
                                        <div className="relative">
                                            <div
                                                className="absolute inset-0 bg-sakura-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                                            {!logoError ? (
                                                <img
                                                    src={logoImage}
                                                    alt="Clara Logo"
                                                    className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover shadow-2xl"
                                                    onError={() => setLogoError(true)}
                                                />
                                            ) : (
                                                <div className="relative bg-white dark:bg-gray-800 rounded-full p-4 sm:p-5 shadow-2xl">
                                                    <Bot className="w-12 h-12 sm:w-14 sm:h-14 text-sakura-500" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white animate-fadeIn leading-tight mb-4">
                                            <span className="text-white-500">Clara<span className="bg-gradient-to-r from-pink-400 via-purple-500 to-pink-400 bg-clip-text text-transparent">Verse</span></span>
                                        </h1>
                                        <p className="text-lg sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 animate-fadeInUp delay-200 leading-relaxed">
                                            Your privacy-first AI Workspace that keeps your data local and private. <br />While combining all the tools you need in one place.
                                        </p>
                                    </div>
                                </div>

                                {/* Feature Cards - Enhanced */}
                                <div className="w-full max-w-6xl">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-fadeInUp delay-400">
                                        {features.map((feature, idx) => (
                                            <div
                                                key={idx}
                                                className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 backdrop-blur-md rounded-xl p-5 sm:p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-sakura-300 dark:hover:border-sakura-700 group hover:-translate-y-1"
                                            >
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="p-3 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-lg group-hover:scale-110 transition-transform">
                                                        {feature.icon}
                                                    </div>
                                                    <span className="px-2 py-1 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-600 dark:text-sakura-400 text-xs font-semibold rounded-full">
                                                        {feature.highlight}
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">
                                                    {feature.title}
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                                    {feature.description}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Capabilities Showcase - Clean design */}
                                    <div className="mt-8 p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg animate-fadeInUp delay-500">
                                        <h3 className="text-center text-lg font-bold text-gray-900 dark:text-white mb-6">
                                            Every Cloud Capability, Right on Your Device
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            {capabilities.map((capability, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 p-2 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors duration-200 group"
                                                >
                                                    <div className="text-sakura-500 group-hover:scale-110 transition-transform">
                                                        {capability.icon}
                                                    </div>
                                                    <span className="font-medium">{capability.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full px-4 pb-6 sm:pb-8 flex justify-center animate-fadeInUp delay-600 shrink-0">
                        <button
                            onClick={() => handleNextSection("setup")}
                            className="px-8 sm:px-12 py-3 sm:py-4 bg-gradient-to-r from-sakura-400 to-sakura-500 hover:from-sakura-500 hover:to-sakura-600 text-white rounded-full font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center gap-3 hover:gap-4 hover:scale-105"
                        >
                            Get Started <Zap className="w-6 h-6"/>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Setup section - Enhanced version of the original form
    return (
        <div
            className="fixed inset-0 bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center z-50 overflow-hidden p-6">
            <div
                className={`glassmorphic rounded-2xl max-w-4xl w-full h-[90vh] mx-4 shadow-2xl flex flex-col ${animationClass}`}>
                {/* Header - Fixed */}
                <div className="p-6 sm:p-8 pb-4 shrink-0">
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                            Let's Set Up Clara
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            {step === 1 ? "First, tell us a bit about yourself" :
                                step === 2 ? "How can we reach you?" :
                                    step === 3 ? "Choose your preferred theme" :
                                        step === 4 ? "Let's connect to Clara Core" :
                                            step === 5 ? "Set up your AI service" :
                                                step === 6 ? "Choose additional services" :
                                                    step === 7 ? "Configure your services" :
                                                        "Final setup - timezone preferences"}
                        </p>

                        {/* Progress indicator */}
                        <div className="flex items-center justify-center gap-2 mt-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                                <div
                                    key={s}
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                        s === step ? 'w-8 bg-sakura-500' : s < step ? 'w-8 bg-green-500' : 'w-4 bg-gray-300 dark:bg-gray-600'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="px-6 sm:px-8 space-y-6 overflow-y-auto flex-1">
                    {step === 1 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <User className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    What should I call you?
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Your name helps personalize your experience with Clara.
                            </p>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                                onKeyDown={handleKeyDown}
                                className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                placeholder="Your name"
                                autoFocus
                            />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Mail className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    How can we reach you?
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Your email is stored locally and never shared. It's used for future features like saving
                                preferences across devices.
                            </p>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                                onKeyDown={handleKeyDown}
                                className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                placeholder="your.email@example.com"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* New Theme Selection Step */}
                    {step === 3 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Palette className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Choose Your Theme
                                </h3>
                            </div>

                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Select your preferred interface theme. You can change this later in settings.
                            </p>

                            <div className="flex flex-col gap-4 mt-6">
                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'dark'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'dark'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'dark' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <Moon className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Dark Mode</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Easier on the eyes, ideal for most environments</p>
                                    </div>
                                    {formData.theme_preference === 'dark' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>

                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'light'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'light'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'light' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <Sun className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Light Mode</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Bright interface for daytime use</p>
                                    </div>
                                    {formData.theme_preference === 'light' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>

                                <button
                                    onClick={() => setFormData(prev => ({...prev, theme_preference: 'system'}))}
                                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                        formData.theme_preference === 'system'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <div
                                        className={`p-3 rounded-full ${formData.theme_preference === 'system' ? 'bg-sakura-100 text-sakura-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                        <div className="relative">
                                            <Sunrise className="w-6 h-6"/>
                                        </div>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">System Default</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Follow your device's theme settings</p>
                                    </div>
                                    {formData.theme_preference === 'system' && (
                                        <Check className="w-5 h-5 text-sakura-500"/>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Bot className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Connect to Clara Core
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Clara Core is your local AI engine that processes everything privately on your device.
                            </p>

                            {/* Clara Core Connection Status */}
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                                    <Check className="w-5 h-5"/>
                                    <span className="font-medium">Clara Core is ready and running!</span>
                                </div>
                                <p className="text-sm text-green-600 dark:text-green-400">
                                    Connected to Clara Core at {formData.clara_core_url}
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Download className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Set Up Your AI Service
                                </h3>
                            </div>
                            
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Choose how you want to use AI models:
                            </p>
                            
                            {/* Setup Method Selection - Compact Cards */}
                            <div className="grid gap-3">
                                <button
                                    onClick={() => setSetupMethod('clara-core')}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                        setupMethod === 'clara-core'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-sm'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
                                    }`}
                                >
                                    <div className={`p-2 rounded-full ${
                                        setupMethod === 'clara-core' 
                                            ? 'bg-sakura-100 text-sakura-500' 
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                    }`}>
                                        <HardDrive className="w-5 h-5"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">Clara Core (Recommended)</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">Private, local AI models</p>
                                    </div>
                                    {setupMethod === 'clara-core' && <Check className="w-4 h-4 text-sakura-500"/>}
                                </button>
                                
                                <button
                                    onClick={() => setSetupMethod('external-provider')}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                        setupMethod === 'external-provider'
                                            ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20 shadow-sm'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-sakura-300'
                                    }`}
                                >
                                    <div className={`p-2 rounded-full ${
                                        setupMethod === 'external-provider' 
                                            ? 'bg-sakura-100 text-sakura-500' 
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                    }`}>
                                        <ExternalLink className="w-5 h-5"/>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-gray-900 dark:text-white">External API</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">OpenAI, OpenRouter, etc.</p>
                                    </div>
                                    {setupMethod === 'external-provider' && <Check className="w-4 h-4 text-sakura-500"/>}
                                </button>
                            </div>



                            {/* Clara Core Setup - Condensed */}
                            {setupMethod === 'clara-core' && (
                                <div className="mt-4 space-y-3">
                                    {checkingModels ? (
                                        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <Loader className="w-4 h-4 animate-spin text-blue-600"/>
                                            <span className="text-sm text-blue-700 dark:text-blue-300">Checking models...</span>
                                        </div>
                                    ) : downloadError ? (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-red-500">⚠</span>
                                                <span className="text-sm font-medium text-red-700 dark:text-red-300">Download failed</span>
                                            </div>
                                            <p className="text-xs text-red-600 dark:text-red-400 mb-2">{downloadError}</p>
                                            <button 
                                                onClick={() => {
                                                    setDownloadError(null);
                                                    handleModelDownload();
                                                }}
                                                className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    ) : availableModels.length === 0 ? (
                                        <div className="space-y-3">
                                            {/* Quick Download Option */}
                                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Download className="w-4 h-4 text-blue-600"/>
                                                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Quick Start (639MB)</span>
                                                </div>
                                                <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                                                    Download Qwen3 0.6B Q8 - High quality, fast and efficient for getting started
                                                </p>
                                                <button 
                                                    onClick={handleModelDownload}
                                                    disabled={downloadingModel || generatingConfig}
                                                    className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                                                >
                                                    {downloadingModel ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <Loader className="w-3 h-3 animate-spin"/>
                                                            Downloading {downloadProgress}%
                                                        </span>
                                                    ) : generatingConfig ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <Loader className="w-3 h-3 animate-spin"/>
                                                            Configuring...
                                                        </span>
                                                    ) : 'Download Model'}
                                                </button>
                                                
                                                {downloadingModel && !generatingConfig && (
                                                    <div className="mt-2">
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                                            <div 
                                                                className="bg-blue-600 h-1 rounded-full transition-all"
                                                                style={{ width: `${downloadProgress}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                                            Downloading model... After download, configuration will be generated automatically.
                                                        </p>
                                                    </div>
                                                )}
                                                
                                                {/* Show config generation progress after download */}
                                                {generatingConfig && configProgress && (
                                                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                                                Configuring Model...
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-blue-100 dark:bg-blue-800 rounded-full h-1 mb-1">
                                                            <div 
                                                                className="h-1 bg-blue-600 rounded-full transition-all duration-300"
                                                                style={{ width: `${configProgress.progress}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-xs text-blue-600 dark:text-blue-400">
                                                            {configProgress.currentStep}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Advanced Option - Collapsible */}
                                            <details className="group">
                                                <summary className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
                                                    <span className="group-open:rotate-90 transition-transform text-gray-700 dark:text-gray-300">▶</span>
                                                    <span className="text-gray-700 dark:text-gray-300">I have my own GGUF models</span>
                                                </summary>
                                                <div className="mt-2 space-y-3">
                                                    {/* Loading State */}
                                                    {isSettingCustomPath ? (
                                                        <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                                                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                            <div>
                                                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Scanning folder for models</p>
                                                                <p className="text-xs text-blue-600 dark:text-blue-400">Looking for .gguf files and adding them to Clara Core...</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded">
                                                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                                                Select a folder containing your GGUF model files. Clara Core will scan it and configure your models automatically.
                                                            </p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={formData.model_folder_path}
                                                                    onChange={(e) => {
                                                                        setFormData(prev => ({...prev, model_folder_path: e.target.value}));
                                                                        setFolderPickerMessage(null);
                                                                    }}
                                                                    placeholder="Path to your models folder..."
                                                                    className="flex-1 px-2 py-1 rounded bg-white/70 border border-gray-200 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 text-xs"
                                                                />
                                                                <button
                                                                    onClick={async () => {
                                                                        // Use folder picker
                                                                        if (window.electron && window.electron.dialog) {
                                                                            try {
                                                                                const result = await window.electron.dialog.showOpenDialog({
                                                                                    properties: ['openDirectory']
                                                                                });
                                                                                
                                                                                if (result && result.filePaths && result.filePaths[0]) {
                                                                                    const selectedPath = result.filePaths[0];
                                                                                    setFormData(prev => ({...prev, model_folder_path: selectedPath}));
                                                                                    setFolderPickerMessage(null);
                                                                                    setIsSettingCustomPath(true);
                                                                                    
                                                                                    try {
                                                                                        // Call Clara Core API to scan folder
                                                                                        const scanResponse = await fetch(`${formData.clara_core_url}/api/config/scan-folder`, {
                                                                                            method: 'POST',
                                                                                            headers: {
                                                                                                'Content-Type': 'application/json'
                                                                                            },
                                                                                            body: JSON.stringify({
                                                                                                folderPaths: [selectedPath],
                                                                                                recursive: true,
                                                                                                addToDatabase: true
                                                                                            })
                                                                                        });
                                                                                        
                                                                                        if (scanResponse.ok) {
                                                                                            const scanData = await scanResponse.json();
                                                                                            console.log('Clara Core scan result:', scanData);
                                                                                            
                                                                                            if (scanData.models && scanData.models.length > 0) {
                                                                                                // Store model count for config generation
                                                                                                setScannedModelsCount(scanData.models.length);
                                                                                                
                                                                                                const message = scanData.models.length === 1 
                                                                                                    ? `✅ Found 1 GGUF model and added it to database` 
                                                                                                    : `✅ Found ${scanData.models.length} GGUF models and added them to database`;
                                                                                                
                                                                                                setFolderPickerMessage(message);
                                                                                                
                                                                                                // Automatically generate config (no prompt)
                                                                                                await handleGenerateConfig();
                                                                                            } else {
                                                                                                setFolderPickerMessage('⚠️ No GGUF models found in this folder');
                                                                                            }
                                                                                        } else {
                                                                                            const errorText = await scanResponse.text();
                                                                                            console.error('Clara Core scan failed:', errorText);
                                                                                            setFolderPickerMessage('❌ Failed to scan folder. Make sure Clara Core is running.');
                                                                                        }
                                                                                    } catch (error: any) {
                                                                                        console.error('Error scanning folder with Clara Core:', error);
                                                                                        setFolderPickerMessage('❌ Error scanning folder: ' + error.message);
                                                                                    } finally {
                                                                                        setIsSettingCustomPath(false);
                                                                                    }
                                                                                }
                                                                            } catch (error) {
                                                                                console.error('Error selecting folder:', error);
                                                                                setIsSettingCustomPath(false);
                                                                            }
                                                                        } else {
                                                                            alert('Folder picker is only available in the desktop app.');
                                                                        }
                                                                    }}
                                                                    disabled={isSettingCustomPath}
                                                                    className="px-3 py-1 bg-sakura-500 text-white rounded hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs flex items-center gap-2"
                                                                >
                                                                    {isSettingCustomPath && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                                                    {isSettingCustomPath ? 'Scanning...' : 'Browse'}
                                                                </button>
                                                            </div>
                                                            {/* Config Generation Progress (shows during scanning or after download) */}
                                                            {generatingConfig && configProgress && (
                                                                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                                                            Configuring Models...
                                                                        </span>
                                                                    </div>
                                                                    
                                                                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                                                                        {configProgress.currentStep}
                                                                    </p>
                                                                    
                                                                    <div className="w-full bg-blue-100 dark:bg-blue-800 rounded-full h-2 mb-2">
                                                                        <div 
                                                                            className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                                                                            style={{ width: `${configProgress.progress}%` }}
                                                                        />
                                                                    </div>
                                                                    
                                                                    <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
                                                                        <span>{configProgress.processedModels} of {configProgress.totalModels} models</span>
                                                                        <span>{Math.round(configProgress.progress)}%</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {folderPickerMessage && !generatingConfig && (
                                                                <div className={`text-xs mt-2 p-2 rounded ${
                                                                    folderPickerMessage.startsWith('✅') 
                                                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' 
                                                                        : folderPickerMessage.startsWith('⚠️')
                                                                        ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                                                                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                                                }`}>
                                                                    {folderPickerMessage}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Check className="w-4 h-4 text-green-600"/>
                                                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                                    {availableModels.length} model{availableModels.length > 1 ? 's' : ''} ready!
                                                </span>
                                            </div>
                                            <p className="text-xs text-green-600 dark:text-green-400">
                                                You're all set to start using Clara
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* External Provider Setup - Condensed */}
                            {setupMethod === 'external-provider' && (
                                <div className="mt-4 space-y-3">
                                    {providers.length > 0 ? (
                                        <div className="space-y-2">
                                            {providers.slice(0, 2).map((provider) => {
                                                const ProviderIcon = getProviderIcon(provider.type);
                                                return (
                                                    <div key={provider.id} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                                        <ProviderIcon className="w-4 h-4 text-green-600"/>
                                                        <span className="text-sm text-green-700 dark:text-green-300 flex-1">{provider.name}</span>
                                                        <button
                                                            onClick={() => handleDeleteProvider(provider.id)}
                                                            className="p-1 text-red-500 hover:text-red-700"
                                                        >
                                                            <X className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {providers.length > 2 && (
                                                <p className="text-xs text-gray-500">+{providers.length - 2} more providers</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                                                Connect to external AI services
                                            </p>
                                        </div>
                                    )}
                                    
                                    <button
                                        onClick={() => setShowAddProviderModal(true)}
                                        className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-sakura-400 text-gray-600 dark:text-gray-400 hover:text-sakura-600 text-sm"
                                    >
                                        <Plus className="w-4 h-4"/>
                                        Add Provider
                                    </button>
                                    
                                    {providerError && (
                                        <p className="text-xs text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                                            {providerError}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 6 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Server className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Choose Additional Services (Optional)
                                </h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Select the services you'd like to enable. <b>You must have docker installed to use these services.</b>
                                <br/>
                                <br/>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Note: During onboarding, only ComfyUI and N8N will be started if selected. TTS services will be available on-demand when needed. All services can be managed later in settings.
                                </span>
                            </p>

                            <div className="space-y-4">
                                {/* ComfyUI Service */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 transition-colors">
                                    <div className="flex items-center gap-3 p-4">
                                        <input
                                            type="checkbox"
                                            id="comfyui-service"
                                            checked={selectedServices.comfyui}
                                            onChange={(e) => setSelectedServices(prev => ({...prev, comfyui: e.target.checked}))}
                                            className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-sakura-500 dark:focus:ring-sakura-400"
                                        />
                                        <div className="text-2xl">🎨</div>
                                        <div className="flex-1">
                                            <label htmlFor="comfyui-service" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-gray-900 dark:text-white">ComfyUI</h4>
                                                    {serviceStatuses.comfyui === 'checking' && (
                                                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                    {serviceStatuses.comfyui === 'available' && (
                                                        <span className="text-green-500 text-xs">● Online</span>
                                                    )}
                                                    {serviceStatuses.comfyui === 'unavailable' && (
                                                        <span className="text-gray-400 text-xs">○ Offline</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Image generation and editing</p>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {selectedServices.comfyui && (
                                        <div className="px-4 pb-4 space-y-3">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                ✅ ComfyUI will be configured after onboarding completes.
                                            </p>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2 rounded">
                                                <strong>Docker:</strong> 15.7GB download (Windows CUDA only)<br/>
                                                <strong>Manual:</strong> Use your own ComfyUI instance
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RAG & TTS Service */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 transition-colors">
                                    <div className="flex items-center gap-3 p-4">
                                        <input
                                            type="checkbox"
                                            id="tts-service"
                                            checked={selectedServices.tts}
                                            onChange={(e) => setSelectedServices(prev => ({...prev, tts: e.target.checked}))}
                                            className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-sakura-500 dark:focus:ring-sakura-400"
                                        />
                                        <div className="text-2xl">🧠</div>
                                        <div className="flex-1">
                                            <label htmlFor="tts-service" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-gray-900 dark:text-white">RAG & TTS </h4>
                                                    {serviceStatuses.tts === 'checking' && (
                                                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                    {serviceStatuses.tts === 'available' && (
                                                        <span className="text-green-500 text-xs">● Online</span>
                                                    )}
                                                    {serviceStatuses.tts === 'unavailable' && (
                                                        <span className="text-gray-400 text-xs">○ Offline</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Document analysis & voice synthesis (will start on-demand)</p>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {selectedServices.tts && (
                                        <div className="px-4 pb-4 space-y-2">
                                            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-300">
                                                ✓ TTS service preference saved. Will NOT download during onboarding - available on-demand when you need document analysis or voice features (~11.4GB download when first used)
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* N8N Service */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 transition-colors">
                                    <div className="flex items-center gap-3 p-4">
                                        <input
                                            type="checkbox"
                                            id="n8n-service"
                                            checked={selectedServices.n8n}
                                            onChange={(e) => setSelectedServices(prev => ({...prev, n8n: e.target.checked}))}
                                            className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-sakura-500 dark:focus:ring-sakura-400"
                                        />
                                        <div className="text-2xl">⚡</div>
                                        <div className="flex-1">
                                            <label htmlFor="n8n-service" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-gray-900 dark:text-white">N8N Workflows</h4>
                                                    {serviceStatuses.n8n === 'checking' && (
                                                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                    {serviceStatuses.n8n === 'available' && (
                                                        <span className="text-green-500 text-xs">● Online</span>
                                                    )}
                                                    {serviceStatuses.n8n === 'unavailable' && (
                                                        <span className="text-gray-400 text-xs">○ Offline</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Visual workflow automation</p>
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {selectedServices.n8n && (
                                        <div className="px-4 pb-4 space-y-3">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                ✅ N8N will be configured after onboarding completes.
                                            </p>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2 rounded">
                                                <strong>Docker:</strong> Lightweight container for workflows<br/>
                                                <strong>Manual:</strong> Use your own N8N instance
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Simplified message */}
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-600 dark:text-blue-400">
                                    💡 Your selected services will be configured but not auto-started after onboarding. 
                                    You can manually start them when needed from the main application.
                                </p>
                                <p className="text-xs text-blue-500 dark:text-blue-300 mt-2">
                                    Note: Clara Core will always be managed automatically as it's essential for the app to function.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 7 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Globe className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Configure Your Services
                                </h3>
                            </div>
                            
                            {/* Show only selected services */}
                            {Object.entries(selectedServices).some(([_, enabled]) => enabled) ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Configure URLs for your selected services (or use defaults).
                                    </p>
                                    
                                    {selectedServices.comfyui && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="text-lg">🎨</div>
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    ComfyUI URL - optional only if using a custom server or else ignore
                                                </label>
                                            </div>
                                            <input
                                                type="url"
                                                value={serviceUrls.comfyui}
                                                onChange={(e) => setServiceUrls(prev => ({...prev, comfyui: e.target.value}))}
                                                placeholder="http://localhost:8188"
                                                className="w-full px-3 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400 text-sm"
                                            />
                                        </div>
                                    )}

                                    {(selectedServices.tts || selectedServices.n8n) && (
                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
                                                <Check className="w-4 h-4"/>
                                                <span className="text-sm font-medium">Auto-configured services</span>
                                            </div>
                                            <p className="text-xs text-green-600 dark:text-green-400">
                                                {selectedServices.tts && "RAG & TTS (on-demand)"}{selectedServices.tts && selectedServices.n8n && ", "}
                                                {selectedServices.n8n && "N8N"} will be configured automatically.
                                            </p>
                                        </div>
                                    )}

                                    {/* Test Configuration Button */}
                                    {selectedServices.comfyui && (
                                        <div className="pt-2">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        setServiceStartupProgress(prev => ({...prev, comfyui: 'Testing configuration...'}));
                                                        
                                                        // Save the URL first
                                                        const saveResult = await (window as any).electronAPI.invoke('service-config:set-manual-url', 'comfyui', serviceUrls.comfyui);
                                                        if (saveResult.success) {
                                                            setServiceStartupProgress(prev => ({...prev, comfyui: '✓ Configuration saved successfully'}));
                                                            
                                                            // Test the connection
                                                            try {
                                                                const testResult = await (window as any).electronAPI.invoke('service-config:test-manual-service', 'comfyui', serviceUrls.comfyui);
                                                                if (testResult.success) {
                                                                    setServiceStartupProgress(prev => ({...prev, comfyui: '✅ Connection test successful!'}));
                                                                    setServiceStatuses(prev => ({...prev, comfyui: 'available'}));
                                                                } else {
                                                                    setServiceStartupProgress(prev => ({...prev, comfyui: `⚠ Connection failed: ${testResult.error}`}));
                                                                    setServiceStatuses(prev => ({...prev, comfyui: 'unavailable'}));
                                                                }
                                                            } catch (testError: any) {
                                                                setServiceStartupProgress(prev => ({...prev, comfyui: `⚠ Connection test failed: ${testError.message}`}));
                                                                setServiceStatuses(prev => ({...prev, comfyui: 'unavailable'}));
                                                            }
                                                        } else {
                                                            setServiceStartupProgress(prev => ({...prev, comfyui: `❌ Failed to save: ${saveResult.error}`}));
                                                        }
                                                    } catch (error: any) {
                                                        setServiceStartupProgress(prev => ({...prev, comfyui: `❌ Error: ${error.message}`}));
                                                    }
                                                }}
                                                className="w-full px-4 py-2 bg-sakura-500 text-white rounded-lg text-sm font-medium hover:bg-sakura-600 transition-colors"
                                            >
                                                Test & Save Configuration
                                            </button>
                                            
                                            {/* Show test result */}
                                            {serviceStartupProgress.comfyui && (
                                                <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs text-gray-600 dark:text-gray-400">
                                                    {serviceStartupProgress.comfyui}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        No additional services selected. You can enable them later in Settings.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 8 && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-sakura-100 dark:bg-sakura-100/10 rounded-lg">
                                    <Globe className="w-6 h-6 text-sakura-500"/>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    Final Preferences
                                </h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Your Timezone
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        Clara uses your timezone for time-aware responses.
                                    </p>
                                    <select
                                        value={formData.timezone}
                                        onChange={(e) => setFormData(prev => ({...prev, timezone: e.target.value}))}
                                        className="w-full px-3 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:focus:border-sakura-400"
                                    >
                                        {[
                                            // UTC
                                            'UTC',
                                            
                                            // Africa
                                            'Africa/Abidjan',
                                            'Africa/Algiers',
                                            'Africa/Cairo',
                                            'Africa/Casablanca',
                                            'Africa/Johannesburg',
                                            'Africa/Lagos',
                                            'Africa/Nairobi',
                                            'Africa/Tunis',
                                            
                                            // America - North
                                            'America/Anchorage',
                                            'America/Chicago',
                                            'America/Denver',
                                            'America/Los_Angeles',
                                            'America/New_York',
                                            'America/Phoenix',
                                            'America/Toronto',
                                            'America/Vancouver',
                                            'America/Winnipeg',
                                            
                                            // America - Central
                                            'America/Belize',
                                            'America/Costa_Rica',
                                            'America/Guatemala',
                                            'America/Havana',
                                            'America/Mexico_City',
                                            'America/Panama',
                                            'America/Tegucigalpa',
                                            
                                            // America - South
                                            'America/Argentina/Buenos_Aires',
                                            'America/Bogota',
                                            'America/Caracas',
                                            'America/Lima',
                                            'America/Santiago',
                                            'America/Sao_Paulo',
                                            
                                            // Asia - East
                                            'Asia/Bangkok',
                                            'Asia/Hong_Kong',
                                            'Asia/Jakarta',
                                            'Asia/Kuala_Lumpur',
                                            'Asia/Manila',
                                            'Asia/Seoul',
                                            'Asia/Shanghai',
                                            'Asia/Singapore',
                                            'Asia/Taipei',
                                            'Asia/Tokyo',
                                            
                                            // Asia - South
                                            'Asia/Calcutta',
                                            'Asia/Colombo',
                                            'Asia/Dhaka',
                                            'Asia/Karachi',
                                            'Asia/Kathmandu',
                                            
                                            // Asia - Central/West
                                            'Asia/Dubai',
                                            'Asia/Istanbul',
                                            'Asia/Jerusalem',
                                            'Asia/Kuwait',
                                            'Asia/Qatar',
                                            'Asia/Riyadh',
                                            'Asia/Tehran',
                                            'Asia/Tashkent',
                                            'Asia/Yekaterinburg',
                                            
                                            // Europe
                                            'Europe/Amsterdam',
                                            'Europe/Athens',
                                            'Europe/Berlin',
                                            'Europe/Brussels',
                                            'Europe/Budapest',
                                            'Europe/Dublin',
                                            'Europe/Helsinki',
                                            'Europe/Istanbul',
                                            'Europe/London',
                                            'Europe/Madrid',
                                            'Europe/Moscow',
                                            'Europe/Oslo',
                                            'Europe/Paris',
                                            'Europe/Prague',
                                            'Europe/Rome',
                                            'Europe/Stockholm',
                                            'Europe/Vienna',
                                            'Europe/Warsaw',
                                            'Europe/Zurich',
                                            
                                            // Australia/Oceania
                                            'Australia/Adelaide',
                                            'Australia/Brisbane',
                                            'Australia/Darwin',
                                            'Australia/Melbourne',
                                            'Australia/Perth',
                                            'Australia/Sydney',
                                            'Pacific/Auckland',
                                            'Pacific/Fiji',
                                            'Pacific/Honolulu',
                                            'Pacific/Port_Moresby',
                                            'Pacific/Samoa',
                                            'Pacific/Tahiti',
                                            'Pacific/Tongatapu',
                                            
                                            // Atlantic
                                            'Atlantic/Azores',
                                            'Atlantic/Bermuda',
                                            'Atlantic/Canary',
                                            'Atlantic/Cape_Verde',
                                            'Atlantic/Reykjavik',
                                            
                                            // Indian Ocean
                                            'Indian/Maldives',
                                            'Indian/Mauritius',
                                        ].map(tz => (
                                            <option key={tz} value={tz} className="dark:bg-gray-800 dark:text-gray-100">{getTimezoneDisplay(tz)}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Service startup progress - Hidden during onboarding as services aren't started */}
                                {/* Services will be initialized after onboarding completes */}

                                {/* Loading state for launch */}
                                {loading && (
                                    <div className="p-4 bg-gradient-to-r from-blue-50 to-sakura-50 dark:from-blue-900/20 dark:to-sakura-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="relative">
                                                <Loader className="w-5 h-5 animate-spin text-blue-500"/>
                                                <div className="absolute inset-0 rounded-full border-2 border-blue-200 dark:border-blue-800 animate-pulse"></div>
                                            </div>
                                            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                                {initializationStatus || 'Launching Clara...'}
                                            </span>
                                        </div>
                                        
                                        {/* Real-time progress steps */}
                                        <div className="space-y-2 mb-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                                    <div className={`w-2 h-2 rounded-full ${initializationProgress >= 10 ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`}></div>
                                                    Saving your preferences
                                                </div>
                                                {initializationProgress >= 10 && <span className="text-green-500 text-xs">✓</span>}
                                            </div>
                                            
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                                    <div className={`w-2 h-2 rounded-full ${initializationProgress >= 40 ? 'bg-green-500' : initializationProgress >= 10 ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`}></div>
                                                    <span>
                                                        {binaryDownloadStatus || 'Downloading Llama.cpp binaries'}
                                                        {binaryDownloadProgress > 0 && binaryDownloadProgress < 100 && (
                                                            <span className="ml-1">({binaryDownloadProgress}%)</span>
                                                        )}
                                                    </span>
                                                </div>
                                                {initializationProgress >= 40 && <span className="text-green-500 text-xs">✓</span>}
                                            </div>
                                            
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                                    <div className={`w-2 h-2 rounded-full ${initializationProgress >= 100 ? 'bg-green-500' : initializationProgress >= 60 ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`}></div>
                                                    Initializing AI services
                                                </div>
                                                {initializationProgress >= 100 && <span className="text-green-500 text-xs">✓</span>}
                                            </div>
                                        </div>
                                        
                                        {/* Progress bar with real percentage */}
                                        <div className="w-full bg-blue-100 dark:bg-blue-800 rounded-full h-3 mb-2 overflow-hidden shadow-inner">
                                            <div 
                                                className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-sakura-400 to-blue-500 relative transition-all duration-500"
                                                style={{
                                                    width: `${Math.max(15, initializationProgress)}%`, // Minimum 15% for visual feedback
                                                    backgroundSize: '200% 100%',
                                                    animation: initializationProgress < 100 ? 'progressShimmer 2s ease-in-out infinite' : 'none'
                                                }}
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                                            </div>
                                        </div>
                                        
                                        {/* Progress percentage */}
                                        <div className="flex justify-between items-center text-xs mb-2">
                                            <span className="text-blue-600 dark:text-blue-400">
                                                Progress: {initializationProgress}%
                                            </span>
                                            {initializationProgress < 100 && (
                                                <span className="text-blue-500 dark:text-blue-400">
                                                    This may take 1-2 minutes...
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Detailed status log (expandable) */}
                                        {initializationDetails.length > 0 && (
                                            <details className="mt-2">
                                                <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-700">
                                                    Show detailed progress ({initializationDetails.length} steps)
                                                </summary>
                                                <div className="mt-2 max-h-32 overflow-y-auto bg-blue-50 dark:bg-blue-900/20 rounded p-2">
                                                    {initializationDetails.slice(-5).map((detail, index) => (
                                                        <div key={index} className="text-xs text-blue-600 dark:text-blue-300 mb-1">
                                                            • {detail}
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        )}
                                        
                                        {/* Add keyframe animation styles */}
                                        <style dangerouslySetInnerHTML={{
                                            __html: `
                                                @keyframes progressShimmer {
                                                    0% { background-position: -200% center; }
                                                    100% { background-position: 200% center; }
                                                }
                                            `
                                        }} />
                                    </div>
                                )}

                                <div className="p-3 bg-sakura-50 dark:bg-sakura-900/20 rounded-lg">
                                    <h4 className="font-medium text-sakura-800 dark:text-sakura-200 mb-2">
                                        🎉 You're almost ready!
                                    </h4>
                                    <p className="text-sm text-sakura-700 dark:text-sakura-300">
                                        Clara is configured and ready to go. Click "Launch Clara" to start your AI-powered journey!
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer - Fixed Navigation Buttons */}
                <div className="p-6 sm:p-8 pt-4 shrink-0">
                    <div className="flex justify-between">
                        {section === 'setup' && (
                            <>
                                {step > 1 ? (
                                    <button
                                        onClick={() => setStep(step - 1)}
                                        className="px-6 py-2 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                    >
                                        Back
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleNextSection('welcome')}
                                        className="px-6 py-2 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                    >
                                        Back to Welcome
                                    </button>
                                )}

                                <button
                                    onClick={async () => {
                                        if (step < 8) {
                                            setStep(step + 1);
                                        } else {
                                            // Launch Clara with proper initialization waiting
                                            await handleLaunchClara();
                                        }
                                    }}
                                    disabled={
                                        (step === 1 && !formData.name) ||
                                        (step === 2 && !formData.email) ||
                                        (step === 5 && !hasValidSetup() && !downloadingModel) ||
                                        downloadingModel ||
                                        loading
                                    }
                                    className="ml-auto px-6 py-2 rounded-lg bg-sakura-500 text-white
                    transition-all disabled:bg-gray-400 disabled:cursor-not-allowed
                    hover:shadow-[0_0_20px_rgba(244,163,187,0.5)] hover:bg-sakura-400"
                                >
                                    {step === 8 ? (
                                        loading ? (
                                            <span className="flex items-center justify-center gap-3">
                                                <div className="relative">
                                                    <Loader className="w-4 h-4 animate-spin"/>
                                                    <div className="absolute inset-0 rounded-full border border-white/30 animate-pulse"></div>
                                                </div>
                                                <span className="flex flex-col items-start">
                                                    <span className="font-medium">Launching Clara...</span>
                                                    <span className="text-xs opacity-90">Setting up AI services</span>
                                                </span>
                                            </span>
                                        ) : 'Launch Clara'
                                    ) : 'Continue'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Add Provider Modal */}
            {showAddProviderModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Add AI Provider
                            </h3>
                            <button
                                onClick={() => {
                                    setShowAddProviderModal(false);
                                    setProviderError(null);
                                }}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Provider Type
                                </label>
                                <select
                                    value={newProviderForm.type}
                                    onChange={(e) => {
                                        const type = e.target.value as Provider['type'];
                                        const defaultConfig = getDefaultProviderConfig(type);
                                        setNewProviderForm(prev => ({
                                            ...prev,
                                            type,
                                            name: defaultConfig.name || prev.name,
                                            baseUrl: defaultConfig.baseUrl || prev.baseUrl,
                                            apiKey: type === 'ollama' ? 'ollama' : prev.apiKey
                                        }));
                                    }}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:focus:border-sakura-400"
                                >
                                    <option value="openai" className="dark:bg-gray-800 dark:text-gray-100">OpenAI</option>
                                    <option value="openai_compatible" className="dark:bg-gray-800 dark:text-gray-100">OpenAI Compatible</option>
                                    <option value="openrouter" className="dark:bg-gray-800 dark:text-gray-100">OpenRouter</option>
                                    <option value="ollama" className="dark:bg-gray-800 dark:text-gray-100">Ollama</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Provider Name
                                </label>
                                <input
                                    type="text"
                                    value={newProviderForm.name}
                                    onChange={(e) => setNewProviderForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                    placeholder="Enter provider name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Base URL
                                </label>
                                <input
                                    type="url"
                                    value={newProviderForm.baseUrl}
                                    onChange={(e) => setNewProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                    placeholder="https://api.example.com/v1"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={newProviderForm.apiKey}
                                    onChange={(e) => setNewProviderForm(prev => ({ ...prev, apiKey: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-sakura-300 text-gray-900 placeholder-gray-500 dark:bg-gray-800/80 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-sakura-400"
                                    placeholder="Enter API key"
                                />
                            </div>
                            
                            {newProviderForm.type === 'openrouter' && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                        💡 <strong>OpenRouter tip:</strong> Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">openrouter.ai/keys</a>
                                    </p>
                                </div>
                            )}
                            
                            {newProviderForm.type === 'openai' && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                        💡 <strong>OpenAI tip:</strong> Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/api-keys</a>
                                    </p>
                                </div>
                            )}
                            
                            {providerError && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                    <p className="text-sm text-red-600 dark:text-red-400">{providerError}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowAddProviderModal(false);
                                    setProviderError(null);
                                }}
                                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddProvider}
                                disabled={!newProviderForm.name.trim() || !newProviderForm.baseUrl.trim() || addingProvider}
                                className="flex-1 px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {addingProvider ? (
                                    <>
                                        <Loader className="w-4 h-4 animate-spin"/>
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Add Provider
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Onboarding;