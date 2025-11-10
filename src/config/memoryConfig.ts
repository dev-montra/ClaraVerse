/**
 * memoryConfig.ts
 * 
 * Configuration settings for Clara's memory system
 */

export const MEMORY_CONFIG = {
  // Storage settings
  storage: {
    tablePrefix: 'clara_memory_',
    enableBackup: true,
    backupInterval: 24 * 60 * 60 * 1000, // 24 hours
    maxProfileVersions: 10 // Keep last 10 versions for rollback
  },

  // Extraction settings
  extraction: {
    minConfidence: 0.2, // Minimum confidence to save memory (lowered from 0.3)
    minWordCount: 5, // Minimum words required for memory extraction
    maxWordCount: 500, // Maximum words to avoid processing overly long requests
    enableRateLimiting: true,
    rateLimitInterval: 30000, // 30 seconds between extractions
    contextWindow: 3, // Number of previous messages to include
    timeoutMs: 60000 // Fixed 60 second timeout for all AI extractions
  },

  // Feature flags
  features: {
    enableToastNotifications: true,
    enableAutoProcessing: true,
    enableConversationAnalysis: true,
    enableMemoryDashboard: true,
    enableExportImport: true,
    enableMemoryInsights: true
  },

  // UI settings
  ui: {
    toastDuration: 4000, // 4 seconds
    toastCooldown: 60000, // 1 minute cooldown
    knowledgeLevelThreshold: 5, // Show toast when knowledge increases by 5%
    maxToastsPerSession: 3 // Limit toasts per session
  },

  // Privacy settings
  privacy: {
    enableUserConsent: true,
    consentVersion: 1,
    enableDataExport: true,
    enableDataDeletion: true,
    enableMemoryTransparency: true // Show what Clara learned
  },

  // Performance settings
  performance: {
    enableBatchProcessing: false, // Process multiple messages at once
    batchSize: 5,
    enableCaching: true,
    cacheExpiryMs: 5 * 60 * 1000, // 5 minutes
    enableCompression: true // AI-powered compression when memory is too large
  },

  // Compression settings
  compression: {
    warningThreshold: 5 * 1024, // 5KB - show warning dialog (optional)
    maxSize: 10 * 1024, // 10KB - auto-compress without asking
    targetSize: 3 * 1024, // 3KB - target after compression
    provider: 'openai', // AI provider for compression
    model: 'gpt-4o-mini', // Fast and cheap model
    autoCompress: true, // Auto-compress when hitting maxSize (10KB)
    showDialog: false // Don't show dialog, compress silently in background
  }
};

export default MEMORY_CONFIG;
