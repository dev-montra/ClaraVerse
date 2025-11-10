/**
 * claraMemoryCompression.ts
 *
 * AI-powered memory compression service for Clara
 * Compresses and deduplicates memory when it grows too large
 */

import { UserMemoryProfile } from '../components/ClaraSweetMemory';
import type { ClaraProvider } from '../types/clara_assistant_types';

// ==================== CONSTANTS ====================

export const MEMORY_SIZE_LIMITS = {
  WARNING_THRESHOLD: 5 * 1024, // 5KB - show warning
  MAX_SIZE: 10 * 1024, // 10KB - force compression
  TARGET_SIZE: 3 * 1024, // 3KB - target after compression
};

export const COMPRESSION_CONFIG = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini', // Fast and cheap for compression
  fallbackProvider: 'anthropic',
  fallbackModel: 'claude-3-5-haiku-20241022',
  timeout: 30000,
};

// ==================== INTERFACES ====================

export interface MemorySizeInfo {
  totalBytes: number;
  sectionSizes: { [key: string]: number };
  isOverWarningThreshold: boolean;
  isOverMaxSize: boolean;
  needsCompression: boolean;
}

export interface CompressionResult {
  success: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressedProfile: UserMemoryProfile;
  error?: string;
}

export interface CompressionOptions {
  provider?: ClaraProvider;
  model?: string;
  targetSize?: number;
  preserveCoreIdentity?: boolean;
}

// ==================== SIZE ANALYSIS ====================

/**
 * Calculate the size of memory profile in bytes
 */
export function getMemorySize(profile: UserMemoryProfile | null): MemorySizeInfo {
  if (!profile) {
    return {
      totalBytes: 0,
      sectionSizes: {},
      isOverWarningThreshold: false,
      isOverMaxSize: false,
      needsCompression: false,
    };
  }

  const jsonString = JSON.stringify(profile);
  const totalBytes = new Blob([jsonString]).size;

  // Calculate size per section
  const sectionSizes: { [key: string]: number } = {};
  const sections = [
    'coreIdentity',
    'personalCharacteristics',
    'preferences',
    'relationship',
    'interactions',
    'context',
    'emotional',
    'practical',
  ];

  sections.forEach((section) => {
    const sectionData = profile[section as keyof UserMemoryProfile];
    if (sectionData) {
      const sectionJson = JSON.stringify(sectionData);
      sectionSizes[section] = new Blob([sectionJson]).size;
    }
  });

  const isOverWarningThreshold = totalBytes >= MEMORY_SIZE_LIMITS.WARNING_THRESHOLD;
  const isOverMaxSize = totalBytes >= MEMORY_SIZE_LIMITS.MAX_SIZE;
  const needsCompression = isOverWarningThreshold;

  return {
    totalBytes,
    sectionSizes,
    isOverWarningThreshold,
    isOverMaxSize,
    needsCompression,
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ==================== COMPRESSION PROMPTS ====================

const COMPRESSION_SYSTEM_PROMPT = `You are Clara's memory compression assistant. Your job is to compress and optimize Clara's memory about a user while preserving the most important information.

COMPRESSION GOALS:
- Reduce memory size by 50-70%
- Remove duplicates and redundant information
- Merge similar entries semantically
- Summarize long lists while keeping key items
- Preserve all critical identity information (name, occupation, location, etc.)
- Keep high-confidence, high-relevance information
- Remove low-value, repetitive data

COMPRESSION STRATEGIES:
1. **Deduplicate Arrays**: Merge semantically similar items
   - ["Python", "Python programming", "coding in Python"] → ["Python programming"]
   - ["web development", "building websites", "web dev"] → ["web development"]

2. **Summarize Lists**: Keep top N most relevant items
   - Interests: Keep top 8 most mentioned/important
   - Topics: Keep top 15 most recent/relevant
   - Skills: Keep top 10 most significant

3. **Compress Verbose Text**: Shorten while keeping meaning
   - Long conversation topics → Brief summary phrases
   - Detailed descriptions → Concise key points

4. **Merge Similar Fields**: Combine related information
   - Multiple hobby entries → Single comprehensive list
   - Repeated preferences → Unified preference statement

5. **Remove Low-Value Data**:
   - Generic/obvious information
   - Low-confidence entries
   - Outdated context that's no longer relevant

CRITICAL RULES:
✓ NEVER remove core identity (name, email, occupation, location)
✓ NEVER lose unique/distinguishing information
✓ ALWAYS preserve emotional context and relationship details
✓ ALWAYS keep user preferences and communication style
✓ Focus on quality over quantity

Return a compressed UserMemoryProfile with the same structure but optimized content.`;

function buildCompressionPrompt(profile: UserMemoryProfile, targetSize: number): string {
  const currentSize = getMemorySize(profile);
  const compressionTarget = ((currentSize.totalBytes - targetSize) / currentSize.totalBytes * 100).toFixed(0);

  return `Compress this memory profile to reduce size by approximately ${compressionTarget}%.

CURRENT SIZE: ${formatBytes(currentSize.totalBytes)}
TARGET SIZE: ${formatBytes(targetSize)}
COMPRESSION NEEDED: ~${compressionTarget}%

CURRENT MEMORY PROFILE:
${JSON.stringify(profile, null, 2)}

SECTION SIZES (focus compression on largest sections):
${Object.entries(currentSize.sectionSizes)
  .sort(([, a], [, b]) => b - a)
  .map(([section, size]) => `- ${section}: ${formatBytes(size)}`)
  .join('\n')}

Please return a compressed version of this profile as valid JSON, maintaining the same structure (all sections: coreIdentity, personalCharacteristics, preferences, relationship, interactions, context, emotional, practical).

Focus your compression efforts on the largest sections while preserving critical information.`;
}

// ==================== COMPRESSION ENGINE ====================

/**
 * Compress memory profile using AI with structured output
 */
export async function compressMemoryProfile(
  profile: UserMemoryProfile,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    provider,
    model,
    targetSize = MEMORY_SIZE_LIMITS.TARGET_SIZE,
  } = options;

  const originalSize = getMemorySize(profile).totalBytes;

  // Validate provider and model
  if (!provider || !model) {
    console.error('🗜️ ERROR: Provider and model are required');
    return {
      success: false,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      compressedProfile: profile,
      error: 'Provider and model are required. Please select a model in chat settings.',
    };
  }

  try {
    console.log('🗜️ Starting memory compression...');
    console.log(`🗜️ Original size: ${formatBytes(originalSize)}`);
    console.log(`🗜️ Target size: ${formatBytes(targetSize)}`);
    console.log(`🗜️ Using provider: ${provider.name}, model: ${model}`);

    // Build compression prompt
    const compressionPrompt = buildCompressionPrompt(profile, targetSize);

    // Extract actual model name (remove provider prefix if present)
    // e.g., "ollama:qwen3:30b" -> "qwen3:30b"
    const actualModelName = model.includes(':')
      ? model.split(':').slice(1).join(':')
      : model;

    if (model !== actualModelName) {
      console.log(`🗜️ Model ID extraction: "${model}" -> "${actualModelName}"`);
    }

    // Build the compression schema
    const compressionSchema = {
      type: "object",
      properties: {
        coreIdentity: { type: "object", additionalProperties: true },
        personalCharacteristics: { type: "object", additionalProperties: true },
        preferences: { type: "object", additionalProperties: true },
        relationship: { type: "object", additionalProperties: true },
        interactions: { type: "object", additionalProperties: true },
        context: { type: "object", additionalProperties: true },
        emotional: { type: "object", additionalProperties: true },
        practical: { type: "object", additionalProperties: true },
      },
      required: ["coreIdentity"],
      additionalProperties: false
    };

    // Build API payload
    const payload = {
      model: actualModelName,
      messages: [
        {
          role: 'system',
          content: COMPRESSION_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: compressionPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'compressed_memory_profile',
          schema: compressionSchema,
          strict: true
        }
      }
    };

    // Build correct URL
    const baseUrl = provider.baseUrl?.replace(/\/+$/, '') || '';
    const endpoint = baseUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
    const fullUrl = `${baseUrl}${endpoint}`;

    console.log('🗜️ API call:', fullUrl);

    // Make API call
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey || ''}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(COMPRESSION_CONFIG.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🗜️ API error:', response.status, errorText);
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in API response');
    }

    const parsedContent = JSON.parse(content);
    console.log('🗜️ Received compressed data from AI');

    // Extract compressed profile from response
    const compressedProfile = extractCompressedProfile(parsedContent, profile);

    if (!compressedProfile) {
      throw new Error('Failed to extract valid compressed profile from AI response');
    }

    const compressedSize = getMemorySize(compressedProfile).totalBytes;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);

    console.log('🗜️ Compression complete!');
    console.log(`🗜️ Compressed size: ${formatBytes(compressedSize)}`);
    console.log(`🗜️ Compression ratio: ${compressionRatio.toFixed(1)}%`);

    // Validate compression meets target
    if (compressedSize > targetSize * 1.5) {
      console.warn('🗜️ Warning: Compression did not meet target size, may need multiple passes');
    }

    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio,
      compressedProfile,
    };

  } catch (error) {
    console.error('🗜️ Compression failed:', error);

    // Try manual compression as fallback
    console.log('🗜️ Attempting manual compression as fallback...');
    try {
      const manuallyCompressed = manualCompression(profile);
      const compressedSize = getMemorySize(manuallyCompressed).totalBytes;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);

      return {
        success: true,
        originalSize,
        compressedSize,
        compressionRatio,
        compressedProfile: manuallyCompressed,
      };
    } catch (fallbackError) {
      console.error('🗜️ Manual compression also failed:', fallbackError);
    }

    return {
      success: false,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      compressedProfile: profile,
      error: error instanceof Error ? error.message : 'Unknown compression error',
    };
  }
}

/**
 * Extract compressed profile from AI response
 */
function extractCompressedProfile(
  response: any,
  originalProfile: UserMemoryProfile
): UserMemoryProfile | null {
  try {
    // Response can be either string or already-parsed object
    let parsedData: any;

    if (typeof response === 'string') {
      // String response - try to parse
      try {
        parsedData = JSON.parse(response);
      } catch {
        // Extract JSON from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[1]);
        } else {
          // Try to find JSON object in text
          const objectMatch = response.match(/\{[\s\S]*\}/);
          if (objectMatch) {
            parsedData = JSON.parse(objectMatch[0]);
          }
        }
      }
    } else if (typeof response === 'object' && response !== null) {
      // Already parsed object from structured output
      parsedData = response;
    }

    if (!parsedData) {
      throw new Error('No valid JSON found in response');
    }

    console.log('🗜️ Validating compressed data structure...');
    console.log('🗜️ Received sections:', Object.keys(parsedData));

    // Simple validation - just check if it's an object with at least ONE memory section
    const memorySections = ['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'];
    const hasAtLeastOneSection = memorySections.some(section => section in parsedData && parsedData[section]);

    if (!hasAtLeastOneSection) {
      console.error('🗜️ ERROR: No valid memory sections found in compressed data');
      console.error('🗜️ Parsed data:', parsedData);
      throw new Error('Compressed profile has no valid memory sections');
    }

    console.log('🗜️ ✅ Validation passed - replacing original memory with compressed version');

    // SIMPLE: Just replace the memory with compressed version
    // Keep only what AI returned, fill empty sections with {}
    const compressedProfile: UserMemoryProfile = {
      id: originalProfile.id,
      userId: originalProfile.userId,
      coreIdentity: parsedData.coreIdentity || {},
      personalCharacteristics: parsedData.personalCharacteristics || {},
      preferences: parsedData.preferences || {},
      relationship: parsedData.relationship || {},
      interactions: parsedData.interactions || {},
      context: parsedData.context || {},
      emotional: parsedData.emotional || {},
      practical: parsedData.practical || {},
      metadata: {
        confidenceLevel: originalProfile.metadata?.confidenceLevel || 0.7,
        source: 'compressed',
        extractedAt: originalProfile.metadata?.extractedAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        relevanceScore: originalProfile.metadata?.relevanceScore || 0.7,
      },
      version: originalProfile.version + 1,
      createdAt: originalProfile.createdAt,
      updatedAt: new Date().toISOString(),
    };

    console.log('🗜️ Compressed profile created with sections:', Object.keys(compressedProfile).filter(k =>
      memorySections.includes(k) && Object.keys((compressedProfile as any)[k] || {}).length > 0
    ));

    return compressedProfile;

  } catch (error) {
    console.error('🗜️ Failed to extract compressed profile:', error);
    return null;
  }
}

// ==================== MANUAL DEDUPLICATION (FALLBACK) ====================

/**
 * Manual deduplication and compression without AI
 * Used as fallback if AI compression fails
 */
export function manualCompression(profile: UserMemoryProfile): UserMemoryProfile {
  console.log('🗜️ Performing manual compression (fallback)...');

  const deduplicateArray = (arr: any[], maxItems: number = 10): any[] => {
    if (!Array.isArray(arr)) return [];

    // Remove exact duplicates (case-insensitive for strings)
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const item of arr) {
      // Handle different types
      if (typeof item === 'string') {
        const normalized = item.toLowerCase().trim();
        if (!seen.has(normalized) && item.trim()) {
          seen.add(normalized);
          unique.push(item);
        }
      } else if (typeof item === 'object' && item !== null) {
        // For objects, use JSON stringification for comparison
        const normalized = JSON.stringify(item);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          unique.push(item);
        }
      } else {
        // For other types (numbers, booleans), add directly
        unique.push(item);
      }
    }

    // Keep only top N items
    return unique.slice(0, maxItems);
  };

  const compressSection = (section: any, arrayLimits: { [key: string]: number } = {}): any => {
    if (!section || typeof section !== 'object') return section;

    const compressed: any = {};

    for (const [key, value] of Object.entries(section)) {
      if (Array.isArray(value)) {
        const limit = arrayLimits[key] || 8;
        compressed[key] = deduplicateArray(value, limit);
      } else if (typeof value === 'object' && value !== null) {
        compressed[key] = compressSection(value);
      } else if (typeof value === 'string' && value.length > 200) {
        // Truncate very long strings
        compressed[key] = value.substring(0, 197) + '...';
      } else {
        compressed[key] = value;
      }
    }

    return compressed;
  };

  return {
    ...profile,
    coreIdentity: compressSection(profile.coreIdentity),
    personalCharacteristics: compressSection(profile.personalCharacteristics, {
      interests: 8,
      hobbies: 8,
      personalityTraits: 6,
      values: 6,
    }),
    preferences: compressSection(profile.preferences),
    relationship: compressSection(profile.relationship),
    interactions: compressSection(profile.interactions, {
      conversationTopics: 15,
      expertiseAreas: 10,
    }),
    context: compressSection(profile.context),
    emotional: compressSection(profile.emotional),
    practical: compressSection(profile.practical, {
      skills: 10,
    }),
    metadata: {
      ...profile.metadata,
      lastUpdated: new Date().toISOString(),
      source: 'manual_compression',
    },
    version: profile.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export default {
  getMemorySize,
  formatBytes,
  compressMemoryProfile,
  manualCompression,
  MEMORY_SIZE_LIMITS,
  COMPRESSION_CONFIG,
};
