/**
 * ClaraSweetMemory.tsx
 * 
 * Sweet Memories Feature for ClaraVerse
 * Automatically extracts and stores user information from conversations
 * when streaming responses are reasonably fast (>10 tokens/second) and requests are reasonable in size.
 * 
 * This component operates independently from the main Clara assistant flow,
 * using OpenAI-compatible structured output for reliable data extraction.
 */

import { useEffect, useRef } from 'react';
import { indexedDBService } from '../services/indexedDB';
import { claraApiService } from '../services/claraApiService';

import type { ClaraMessage, ClaraAIConfig } from '../types/clara_assistant_types';
import { claraMemoryToastService } from '../services/claraMemoryToastService';

// ==================== MEMORY DATA INTERFACES ====================

export interface CoreIdentityInfo {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  nicknames?: string[];
  preferredName?: string;
  email?: string;
  phone?: string;
  age?: number;
  location?: string;
  occupation?: string;
  relationshipStatus?: string;
}

export interface PersonalCharacteristics {
  personalityTraits?: string[];
  communicationStyle?: 'formal' | 'informal' | 'casual' | 'professional';
  humorType?: string[];
  interests?: string[];
  hobbies?: string[];
  values?: string[];
  beliefs?: string[];
  goals?: {
    shortTerm?: string[];
    longTerm?: string[];
  };
}

export interface PreferencesAndBehavior {
  communicationPreferences?: {
    responseStyle?: 'detailed' | 'concise' | 'balanced';
    preferredChannels?: string[];
    responseTime?: 'immediate' | 'within_hours' | 'within_day';
  };
  decisionMakingStyle?: 'analytical' | 'intuitive' | 'collaborative' | 'independent';
  workStyle?: {
    environment?: 'remote' | 'office' | 'hybrid';
    meetingPreferences?: string[];
    productivityPatterns?: string[];
  };
  lifestylePreferences?: {
    diet?: string[];
    exercise?: string[];
    travel?: string[];
    entertainment?: string[];
  };
}

export interface RelationshipContext {
  relationshipType?: 'friend' | 'colleague' | 'family' | 'client' | 'acquaintance';
  relationshipHistory?: string[];
  connectionStrength?: 'close' | 'moderate' | 'distant';
  mutualConnections?: string[];
  sharedExperiences?: string[];
}

export interface InteractionHistory {
  conversationTopics?: string[];
  expertiseAreas?: string[];
  frequentQuestions?: string[];
  emotionalContext?: string[];
  supportNeeds?: string[];
}

export interface ContextualInfo {
  currentLifeSituation?: string[];
  availabilityPatterns?: string[];
  professionalContext?: {
    role?: string;
    company?: string;
    industry?: string;
    responsibilities?: string[];
  };
  lifeStage?: 'student' | 'early_career' | 'established' | 'retired' | 'transitioning';
}

export interface EmotionalAndSocialIntel {
  emotionalPatterns?: string[];
  stressTriggers?: string[];
  supportSystems?: string[];
  socialDynamics?: string[];
  boundaries?: string[];
}

export interface PracticalInfo {
  importantDates?: {
    birthday?: string;
    anniversaries?: string[];
    milestones?: string[];
  };
  dependencies?: string[];
  skills?: string[];
  resources?: string[];
  timeZone?: string;
}

export interface MemoryMetadata {
  confidenceLevel: number; // 0-1, how confident we are about this information
  source: 'direct_conversation' | 'observation' | 'inference';
  extractedAt: string; // ISO timestamp
  lastUpdated: string; // ISO timestamp
  relevanceScore: number; // 0-1, how important this information is
  sessionId?: string;
  messageId?: string;
}

export interface UserMemoryProfile {
  id: string;
  userId: string; // email or unique identifier
  coreIdentity: CoreIdentityInfo;
  personalCharacteristics: PersonalCharacteristics;
  preferences: PreferencesAndBehavior;
  relationship: RelationshipContext;
  interactions: InteractionHistory;
  context: ContextualInfo;
  emotional: EmotionalAndSocialIntel;
  practical: PracticalInfo;
  metadata: MemoryMetadata;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== EXTRACTION INTERFACES ====================

interface MemoryExtractionResponse {
  hasMemoryData: boolean;
  extractedMemory?: Partial<UserMemoryProfile>;
  confidence: number;
  reasoning?: string;
}

// ==================== CONSTANTS ====================

const MIN_WORD_COUNT = 3; // Minimum words required for memory extraction
const MAX_WORD_COUNT = 600; // Maximum words to avoid processing overly long requests
const MIN_CONFIDENCE_THRESHOLD = 0.3;
const EXTRACTION_TIMEOUT = 30000; // Fixed 30 seconds timeout for all memory extraction
const RATE_LIMIT_INTERVAL = 2000; // 2 seconds between extractions (reduced from 60 seconds)

// ==================== MEMORY EXTRACTION PROMPT ====================

const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are Clara's memory system - a natural, intuitive memory extractor that helps Clara remember what matters about the people she talks to.

Your role is to notice and remember ANYTHING that seems important, meaningful, or helpful for future conversations. Don't be robotic - be like a thoughtful friend who remembers details that matter.

WHAT TO REMEMBER:
- Anything the person tells you about themselves (name, where they live, what they do)
- Their interests, passions, hobbies - what makes them light up
- How they like to communicate (casual, formal, technical, creative)
- What they're working on, struggling with, excited about
- Their relationships, family, friends, pets - people who matter to them
- Technical skills, tools they use, problems they solve
- Their values, beliefs, what's important to them
- Goals, dreams, aspirations - where they want to go
- Preferences - favorite things, dislikes, opinions
- Emotional patterns - what makes them happy, stressed, motivated
- ANY unique detail that would help Clara be more helpful and personalized

GUIDELINES (not strict rules):
✓ Store information naturally - if they mention "I code in Python on my M2 Mac", remember both the language AND the hardware
✓ Use your judgment - if something feels important, it probably is
✓ Create new fields if needed - you're not limited to predefined categories
✓ Be flexible with categorization - put information where it makes the most sense
✓ Higher confidence (0.8-1.0) for explicit statements, lower (0.5-0.7) for implications
✓ If nothing meaningful to remember, that's okay - return hasMemoryData: false

IMPORTANT: You can store data in ANY format that makes sense:
- Add new properties to existing categories
- Create nested objects for complex information
- Use arrays for lists of related items
- Store whatever structure feels natural for the information

Think like Clara would think: "What would help me understand and help this person better next time we talk?"

Respond with a structured JSON object, but remember - the schema is FLEXIBLE. The categories (coreIdentity, personalCharacteristics, etc.) are suggestions, not limits.`;

// ==================== MAIN COMPONENT ====================`;

// ==================== MEMORY EXTRACTION SCHEMA ====================
// Note: This schema is kept for reference but not actively used since we switched to universal Clara API approach

// @ts-ignore - Schema kept for reference but not actively used
const MEMORY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    hasMemoryData: {
      type: "boolean",
      description: "Whether any meaningful memory data was extracted"
    },
    extractedMemory: {
      type: "object",
      description: "Extracted memory information",
      properties: {
        coreIdentity: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            nicknames: { type: "array", items: { type: "string" } },
            preferredName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            age: { type: "number" },
            location: { type: "string" },
            occupation: { type: "string" },
            relationshipStatus: { type: "string" }
          }
        },
        personalCharacteristics: {
          type: "object",
          properties: {
            personalityTraits: { type: "array", items: { type: "string" } },
            communicationStyle: { 
              type: "string", 
              enum: ["formal", "informal", "casual", "professional"] 
            },
            humorType: { type: "array", items: { type: "string" } },
            interests: { type: "array", items: { type: "string" } },
            hobbies: { type: "array", items: { type: "string" } },
            values: { type: "array", items: { type: "string" } },
            beliefs: { type: "array", items: { type: "string" } },
            goals: {
              type: "object",
              properties: {
                shortTerm: { type: "array", items: { type: "string" } },
                longTerm: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        preferences: {
          type: "object",
          properties: {
            communicationPreferences: {
              type: "object",
              properties: {
                responseStyle: { 
                  type: "string", 
                  enum: ["detailed", "concise", "balanced"] 
                },
                preferredChannels: { type: "array", items: { type: "string" } },
                responseTime: { 
                  type: "string", 
                  enum: ["immediate", "within_hours", "within_day"] 
                }
              }
            },
            decisionMakingStyle: { 
              type: "string", 
              enum: ["analytical", "intuitive", "collaborative", "independent"] 
            },
            workStyle: {
              type: "object",
              properties: {
                environment: { 
                  type: "string", 
                  enum: ["remote", "office", "hybrid"] 
                },
                meetingPreferences: { type: "array", items: { type: "string" } },
                productivityPatterns: { type: "array", items: { type: "string" } }
              }
            },
            lifestylePreferences: {
              type: "object",
              properties: {
                diet: { type: "array", items: { type: "string" } },
                exercise: { type: "array", items: { type: "string" } },
                travel: { type: "array", items: { type: "string" } },
                entertainment: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        interactions: {
          type: "object",
          properties: {
            conversationTopics: { type: "array", items: { type: "string" } },
            expertiseAreas: { type: "array", items: { type: "string" } },
            frequentQuestions: { type: "array", items: { type: "string" } },
            emotionalContext: { type: "array", items: { type: "string" } },
            supportNeeds: { type: "array", items: { type: "string" } }
          }
        },
        context: {
          type: "object",
          properties: {
            currentLifeSituation: { type: "array", items: { type: "string" } },
            availabilityPatterns: { type: "array", items: { type: "string" } },
            professionalContext: {
              type: "object",
              properties: {
                role: { type: "string" },
                company: { type: "string" },
                industry: { type: "string" },
                responsibilities: { type: "array", items: { type: "string" } }
              }
            },
            lifeStage: { 
              type: "string", 
              enum: ["student", "early_career", "established", "retired", "transitioning"] 
            }
          }
        },
        practical: {
          type: "object",
          properties: {
            importantDates: {
              type: "object",
              properties: {
                birthday: { type: "string" },
                anniversaries: { type: "array", items: { type: "string" } },
                milestones: { type: "array", items: { type: "string" } }
              }
            },
            skills: { type: "array", items: { type: "string" } },
            resources: { type: "array", items: { type: "string" } },
            timeZone: { type: "string" }
          }
        }
      }
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Overall confidence level of the extraction"
    },
    reasoning: {
      type: "string",
      description: "Brief explanation of what was extracted and why"
    }
  },
  required: ["hasMemoryData", "confidence"]
};
// ==================== MAIN COMPONENT ====================

interface ClaraSweetMemoryProps {
  isEnabled?: boolean;
  onMemoryExtracted?: (profile: UserMemoryProfile) => void;
  onError?: (error: string) => void;
}

const ClaraSweetMemory: React.FC<ClaraSweetMemoryProps> = ({
  isEnabled = true,
  onMemoryExtracted,
  onError
}) => {
  const processingRef = useRef<Set<string>>(new Set());
  const lastProcessedRef = useRef<number>(0);

  // ==================== CORE FUNCTIONALITY ====================

  /**
   * Initialize the memory store in IndexedDB (using settings store)
   */
  const initializeMemoryStore = async (): Promise<void> => {
    try {
      // Check if settings store exists - memory uses settings store with prefixed keys
      await indexedDBService.getAll('settings');
    } catch (error) {
      // console.log('🧠 Memory store will be created on first use');
    }
  };

  /**
   * Count words in a text string
   */
  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  /**
   * Check if we should process this interaction for memory extraction
   */
  const shouldProcessMemory = (
    userMessage: string,
    assistantMessage: ClaraMessage
  ): boolean => {
    // Check if feature is enabled
    if (!isEnabled) {
      // console.log('🧠 DEBUG: Feature disabled');
      return false;
    }

    // Check word count - skip if too short or too long
    const wordCount = countWords(userMessage);
    if (wordCount < MIN_WORD_COUNT) {
      // console.log(`🧠 DEBUG: Message too short (${wordCount} words, min: ${MIN_WORD_COUNT}), skipping memory extraction`);
      return false;
    }
    
    if (wordCount > MAX_WORD_COUNT) {
      // console.log(`🧠 DEBUG: Message too long (${wordCount} words, max: ${MAX_WORD_COUNT}), skipping memory extraction`);
      return false;
    }

    // Check if we're already processing this message
    const messageId = assistantMessage.id;
    if (processingRef.current.has(messageId)) {
      // console.log('🧠 DEBUG: Already processing this message:', messageId);
      return false;
    }

    // Rate limiting - reduced to allow more frequent memory extraction in conversations
    const now = Date.now();
    if (now - lastProcessedRef.current < RATE_LIMIT_INTERVAL) {
      // console.log(`🧠 DEBUG: Rate limiting memory extraction (last processed: ${lastProcessedRef.current}, now: ${now}, interval: ${RATE_LIMIT_INTERVAL}ms)`);
      return false;
    }

    // console.log('🧠 DEBUG: All checks passed - should process memory');
    return true;
  };

  /**
   * Fuzzy string matching for key names with tolerance for typos/variations
   */
  const fuzzyKeyMatch = (target: string, candidates: string[], threshold: number = 0.05): string | null => {
    const calculateSimilarity = (str1: string, str2: string): number => {
      const longer = str1.length > str2.length ? str1 : str2;
      const shorter = str1.length > str2.length ? str2 : str1;
      
      if (longer.length === 0) return 1.0;
      
      const editDistance = (s1: string, s2: string): number => {
        const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
        
        for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= s2.length; j++) {
          for (let i = 1; i <= s1.length; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
              matrix[j][i - 1] + 1,
              matrix[j - 1][i] + 1,
              matrix[j - 1][i - 1] + cost
            );
          }
        }
        
        return matrix[s2.length][s1.length];
      };
      
      return (longer.length - editDistance(shorter, longer)) / longer.length;
    };

    let bestMatch = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const similarity = calculateSimilarity(target.toLowerCase(), candidate.toLowerCase());
      if (similarity >= (1 - threshold) && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = candidate;
      }
    }
    
    return bestMatch;
  };

  /**
   * Extract and normalize JSON response with fuzzy key matching for common variations
   */
  const extractJSONFromResponse = (response: any): MemoryExtractionResponse | null => {
    console.log('🧠 DEBUG: extractJSONFromResponse called with:', typeof response, response);
    
    let parsedData: any = null;
    
    // Step 1: Extract raw JSON from various response formats
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      // Check if it's wrapped in a response object
      if (response.content) {
        parsedData = extractJSONFromResponse(response.content);
        if (parsedData) return parsedData;
      }
      if (response.message) {
        parsedData = extractJSONFromResponse(response.message);
        if (parsedData) return parsedData;
      }
      // Use the object directly
      parsedData = response;
    } else if (typeof response === 'string') {
      console.log('🧠 DEBUG: Attempting to extract JSON from string response');
      
      // First, try direct JSON parse
      try {
        parsedData = JSON.parse(response);
        console.log('🧠 DEBUG: Direct JSON parse successful');
      } catch (e) {
        console.log('🧠 DEBUG: Direct JSON parse failed, trying extraction methods');
        
        // Look for JSON blocks in markdown
        const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
          try {
            parsedData = JSON.parse(jsonBlockMatch[1]);
            console.log('🧠 DEBUG: JSON block extraction successful');
          } catch (e) {
            console.log('🧠 DEBUG: JSON block parse failed');
          }
        }
        
        // Look for JSON objects in the text
        if (!parsedData) {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsedData = JSON.parse(jsonMatch[0]);
              console.log('🧠 DEBUG: JSON object extraction successful');
            } catch (e) {
              console.log('🧠 DEBUG: JSON object parse failed');
            }
          }
        }
        
        // If the model returned conversational text instead of JSON, reject it
        if (!parsedData && (response.toLowerCase().includes('i apologize') || 
            response.toLowerCase().includes('i cannot') ||
            response.toLowerCase().includes('unable to generate'))) {
          console.error('🧠 ERROR: Model returned conversational text instead of JSON:', response);
          throw new Error('Model does not support structured output - returned conversational text');
        }
      }
    }
    
    if (!parsedData || typeof parsedData !== 'object') {
      console.error('🧠 ERROR: Could not extract valid JSON from response');
      return null;
    }
    
    console.log('🧠 DEBUG: Extracted raw JSON data:', parsedData);
    
    // Step 2: Transform AI output to canonical structure with flexible field mapping
    const transformToCanonicalStructure = (data: any): any => {
      const transformed: any = {};
      
      console.log('🧠 DEBUG: Transforming data with keys:', Object.keys(data));
      
      // 🔧 CRITICAL FIX: Handle extractedInformation and extractedMemories array formats first
      const processMemoryArray = (arrayData: any[], arrayName: string) => {
        console.log(`🧠 DEBUG: Processing ${arrayName} array with ${arrayData.length} items`);
        
        arrayData.forEach((item: any, index: number) => {
          console.log(`🧠 DEBUG: Processing ${arrayName} item ${index}:`, item);
          
          // Handle different item structures
          let category: string, value: any, key: string;
          
          if (item.category && (item.data || item.value)) {
            // Format: {category: "Personal identity", data: "John" / value: "John"}
            category = item.category.toLowerCase();
            value = item.data || item.value;
            key = item.key || category;
          } else if (item.key && item.value) {
            // Format: {key: "name", value: "John", category?: "Personal identity"}
            key = item.key.toLowerCase();
            value = item.value;
            category = item.category?.toLowerCase() || key;
          } else {
            console.log(`🧠 WARN: Unrecognized ${arrayName} item format:`, item);
            return;
          }
          
          // Map categories to our canonical structure
          let targetSection = 'personalCharacteristics'; // Default section
          let fieldName = key;
          
          if (category.includes('identity') || category.includes('personal') || 
              key === 'name' || key === 'firstname' || key === 'lastname' || 
              key === 'location' || key === 'occupation' || key === 'fullname') {
            targetSection = 'coreIdentity';
            // Map specific identity fields
            if (key === 'name' || key === 'fullname') fieldName = 'fullName';
            else if (key === 'firstname') fieldName = 'firstName';
            else if (key === 'lastname') fieldName = 'lastName';
            else if (key === 'location') fieldName = 'location';
            else if (key === 'occupation') fieldName = 'occupation';
          } else if (category.includes('interest') || category.includes('hobby') || category.includes('like')) {
            targetSection = 'personalCharacteristics';
            if (!transformed[targetSection]) transformed[targetSection] = {};
            if (!transformed[targetSection].interests) transformed[targetSection].interests = [];
            transformed[targetSection].interests.push(value);
            console.log(`🧠 MAPPED: "${value}" → ${targetSection}.interests`);
            return; // Early return for interests
          } else if (category.includes('preference') || category.includes('favorite')) {
            targetSection = 'preferences';
            fieldName = category.replace(/[^a-z]/g, '') || key;
          } else if (category.includes('work') || category.includes('technology') || category.includes('goal')) {
            targetSection = 'practical';
          } else if (category.includes('emotion') || category.includes('value') || category.includes('belief')) {
            targetSection = 'personalCharacteristics';
            fieldName = category.replace(/[^a-z]/g, '') || key;
          }
          
          // Initialize target section if needed
          if (!transformed[targetSection]) transformed[targetSection] = {};
          
          // Store the value
          transformed[targetSection][fieldName] = value;
          console.log(`🧠 MAPPED: "${value}" → ${targetSection}.${fieldName}`);
        });
        
        console.log(`🧠 DEBUG: After processing ${arrayName} array:`, transformed);
      };
      
      // Handle extractedInformation array format
      if (data.extractedInformation && Array.isArray(data.extractedInformation)) {
        processMemoryArray(data.extractedInformation, 'extractedInformation');
      }
      
      // Handle extractedMemories array format (common LLM output)
      if (data.extractedMemories && Array.isArray(data.extractedMemories)) {
        processMemoryArray(data.extractedMemories, 'extractedMemories');
      }
      
      // Map AI structure variations to our canonical structure using dynamic pattern matching
      const createDynamicMapping = (data: any): { [key: string]: string } => {
        const mappings: { [key: string]: string } = {};
        const dataKeys = Object.keys(data);
        
        // Define pattern-based mapping rules
        const mappingRules = [
          // Core Identity patterns
          { patterns: ['identity', 'personal', 'name', 'location', 'occupation', 'basic'], target: 'coreIdentity' },
          
          // Personal Characteristics patterns  
          { patterns: ['characteristics', 'personality', 'traits', 'interests', 'hobbies'], target: 'personalCharacteristics' },
          
          // Preferences patterns (HIGHEST PRIORITY for preference-related keys)
          { patterns: ['preferences', 'communicationpreferences', 'lifestylepreferences', 'likes', 'favorites'], target: 'preferences' },
          
          // Relationship patterns
          { patterns: ['relationships', 'family', 'social', 'connections'], target: 'relationship' },
          
          // Context patterns
          { patterns: ['context', 'background', 'situation', 'work', 'life'], target: 'context' },
          
          // Emotional patterns
          { patterns: ['emotional', 'emotions', 'feelings', 'values', 'beliefs'], target: 'emotional' },
          
          // Practical patterns
          { patterns: ['practical', 'logistics', 'details', 'technology', 'goals', 'aspirations'], target: 'practical' },
          
          // Interactions patterns (removed 'communication' to avoid conflict with communicationPreferences)
          { patterns: ['interactions', 'interactionhistory', 'conversationhistory', 'history'], target: 'interactions' },

          // Notes and additional information
          { patterns: ['notes', 'additionalnotes', 'additional', 'misc', 'miscellaneous', 'other'], target: 'context' },

          // Other common variations
          { patterns: ['workcontext', 'work_context', 'work'], target: 'practical' },
          { patterns: ['technology', 'tech'], target: 'practical' },
          { patterns: ['personalidentity', 'personal_identity'], target: 'coreIdentity' },
          { patterns: ['emotionalintel', 'emotional_intel'], target: 'emotional' },
          { patterns: ['interactionhistory', 'interaction_history'], target: 'interactions' },
          { patterns: ['preferencesandbehavior', 'preferences_and_behavior'], target: 'preferences' },
          { patterns: ['relationshipcontext', 'relationship_context'], target: 'relationship' },
          { patterns: ['practicalinfo', 'practical_info'], target: 'practical' },
          { patterns: ['personalcharacteristics', 'personal_characteristics'], target: 'personalCharacteristics' },
          { patterns: ['coreidentity', 'core_identity'], target: 'coreIdentity' },
          { patterns: ['lifestylepreferences', 'lifestyle_preferences'], target: 'preferences' },
          { patterns: ['emotionalandsocialintel', 'emotional_and_social_intel'], target: 'emotional' },
          { patterns: ['contextualinfo', 'contextual_info'], target: 'context' }

        ];
        
        // Apply pattern matching to each data key
        for (const dataKey of dataKeys) {
          const lowerKey = dataKey.toLowerCase();
          const cleanKey = lowerKey.replace(/[^a-z]/g, ''); // Remove all non-letters
          let bestMatch = { target: 'personalCharacteristics', score: 0, pattern: '' }; // Default fallback
          
          console.log(`🧠 PATTERN MATCH: Analyzing key "${dataKey}" (lowercase: "${lowerKey}", clean: "${cleanKey}")`);
          
          for (const rule of mappingRules) {
            for (const pattern of rule.patterns) {
              const cleanPattern = pattern.replace(/[^a-z]/g, '');
              
              // Calculate similarity score
              let score = 0;
              let matchType = '';
              
              if (lowerKey === pattern || cleanKey === cleanPattern) {
                score = 1.0; // Exact match
                matchType = 'EXACT';
              } else if (lowerKey.includes(pattern) || cleanKey.includes(cleanPattern)) {
                score = 0.9; // Contains pattern
                matchType = 'CONTAINS';
              } else if (pattern.includes(lowerKey) || cleanPattern.includes(cleanKey)) {
                score = 0.8; // Pattern contains key
                matchType = 'PARTIAL';
              } else if (lowerKey.startsWith(pattern) || cleanKey.startsWith(cleanPattern)) {
                score = 0.85; // Starts with pattern
                matchType = 'STARTSWITH';
              }
              
              if (score > bestMatch.score) {
                bestMatch = { target: rule.target, score, pattern };
                console.log(`  - ${matchType} match with pattern "${pattern}" → "${rule.target}" (score: ${score})`);
              }
            }
          }
          
          // Only map if we have reasonable confidence
          if (bestMatch.score > 0.5) {
            mappings[dataKey] = bestMatch.target;
            console.log(`🧠 ✅ MAPPED: "${dataKey}" → "${bestMatch.target}" (score: ${bestMatch.score}, pattern: "${bestMatch.pattern}")`);
          } else {
            // Default mapping for unrecognized keys
            mappings[dataKey] = 'context'; // Changed default from personalCharacteristics to context for misc data
            console.log(`🧠 ⚠️ DEFAULT MAP: "${dataKey}" → "context" (fallback, score: ${bestMatch.score})`);
          }
        }
        
        return mappings;
      };
      
      const mappings = createDynamicMapping(data);
      
      // Transform each section with flexible field handling
      for (const [aiKey, canonicalKey] of Object.entries(mappings)) {
        if (data[aiKey]) {
          console.log(`🧠 TRANSFORM: ${aiKey} → ${canonicalKey}:`, data[aiKey]);
          if (!transformed[canonicalKey]) {
            transformed[canonicalKey] = {};
          }
          
          // Smart merging: Handle different data structures
          const aiData = data[aiKey];
          
          if (aiKey === 'interests' && typeof aiData === 'object') {
            // Map interests to personalCharacteristics.interests
            if (!transformed[canonicalKey].interests) {
              transformed[canonicalKey].interests = [];
            }
            
            // Handle various interest formats
            if (Array.isArray(aiData)) {
              transformed[canonicalKey].interests.push(...aiData);
            } else if (typeof aiData === 'object') {
              // Extract interest categories
              Object.keys(aiData).forEach(category => {
                transformed[canonicalKey].interests.push(category);
                if (Array.isArray(aiData[category])) {
                  aiData[category].forEach((item: any) => {
                    if (typeof item === 'string') {
                      transformed[canonicalKey].interests.push(item);
                    } else if (item.category) {
                      transformed[canonicalKey].interests.push(item.category);
                    }
                  });
                }
              });
            }
          } else if (aiKey === 'workContext' || aiKey === 'technology') {
            // Map to practical info with specific fields
            Object.keys(aiData).forEach(subKey => {
              const fieldName = `${aiKey}_${subKey}`; // e.g., "workContext_hardware"
              transformed[canonicalKey][fieldName] = aiData[subKey];
            });
          } else if (aiKey === 'personalIdentity') {
            // Handle devices and other personal info
            Object.keys(aiData).forEach(subKey => {
              if (subKey === 'devices') {
                transformed[canonicalKey]['personalDevices'] = aiData[subKey];
              } else {
                transformed[canonicalKey][subKey] = aiData[subKey];
              }
            });
          } else {
            // Standard merge for other fields
            transformed[canonicalKey] = { ...transformed[canonicalKey], ...aiData };
          }
        }
      }
      
      // Also include any data that already matches our canonical structure or is otherwise unmapped
      const canonicalTargets = ['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'];
      const allDataKeys = Object.keys(data);
      
      for (const key of allDataKeys) {
        // Skip metadata keys
        if (['hasMemoryData', 'confidence', 'reasoning', 'metadata', 'extractedAt', 'source', 'relevanceScore'].includes(key)) {
          continue;
        }
        
        // If it's already a canonical key, preserve it
        if (canonicalTargets.includes(key)) {
          console.log(`🧠 CANONICAL: Using existing ${key}:`, data[key]);
          transformed[key] = { ...transformed[key], ...data[key] };
        }
        // If we haven't mapped this key yet and it has data, try to include it
        else if (!mappings[key] && data[key] && typeof data[key] === 'object') {
          console.log(`🧠 UNMAPPED: Adding unmapped key "${key}" to personalCharacteristics`);
          if (!transformed.personalCharacteristics) transformed.personalCharacteristics = {};
          transformed.personalCharacteristics[key] = data[key];
        }
      }
      
      console.log('🧠 DEBUG: Transformed canonical structure:', transformed);
      return transformed;
    };
    
    // NEW: Recursively flatten objects of the form { value, confidence } -> value
    // Also remove numbered keys (0, 1, 2, etc.) that represent character arrays
    const flattenValueConfidence = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => flattenValueConfidence(item));
      }
      if (obj && typeof obj === 'object') {
        // If this object looks like { value: X, confidence: Y }, return X
        const keys = Object.keys(obj);
        if (('value' in obj) && ('confidence' in obj) && keys.length <= 2) {
          return flattenValueConfidence(obj.value);
        }
        
        // Clean up objects that have both numbered keys and a value field
        if ('value' in obj) {
          const hasNumberedKeys = keys.some(key => !isNaN(Number(key)));
          if (hasNumberedKeys) {
            // Extract only the value and non-numbered keys
            const cleanedObj: any = {};
            for (const key of keys) {
              if (isNaN(Number(key))) { // Keep non-numbered keys
                cleanedObj[key] = flattenValueConfidence(obj[key]);
              }
            }
            return cleanedObj;
          }
        }
        
        const result: any = {};
        for (const key of keys) {
          // Skip numbered keys that represent character arrays
          if (!isNaN(Number(key))) {
            continue;
          }
          result[key] = flattenValueConfidence(obj[key]);
        }
        return result;
      }
      return obj;
    };
    
    // Step 3: Normalize the structure with fuzzy key matching
    const normalizeMemoryData = (data: any): MemoryExtractionResponse => {
      const keys = Object.keys(data);
      console.log('🧠 DEBUG: Available keys for fuzzy matching:', keys);
      
      // Find hasMemoryData or similar
      const hasMemoryDataKey = fuzzyKeyMatch('hasMemoryData', keys) || 'hasMemoryData';
      const providedHasMemoryData = data[hasMemoryDataKey];
      
      // Dynamically determine what keys are present (excluding metadata keys)
      const excludeKeys = ['hasMemoryData', 'confidence', 'reasoning', 'metadata', 'extractedAt', 'source', 'relevanceScore'];
      const memoryDataVariations = ['extractedMemory', 'memoryData', 'memory', 'userData', 'userInfo', 'data'];
      
      // Check if there's an explicit memory container key
      const explicitMemoryKey = keys.find(k => 
        fuzzyKeyMatch('extractedMemory', [k]) || 
        memoryDataVariations.some(variation => fuzzyKeyMatch(variation, [k], 0.1))
      );
      
      // Dynamically detect data keys (any key that's not in exclude list and contains object data)
      const potentialDataKeys = keys.filter(key => {
        if (excludeKeys.includes(key)) return false;
        const value = data[key];
        return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
      });
      
      console.log('🧠 DEBUG: Dynamic key detection:');
      console.log('  - Available keys:', keys);
      console.log('  - Excluded metadata keys:', excludeKeys);
      console.log('  - Explicit memory key found:', explicitMemoryKey);
      console.log('  - Potential data keys detected:', potentialDataKeys);
      
      let rawExtractedMemory: any = {};
      
      if (explicitMemoryKey) {
        // Use the explicit memory container
        rawExtractedMemory = data[explicitMemoryKey] || {};
        console.log('🧠 DEBUG: Using explicit memory container:', explicitMemoryKey);
      } else if (potentialDataKeys.length > 0) {
        // Build from all detected data keys at top level
        rawExtractedMemory = {};
        for (const key of potentialDataKeys) {
          rawExtractedMemory[key] = data[key];
        }
        console.log('🧠 DEBUG: Built from detected data keys:', potentialDataKeys);
      } else {
        // Fallback: use any non-excluded keys
        rawExtractedMemory = {};
        for (const key of keys) {
          if (!excludeKeys.includes(key)) {
            rawExtractedMemory[key] = data[key];
          }
        }
        console.log('🧠 DEBUG: Using fallback - all non-excluded keys');
      }
      
      console.log('🧠 DEBUG: Raw extracted memory keys:', Object.keys(rawExtractedMemory));
      
      // Transform AI structure to canonical structure
      let extractedMemory = transformToCanonicalStructure(rawExtractedMemory);
      
      // Flatten { value, confidence } pairs to raw values
      extractedMemory = flattenValueConfidence(extractedMemory);
      
      // Determine confidence
      const confidenceKey = fuzzyKeyMatch('confidence', keys) || 'confidence';
      let confidence = data[confidenceKey];
      if (confidence === undefined && data.metadata && typeof data.metadata.confidenceLevel === 'number') {
        confidence = data.metadata.confidenceLevel;
      }
      if (typeof confidence !== 'number') {
        confidence = 0.5;
      }
      
      // Reasoning if any
      const reasoningKey = fuzzyKeyMatch('reasoning', keys) || 'reasoning';
      const reasoning = data[reasoningKey];
      
      // Compute hasMemoryData: require actual data; respect explicit false
      // IMPORTANT: Ignore metadata fields like "confidence", "explanation" when checking for data
      const metadataFields = ['confidence', 'explanation', 'reasoning', 'metadata', 'source'];
      
      const hasData = Object.values(extractedMemory || {}).some(section => {
        if (!section) return false;
        if (typeof section === 'string' && section.trim() !== '' && section !== 'unknown') return true;
        if (typeof section === 'object' && Object.keys(section).length > 0) {
          // Check if the object has meaningful values (not just empty objects or metadata)
          return Object.values(section).some(value => {
            if (typeof value === 'string') return value.trim() !== '' && value !== 'unknown';
            if (typeof value === 'number') return true;
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'object' && value !== null) {
              // For nested objects, check if they have any non-empty values
              // BUT exclude metadata-only objects
              const valueKeys = Object.keys(value);
              const hasNonMetadataKeys = valueKeys.some(k => !metadataFields.includes(k));
              
              if (!hasNonMetadataKeys) {
                // Skip if this object only has metadata fields
                console.log('🧠 DEBUG: Skipping metadata-only nested object:', valueKeys);
                return false;
              }
              
              return Object.entries(value).some(([nestedKey, nestedValue]) => {
                // Skip metadata fields
                if (metadataFields.includes(nestedKey)) return false;
                
                if (typeof nestedValue === 'string') return nestedValue.trim() !== '' && nestedValue !== 'unknown';
                if (typeof nestedValue === 'number') return true;
                if (Array.isArray(nestedValue)) return nestedValue.length > 0;
                return nestedValue != null;
              });
            }
            return value != null;
          });
        }
        return false;
      });
      
      const hasMemoryData = hasData && providedHasMemoryData !== false;
      
      console.log('🧠 DEBUG: Data validation result:');
      console.log('  - extractedMemory keys:', Object.keys(extractedMemory || {}));
      console.log('  - extractedMemory full data:', JSON.stringify(extractedMemory, null, 2));
      console.log('  - hasData:', hasData);
      console.log('  - providedHasMemoryData:', providedHasMemoryData);
      console.log('  - final hasMemoryData:', hasMemoryData);
      
      // Debug each section to see what data exists
      if (extractedMemory) {
        Object.entries(extractedMemory).forEach(([section, data]) => {
          if (data && typeof data === 'object') {
            const dataKeys = Object.keys(data);
            console.log(`🧠 DEBUG: Section "${section}" has ${dataKeys.length} keys:`, dataKeys);
            console.log(`  - Data:`, JSON.stringify(data, null, 2));
          }
        });
      }
      
      const result: MemoryExtractionResponse = {
        hasMemoryData,
        extractedMemory,
        confidence,
        reasoning
      };
      
      console.log('🧠 DEBUG: Normalized memory extraction response:', JSON.stringify(result, null, 2));
      return result;
    };
    
    return normalizeMemoryData(parsedData);
  };

  /**
   * Make a direct OpenAI-compatible structured output API call
   * Uses JSON schema enforcement for guaranteed valid responses
   */
  const callStructuredMemoryExtraction = async (
    userMessage: string,
    conversationContext: string[],
    currentUserInfo: Partial<UserMemoryProfile> | undefined,
    provider: any,
    model: string
  ): Promise<MemoryExtractionResponse | null> => {
    
    // Extract actual model name (remove provider prefix if present)
    // e.g., "eb8e82fd-231a-45e8-9e02-08bf38de1394:gemma-3-4b-it-4b" -> "gemma-3-4b-it-4b"
    const actualModelName = model.includes(':') ? model.split(':').pop() || model : model;
    
    console.log('🧠 DEBUG: Model name extraction:');
    console.log('  - Original:', model);
    console.log('  - Extracted:', actualModelName);
    
    const extractionPrompt = `What should Clara remember from this conversation?

USER MESSAGE: "${userMessage}"

CONVERSATION CONTEXT: ${conversationContext.length > 0 ? conversationContext.join('\n') : 'No previous context'}

WHAT CLARA ALREADY KNOWS: ${currentUserInfo ? JSON.stringify(currentUserInfo, null, 2) : 'This is a new person - Clara knows nothing yet'}

Be thoughtful and natural. What details from this conversation would help Clara be more helpful, more personalized, and more understanding in future conversations? Store whatever feels important in whatever format makes sense.`;

    // Build the JSON schema for structured output with FLEXIBLE sections
    // Each section allows additional properties so Clara can store ANY information she finds valuable
    const memorySchema = {
      type: "object",
      properties: {
        hasMemoryData: {
          type: "boolean",
          description: "Whether any meaningful memory data was extracted"
        },
        confidence: {
          type: "number",
          description: "Overall confidence level of the extraction (0-1)"
        },
        reasoning: {
          type: "string",
          description: "Brief explanation of what was extracted and why Clara found it valuable"
        },
        extractedMemory: {
          type: "object",
          properties: {
            coreIdentity: {
              type: "object",
              description: "Basic identity information - name, location, occupation, age, etc. Store anything that defines who the person is.",
              properties: {
                fullName: { type: "string" },
                firstName: { type: "string" },
                lastName: { type: "string" },
                nicknames: { type: "array", items: { type: "string" } },
                preferredName: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                age: { type: "number" },
                location: { type: "string" },
                occupation: { type: "string" },
                relationshipStatus: { type: "string" }
              },
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any identity-related data
            },
            personalCharacteristics: {
              type: "object",
              description: "Personality, traits, interests, hobbies, values, beliefs - anything that describes their character and what makes them unique.",
              properties: {
                personalityTraits: { type: "array", items: { type: "string" } },
                communicationStyle: { type: "string" },
                humorType: { type: "array", items: { type: "string" } },
                interests: { type: "array", items: { type: "string" } },
                hobbies: { type: "array", items: { type: "string" } },
                values: { type: "array", items: { type: "string" } },
                beliefs: { type: "array", items: { type: "string" } }
              },
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any personality-related data
            },
            preferences: {
              type: "object",
              description: "What they like, dislike, prefer - communication style, food, lifestyle, anything preference-related.",
              properties: {
                communicationPreferences: { type: "object", additionalProperties: true },
                lifestylePreferences: { type: "object", additionalProperties: true }
              },
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any preference data
            },
            interactions: {
              type: "object",
              description: "Topics discussed, expertise areas, conversation patterns, anything about how they interact.",
              properties: {
                conversationTopics: { type: "array", items: { type: "string" } },
                expertiseAreas: { type: "array", items: { type: "string" } }
              },
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any interaction data
            },
            context: {
              type: "object",
              description: "Life situation, background, professional context, current circumstances - any contextual information.",
              properties: {
                currentLifeSituation: { type: "array", items: { type: "string" } },
                professionalContext: { type: "object", additionalProperties: true }
              },
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any contextual data
            },
            practical: {
              type: "object",
              description: "Skills, tools they use, timezone, schedules, goals, plans - any practical information.",
              properties: {
                skills: { type: "array", items: { type: "string" } },
                timeZone: { type: "string" }
              },
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any practical data
            },
            relationship: {
              type: "object",
              description: "Relationships with others, family, friends, social connections, feelings about relationships.",
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any relationship data
            },
            emotional: {
              type: "object",
              description: "Emotional state, feelings, mental health, emotional patterns, coping mechanisms.",
              additionalProperties: true  // 🔓 FLEXIBLE: Allow any emotional data
            }
          },
          additionalProperties: true  // 🔓 FLEXIBLE: Allow NEW categories Clara finds valuable
        }
      },
      required: ["hasMemoryData", "confidence"],
      additionalProperties: false
    };

    const payload = {
      model: actualModelName, // Use the extracted model name without provider prefix
      messages: [
        { 
          role: 'system', 
          content: MEMORY_EXTRACTION_SYSTEM_PROMPT 
        },
        { 
          role: 'user', 
          content: extractionPrompt 
        }
      ],
      temperature: 0.1,
      max_tokens: 4000,
      
      // OpenAI structured outputs with JSON schema
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "memory_extraction_response",
          strict: true,
          schema: memorySchema
        }
      }
    };

    console.log('🧠 DEBUG: Making structured output API call');
    console.log('  - Provider:', provider.name);
    console.log('  - Model (original):', model);
    console.log('  - Model (extracted):', actualModelName);
    console.log('  - Base URL:', provider.baseUrl);

    // Build correct URL - baseUrl might already include /v1
    const baseUrl = provider.baseUrl?.replace(/\/+$/, '') || ''; // Remove trailing slashes
    const endpoint = baseUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
    const fullUrl = `${baseUrl}${endpoint}`;
    
    console.log('🧠 DEBUG: Full API URL:', fullUrl);

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey || ''}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🧠 ERROR: Structured API call failed:', response.status, errorText);
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('🧠 DEBUG: Structured output received:', result);
    
    // Response is guaranteed valid JSON matching schema
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in API response');
    }
    
    const parsedContent = JSON.parse(content);
    console.log('🧠 DEBUG: Parsed structured content:', parsedContent);
    
    // IMPORTANT: Run structured output through transformation to handle non-canonical keys
    // Even though we use schema, LLMs can still return keys like "communicationPreferences" 
    // instead of organizing them into canonical sections like "preferences"
    const transformedResult = extractJSONFromResponse(parsedContent);
    
    if (!transformedResult) {
      console.warn('🧠 WARN: Failed to transform structured output, returning raw');
      return parsedContent as MemoryExtractionResponse;
    }
    
    console.log('🧠 DEBUG: Transformed structured output:', transformedResult);
    return transformedResult;
  };

  /**
   * Extract memory data using structured output with retry logic
   */
  const extractMemoryData = async (
    userMessage: string,
    conversationContext: string[],
    currentUserInfo?: Partial<UserMemoryProfile>,
    aiConfig?: ClaraAIConfig,
    tokenSpeed: number = 0,
    retryAttempt = 0
  ): Promise<MemoryExtractionResponse | null> => {
    const maxRetries = 2; // Maximum number of retry attempts
    const baseDelay = 2000; // Base delay for exponential backoff
    
    try {
      // Get provider and model from aiConfig (passed from the assistant input)
      if (!aiConfig?.provider || !aiConfig?.models?.text) {
        console.error('🧠 ERROR: No provider or model specified in aiConfig');
        return null;
      }

      // Get the provider details from the provider service
      const { claraProviderService } = await import('../services/claraProviderService');
      const providers = await claraProviderService.getProviders();
      const currentProvider = providers.find(p => p.id === aiConfig.provider);
      
      if (!currentProvider) {
        console.error('🧠 ERROR: Provider not found:', aiConfig.provider);
        return null;
      }

      const currentModel = aiConfig.models.text;

      console.log('🧠 DEBUG: Memory extraction config (from aiConfig):');
      console.log('  - Provider:', currentProvider.name, `(${currentProvider.type})`);
      console.log('  - Provider ID:', aiConfig.provider);
      console.log('  - Model:', currentModel);
      console.log('  - Base URL:', currentProvider.baseUrl);

      // Always try structured output first (works with all OpenAI-compatible endpoints)
      console.log('🧠 DEBUG: ✅ Attempting structured output (default for all providers)');
      try {
        const result = await callStructuredMemoryExtraction(
          userMessage,
          conversationContext,
          currentUserInfo,
          currentProvider,
          currentModel
        );
        
        if (result) {
          console.log('🧠 ✅ Structured extraction successful');
          return result;
        }
      } catch (structuredError) {
        console.warn('🧠 ⚠️ Structured extraction failed, falling back to prompt-based:', structuredError);
        // Fall through to prompt-based extraction
      }

      // Fallback: prompt-based extraction (original method)
      const extractionPrompt = `What should Clara remember from this conversation? Be natural and thoughtful.

USER MESSAGE: "${userMessage}"

CONVERSATION CONTEXT: ${conversationContext.length > 0 ? conversationContext.join('\n') : 'No previous context'}

WHAT CLARA ALREADY KNOWS: ${currentUserInfo ? JSON.stringify(currentUserInfo, null, 2) : 'This is a new person - Clara knows nothing yet'}

Store whatever feels important in whatever format makes sense. You can create new fields, nested objects, arrays - whatever captures the information naturally. Focus on what would help Clara be more helpful and personalized in future conversations.`;

      // Get current AI configuration dynamically or use fallback
      const currentAIConfig = aiConfig || {
        provider: 'ollama', // Fallback provider
        models: {
          text: 'Qwen3-0.6B-Q8_0.gguf', // Fallback model
          vision: 'Qwen3-0.6B-Q8_0.gguf'
        },
        parameters: {
          temperature: 0.1,
          maxTokens: 4000,
          topP: 1.0,
          topK: 40,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0,
          repetitionPenalty: 1.0,
          minP: 0.0,
          typicalP: 1.0,
          seed: null,
          stop: []
        },
        features: {
          enableTools: false,
          enableRAG: false,
          enableStreaming: false,
          enableVision: false,
          autoModelSelection: false,
          enableMCP: false,
          enableStructuredToolCalling: true,
          enableNativeJSONSchema: true,
          enableMemory: false
        },
        autonomousAgent: {
          enabled: false,
          maxRetries: 1,
          retryDelay: 1000,
          enableSelfCorrection: false,
          enableToolGuidance: false,
          enableProgressTracking: false,
          maxToolCalls: 1,
          confidenceThreshold: 0.7,
          enableChainOfThought: false,
          enableErrorLearning: false
        }
      };
      
      console.log('🧠 DEBUG: AI Config status:', aiConfig ? 'provided' : 'using fallback');

      // Create structured output config based on current provider/model
      const extractionConfig: ClaraAIConfig = {
        provider: currentAIConfig.provider,
        models: {
          text: currentAIConfig.models.text || 'Qwen3-0.6B-Q8_0.gguf',
          vision: currentAIConfig.models.vision || 'Qwen3-0.6B-Q8_0.gguf'
        },
        parameters: {
          temperature: 0.1, // Low temperature for consistent extraction
          maxTokens: 4000,
          topP: 1.0,
          topK: 40,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0,
          repetitionPenalty: 1.0,
          minP: 0.0,
          typicalP: 1.0,
          seed: null,
          stop: []
        },
        features: {
          enableTools: false,
          enableRAG: false,
          enableStreaming: false, // Disable streaming for structured output
          enableVision: false,
          autoModelSelection: false,
          enableMCP: false,
          enableStructuredToolCalling: true, // Force structured output ALWAYS
          enableNativeJSONSchema: true, // Force native JSON schema ALWAYS
          enableMemory: false // Disable memory for memory extraction to avoid recursion
        },
        autonomousAgent: {
          enabled: false,
          maxRetries: 1,
          retryDelay: 1000,
          enableSelfCorrection: false,
          enableToolGuidance: false,
          enableProgressTracking: false,
          maxToolCalls: 1,
          confidenceThreshold: 0.7,
          enableChainOfThought: false,
          enableErrorLearning: false
        }
      };

      // Use fixed 60-second timeout for all memory extractions
      console.log(`🧠 DEBUG: Using fixed timeout: ${EXTRACTION_TIMEOUT/1000}s`);
      
      // Send extraction request with fixed timeout using structured output
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Memory extraction timeout after ${EXTRACTION_TIMEOUT/1000} seconds - this may indicate the model is taking too long to process the request or the server is overloaded`)), EXTRACTION_TIMEOUT)
      );

      // UNIVERSAL APPROACH: Always use Clara API service for memory extraction
      // This removes dependency on specific providers and works with any configured provider
      console.log('🧠 DEBUG: Using universal Clara API service for memory extraction');
      console.log('  - AI Config provided:', !!currentAIConfig);
      console.log('  - Model:', currentAIConfig?.models?.text || 'default');
      console.log('  - enableStructuredToolCalling:', extractionConfig.features.enableStructuredToolCalling);
      console.log('  - enableNativeJSONSchema:', extractionConfig.features.enableNativeJSONSchema);
      console.log('  - Fixed timeout:', EXTRACTION_TIMEOUT/1000, 'seconds');
      
      // Use Clara API service which works with any provider
      // The structured output configuration should be respected by the underlying provider
      const extractionPromise = claraApiService.sendChatMessage(
        extractionPrompt,
        extractionConfig, // This has structured output enabled
        [], // No attachments
        MEMORY_EXTRACTION_SYSTEM_PROMPT,
        [] // No conversation history for extraction
      );

      console.log('🧠 DEBUG: About to make API call with selected method');
      const result = await Promise.race([extractionPromise, timeoutPromise]);
      console.log('🧠 DEBUG: API call completed, processing response...');

      // Use the robust JSON extraction function
      const extractionResult = extractJSONFromResponse(result);
      
      if (!extractionResult) {
        console.error('🧠 ERROR: Failed to extract valid memory data from response');
        return null;
      }
      
      // 🔍 DEBUG: Log extracted memory data
      console.log('🧠 DEBUG: Raw API response:', result.content || result);
      console.log('🧠 DEBUG: Parsed extraction result:', {
        hasMemoryData: extractionResult.hasMemoryData,
        confidence: extractionResult.confidence,
        reasoning: extractionResult.reasoning,
        extractedMemory: extractionResult.extractedMemory
      });
      
      if (extractionResult.hasMemoryData && extractionResult.extractedMemory) {
        console.log('🧠 DEBUG: Extracted memory sections:');
        if (extractionResult.extractedMemory.coreIdentity) {
          console.log('  - Core Identity:', extractionResult.extractedMemory.coreIdentity);
        }
        if (extractionResult.extractedMemory.personalCharacteristics) {
          console.log('  - Personal Characteristics:', extractionResult.extractedMemory.personalCharacteristics);
        }
        if (extractionResult.extractedMemory.preferences) {
          console.log('  - Preferences:', extractionResult.extractedMemory.preferences);
        }
        if (extractionResult.extractedMemory.interactions) {
          console.log('  - Interactions:', extractionResult.extractedMemory.interactions);
        }
        if (extractionResult.extractedMemory.context) {
          console.log('  - Context:', extractionResult.extractedMemory.context);
        }
        if (extractionResult.extractedMemory.practical) {
          console.log('  - Practical Info:', extractionResult.extractedMemory.practical);
        }
      }
      
      return extractionResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('🧠 Memory extraction failed:', errorMessage);
      
      // Retry logic for timeouts and temporary failures
      if (retryAttempt < maxRetries && (
        errorMessage.includes('timeout') ||
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('overloaded')
      )) {
        const delay = baseDelay * Math.pow(2, retryAttempt); // Exponential backoff
        console.log(`🧠 Retrying memory extraction in ${delay}ms (attempt ${retryAttempt + 1}/${maxRetries + 1})...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return extractMemoryData(userMessage, conversationContext, currentUserInfo, aiConfig, tokenSpeed, retryAttempt + 1);
      }
      
      return null;
    }
  };

  /**
   * Get existing user memory profile from settings store
   */
  const getUserMemoryProfile = async (userId: string): Promise<UserMemoryProfile | null> => {
    try {
      const key = `clara_user_memory_${userId}`;
      
      // 🔍 DEBUG: Log retrieval attempt
      console.log('🧠 DEBUG: Attempting to retrieve memory profile:');
      console.log('  - Storage key:', key);
      console.log('  - User ID:', userId);
      
      const result = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', key);
      
      if (result?.value) {
        console.log('🧠 DEBUG: ✅ FOUND existing memory profile:');
        console.log('  - Profile ID:', result.value.id);
        console.log('  - Profile version:', result.value.version);
        console.log('  - Created at:', result.value.createdAt);
        console.log('  - Last updated:', result.value.updatedAt);
        console.log('  - Confidence level:', result.value.metadata.confidenceLevel);
        console.log('  - Core identity data:', Object.keys(result.value.coreIdentity).length > 0 ? result.value.coreIdentity : 'empty');
        console.log('  - Personal characteristics:', Object.keys(result.value.personalCharacteristics).length > 0 ? result.value.personalCharacteristics : 'empty');
        console.log('  - Preferences data:', Object.keys(result.value.preferences).length > 0 ? result.value.preferences : 'empty');
        console.log('  - Full profile:', JSON.stringify(result.value, null, 2));
        return result.value;
      } else {
        console.log('🧠 DEBUG: ❌ NO existing memory profile found for user:', userId);
        
        // 🔍 DEBUG: List all memory keys to see what's actually stored
        try {
          const allSettings = await indexedDBService.getAll<{ key: string; value: any }>('settings');
          const memoryKeys = allSettings
            .filter(item => item.key.startsWith('clara_user_memory_'))
            .map(item => item.key);
          console.log('🧠 DEBUG: All memory keys in storage:', memoryKeys);
          if (memoryKeys.length === 0) {
            console.log('🧠 DEBUG: No memory profiles exist in storage yet');
          }
        } catch (listError) {
          console.error('🧠 DEBUG: Failed to list existing memory keys:', listError);
        }
        
        return null;
      }
    } catch (error) {
      console.error('🧠 ❌ FAILED to get user memory profile:', error);
      return null;
    }
  };

  /**
   * Merge new memory data with existing profile
   */
  const mergeMemoryData = (
    existing: UserMemoryProfile | null,
    extracted: Partial<UserMemoryProfile>,
    confidence: number
  ): UserMemoryProfile => {
    const now = new Date().toISOString();
    // 🔍 FIX: Always use 'current_user' as the consistent user ID for single-user app
    const userId = 'current_user';

    const baseProfile: UserMemoryProfile = existing || {
      id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      coreIdentity: {},
      personalCharacteristics: {},
      preferences: {},
      relationship: {},
      interactions: {},
      context: {},
      emotional: {},
      practical: {},
      metadata: {
        confidenceLevel: confidence,
        source: 'direct_conversation',
        extractedAt: now,
        lastUpdated: now,
        relevanceScore: 0.8
      },
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    // Deep merge function for arrays and objects with smart limits
    const deepMerge = (target: any, source: any, path: string = ''): any => {
      if (!source) return target;
      if (!target) return source;

      // 🔧 SMART ARRAY MERGING: Handle arrays with size limits and deduplication
      if (Array.isArray(source)) {
        const targetArray = Array.isArray(target) ? target : [];
        
        // Define limits for different array types
        const arrayLimits: { [key: string]: number } = {
          'hobbies': 10,
          'interests': 10,
          'favorites': 8,
          'skills': 15,
          'friends': 20,
          'family': 15,
          'goals': 12,
          'recentEvents': 20,
          'significantEvents': 15,
          'topics': 25,
          'projects': 10
        };
        
        // Get limit based on path context
        const contextKey = path.toLowerCase();
        const limit = Object.keys(arrayLimits).find(key => contextKey.includes(key));
        const maxItems = limit ? arrayLimits[limit] : 20; // Default limit
        
        console.log(`🧠 MERGE: Array at '${path}' - existing: ${targetArray.length}, new: ${source.length}, limit: ${maxItems}`);
        
        // Combine and deduplicate
        const combined = [...targetArray];
        const newItemsAdded = [];
        
        for (const newItem of source) {
          // Check if item already exists (case-insensitive for strings)
          const exists = combined.some(existingItem => {
            if (typeof existingItem === 'string' && typeof newItem === 'string') {
              return existingItem.toLowerCase() === newItem.toLowerCase();
            }
            return JSON.stringify(existingItem) === JSON.stringify(newItem);
          });
          
          if (!exists) {
            combined.push(newItem);
            newItemsAdded.push(newItem);
          }
        }
        
        // Apply limit - keep most recent items
        const result = combined.slice(-maxItems);
        console.log(`🧠 MERGE: Array result for '${path}' - final count: ${result.length}, new items added:`, newItemsAdded);
        return result;
      }

      if (typeof source === 'object' && source !== null) {
        const result = { ...target };
        for (const key in source) {
          if (source[key] !== null && source[key] !== undefined) {
            const currentPath = path ? `${path}.${key}` : key;
            result[key] = deepMerge(result[key], source[key], currentPath);
          }
        }
        return result;
      }

      // For primitive values, prefer newer data but preserve important existing data
      if (target && typeof target === 'string' && typeof source === 'string') {
        // If they're different, prefer the new one but log the change
        if (target !== source) {
          console.log(`🧠 MERGE: Updating '${path}' from '${target}' to '${source}'`);
        }
      }

      return source;
    };

    // Merge each section with detailed logging
    console.log('🧠 MERGE: Starting profile merge process...');
    console.log('🧠 MERGE: Existing profile sections:', Object.keys(baseProfile).filter(k => 
      ['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'].includes(k)
    ));
    console.log('🧠 MERGE: New data sections:', Object.keys(extracted || {}));
    
    const mergedProfile: UserMemoryProfile = {
      ...baseProfile,
      coreIdentity: deepMerge(baseProfile.coreIdentity, extracted.coreIdentity, 'coreIdentity'),
      personalCharacteristics: deepMerge(baseProfile.personalCharacteristics, extracted.personalCharacteristics, 'personalCharacteristics'),
      preferences: deepMerge(baseProfile.preferences, extracted.preferences, 'preferences'),
      relationship: deepMerge(baseProfile.relationship, extracted.relationship, 'relationship'),
      interactions: deepMerge(baseProfile.interactions, extracted.interactions, 'interactions'),
      context: deepMerge(baseProfile.context, extracted.context, 'context'),
      emotional: deepMerge(baseProfile.emotional, extracted.emotional, 'emotional'),
      practical: deepMerge(baseProfile.practical, extracted.practical, 'practical'),
      metadata: {
        ...baseProfile.metadata,
        confidenceLevel: Math.max(baseProfile.metadata.confidenceLevel, confidence),
        lastUpdated: now,
        relevanceScore: Math.min(1.0, baseProfile.metadata.relevanceScore + 0.1)
      },
      version: baseProfile.version + 1,
      updatedAt: now
    };

    console.log('🧠 MERGE: Merge completed. Profile version:', baseProfile.version, '→', mergedProfile.version);
    console.log('🧠 MERGE: Final profile sections with data:');
    Object.keys(mergedProfile).forEach(key => {
      if (['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'].includes(key)) {
        const sectionData = mergedProfile[key as keyof UserMemoryProfile];
        if (sectionData && typeof sectionData === 'object' && Object.keys(sectionData).length > 0) {
          console.log(`  ✓ ${key}:`, Object.keys(sectionData).length, 'fields');
        }
      }
    });

    return mergedProfile;
  };

  /**
   * Save memory profile to IndexedDB settings store
   */
  const saveMemoryProfile = async (profile: UserMemoryProfile): Promise<void> => {
    try {
      const key = `clara_user_memory_${profile.userId}`;
      
      // 🔍 DEBUG: Log what we're about to save
      console.log('🧠 DEBUG: Saving memory profile to IndexedDB:');
      console.log('  - Storage key:', key);
      console.log('  - Profile ID:', profile.id);
      console.log('  - Profile version:', profile.version);
      console.log('  - User ID:', profile.userId);
      console.log('  - Confidence level:', profile.metadata.confidenceLevel);
      console.log('  - Total data sections:', Object.keys(profile).filter(k => 
        ['coreIdentity', 'personalCharacteristics', 'preferences', 'interactions', 'context', 'practical'].includes(k) &&
        profile[k as keyof UserMemoryProfile] && 
        Object.keys(profile[k as keyof UserMemoryProfile] as object).length > 0
      ).length);
      console.log('  - Full profile data:', JSON.stringify(profile, null, 2));
      
      await indexedDBService.put('settings', { key, value: profile });
      
      console.log(`🧠 ✅ SUCCESSFULLY saved memory profile for user: ${profile.userId}`);
      
      // 🔍 DEBUG: Verify the save by immediately reading it back
      try {
        const verification = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', key);
        if (verification?.value) {
          console.log('🧠 DEBUG: ✅ VERIFICATION: Successfully retrieved saved profile');
          console.log('  - Retrieved profile ID:', verification.value.id);
          console.log('  - Retrieved version:', verification.value.version);
          console.log('  - Retrieved hobbies:', verification.value.personalCharacteristics?.hobbies);
          console.log('  - Data integrity check:', JSON.stringify(verification.value) === JSON.stringify(profile) ? 'PASSED' : 'FAILED');
        } else {
          console.error('🧠 DEBUG: ❌ VERIFICATION FAILED: Could not retrieve saved profile');
        }
      } catch (verifyError) {
        console.error('🧠 DEBUG: ❌ VERIFICATION ERROR:', verifyError);
      }
      
    } catch (error) {
      console.error('🧠 ❌ FAILED to save memory profile:', error);
      throw error;
    }
  };

  /**
   * Main memory processing function
   */
  const processMemory = async (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = [],
    aiConfig?: ClaraAIConfig
  ): Promise<void> => {
    const messageId = assistantMessage.id;

    try {
      console.log('🧠 Starting memory extraction for message:', messageId);

      // Get token speed from message metadata
      const tokenSpeed = assistantMessage.metadata?.timings?.predicted_per_second || 0;

      // 🔍 DEBUG: Log processing decision details BEFORE marking as processing
      const wordCount = countWords(userMessage);
      console.log('🧠 DEBUG: Processing decision check:');
      console.log('  - Word count:', wordCount, `(min: ${MIN_WORD_COUNT}, max: ${MAX_WORD_COUNT})`);
      console.log('  - Feature enabled:', isEnabled);
      console.log('  - Already processing:', processingRef.current.has(messageId));
      console.log('  - Time since last:', Date.now() - lastProcessedRef.current, `ms (min: ${RATE_LIMIT_INTERVAL})`);

      // Check if we should process this interaction BEFORE marking as processing
      if (!shouldProcessMemory(userMessage, assistantMessage)) {
        console.log('🧠 DEBUG: Skipping memory extraction - failed shouldProcessMemory check');
        return;
      }

      console.log('🧠 DEBUG: Passed shouldProcessMemory check - proceeding with extraction');

      // NOW mark as processing after validation passes
      processingRef.current.add(messageId);
      lastProcessedRef.current = Date.now();

      // Get current user profile FIRST to check size
      const currentUserId = 'current_user';
      let existingProfile = await getUserMemoryProfile(currentUserId);

      // 🗜️ CHECK MEMORY SIZE BEFORE EXTRACTION - Skip extraction if compression needed
      if (existingProfile) {
        const profileJson = JSON.stringify(existingProfile);
        const sizeBytes = new Blob([profileJson]).size;
        const sizeKB = (sizeBytes / 1024).toFixed(2);

        console.log(`🗜️ Memory size check: ${sizeKB} KB (${sizeBytes} bytes)`);

        // If over 5KB, skip extraction and let user compress first
        if (sizeBytes >= 5 * 1024) {
          console.warn('🗜️ ⚠️ Memory is too large (>5KB) - SKIPPING extraction until compression happens');
          console.warn('🗜️ The compression dialog should appear shortly to handle this.');
          processingRef.current.delete(messageId);
          return;
        }
      }

      // Prepare conversation context (last 3 messages for context)
      const contextMessages = conversationHistory
        .slice(-3)
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content);
      
      // 🔍 MIGRATION: Check if there's old data under 'anonymous' and migrate it
      if (!existingProfile) {
        console.log('🧠 DEBUG: No profile found for current_user, checking for legacy anonymous profile...');
        const legacyProfile = await getUserMemoryProfile('anonymous');
        if (legacyProfile) {
          console.log('🧠 DEBUG: Found legacy anonymous profile, migrating to current_user...');
          // Update the user ID and save under new key
          legacyProfile.userId = currentUserId;
          legacyProfile.version += 1;
          legacyProfile.updatedAt = new Date().toISOString();
          legacyProfile.metadata.lastUpdated = new Date().toISOString();
          
          // Save under new key
          await saveMemoryProfile(legacyProfile);
          
          // Delete old anonymous key
          try {
            await indexedDBService.delete('settings', 'clara_user_memory_anonymous');
            console.log('🧠 DEBUG: ✅ Successfully migrated anonymous profile to current_user and deleted old data');
          } catch (deleteError) {
            console.warn('🧠 DEBUG: Could not delete old anonymous profile:', deleteError);
          }
          
          existingProfile = legacyProfile;
        }
      }

      // Extract memory data with token speed for dynamic timeout
      const extractionResult = await extractMemoryData(
        userMessage,
        contextMessages,
        existingProfile || undefined,
        aiConfig,
        tokenSpeed
      );

      // 🔍 DEBUG: Log extraction input and result
      console.log('🧠 DEBUG: Memory extraction input:');
      console.log('  - User message word count:', wordCount);
      console.log('  - User message preview:', userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : ''));
      console.log('  - Context messages count:', contextMessages.length);
      console.log('  - Has existing profile:', !!existingProfile);
      console.log('  - AI provider:', aiConfig?.provider);
      console.log('  - AI model:', aiConfig?.models?.text);

      if (!extractionResult || !extractionResult.hasMemoryData) {
        console.log('🧠 No memory data extracted from conversation', extractionResult);
        return;
      }

      // 🔍 DEBUG: Log extraction success details
      console.log('🧠 DEBUG: Memory extraction successful!');
      console.log('  - Confidence:', extractionResult.confidence);
      console.log('  - Has extracted memory:', !!extractionResult.extractedMemory);
      console.log('  - Reasoning:', extractionResult.reasoning);
      console.log('  - Extracted memory sections:', Object.keys(extractionResult.extractedMemory || {}));
      console.log('  - Full extracted memory:', JSON.stringify(extractionResult.extractedMemory, null, 2));

      // Check confidence threshold
      if (extractionResult.confidence < MIN_CONFIDENCE_THRESHOLD) {
        console.log(`🧠 Extraction confidence ${extractionResult.confidence} below threshold ${MIN_CONFIDENCE_THRESHOLD}`);
        return;
      }

      // Merge with existing profile
      const mergedProfile = mergeMemoryData(
        existingProfile,
        extractionResult.extractedMemory!,
        extractionResult.confidence
      );

      // 🔍 DEBUG: Log profile merging details
      console.log('🧠 DEBUG: Profile merging details:');
      console.log('  - Existing profile version:', existingProfile?.version || 'none');
      console.log('  - New profile version:', mergedProfile.version);
      console.log('  - Merged sections with data:');
      
      const sectionsWithData = [];
      if (Object.keys(mergedProfile.coreIdentity).length > 0) {
        sectionsWithData.push('coreIdentity');
        console.log('    ✓ Core Identity:', mergedProfile.coreIdentity);
      }
      if (Object.keys(mergedProfile.personalCharacteristics).length > 0) {
        sectionsWithData.push('personalCharacteristics');
        console.log('    ✓ Personal Characteristics:', mergedProfile.personalCharacteristics);
      }
      if (Object.keys(mergedProfile.preferences).length > 0) {
        sectionsWithData.push('preferences');
        console.log('    ✓ Preferences:', mergedProfile.preferences);
      }
      if (Object.keys(mergedProfile.interactions).length > 0) {
        sectionsWithData.push('interactions');
        console.log('    ✓ Interactions:', mergedProfile.interactions);
      }
      if (Object.keys(mergedProfile.context).length > 0) {
        sectionsWithData.push('context');
        console.log('    ✓ Context:', mergedProfile.context);
      }
      if (Object.keys(mergedProfile.practical).length > 0) {
        sectionsWithData.push('practical');
        console.log('    ✓ Practical Info:', mergedProfile.practical);
      }
      
      console.log(`🧠 DEBUG: Total sections with data: ${sectionsWithData.length}`, sectionsWithData);

      // Skip saving if there is no meaningful data to persist
      if (sectionsWithData.length === 0) {
        console.log('🧠 DEBUG: No non-empty memory sections detected. Skipping save to avoid empty profile updates.');
        return;
      }

      // Add session context  
      mergedProfile.metadata.messageId = messageId;

      // Save to IndexedDB
      await saveMemoryProfile(mergedProfile);

      // Notify about successful extraction
      onMemoryExtracted?.(mergedProfile);

      // ✨ NEW: Try to show memory learning toast
      try {
        const toastShown = claraMemoryToastService.showMemoryToast(mergedProfile);
        if (toastShown) {
          console.log('🧠 ✨ Memory toast shown for new learning');
        }
      } catch (toastError) {
        console.warn('🧠 Failed to show memory toast:', toastError);
        // Don't let toast errors affect memory extraction
      }

      console.log('🧠 Memory extraction completed successfully', {
        confidence: extractionResult.confidence,
        reasoning: extractionResult.reasoning,
        profileVersion: mergedProfile.version,
        totalDataSections: sectionsWithData.length,
        extractedSections: sectionsWithData,
        userId: mergedProfile.userId,
        profileId: mergedProfile.id
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('🧠 Memory processing failed:', errorMessage);
      onError?.(errorMessage);
    } finally {
      // Remove from processing set
      processingRef.current.delete(messageId);
    }
  };

  // ==================== PUBLIC API ====================

  /**
   * Manually trigger memory extraction (for external use)
   */
  const extractMemoryFromConversation = async (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = []
  ): Promise<UserMemoryProfile | null> => {
    try {
      await processMemory(userMessage, assistantMessage, conversationHistory);
      const userId = 'current_user';
      return await getUserMemoryProfile(userId);
    } catch (error) {
      console.error('🧠 Manual memory extraction failed:', error);
      return null;
    }
  };

  /**
   * Get current user memory profile
   */
  const getCurrentUserProfile = async (): Promise<UserMemoryProfile | null> => {
    const userId = 'current_user';
    console.log('🧠 DEBUG: getCurrentUserProfile called for userId:', userId);
    const profile = await getUserMemoryProfile(userId);
    
    if (profile) {
      console.log('🧠 DEBUG: getCurrentUserProfile - FOUND profile:');
      console.log('  - Profile summary:', {
        id: profile.id,
        version: profile.version,
        userId: profile.userId,
        confidence: profile.metadata.confidenceLevel,
        sectionsWithData: Object.keys(profile).filter(k => 
          ['coreIdentity', 'personalCharacteristics', 'preferences', 'interactions', 'context', 'practical'].includes(k) &&
          profile[k as keyof UserMemoryProfile] && 
          Object.keys(profile[k as keyof UserMemoryProfile] as object).length > 0
        )
      });
    } else {
      console.log('🧠 DEBUG: getCurrentUserProfile - NO profile found');
    }
    
    return profile;
  };

  /**
   * Clear user memory
   */
  const clearUserMemory = async (userId: string = 'current_user'): Promise<void> => {
    try {
      const key = `clara_user_memory_${userId}`;
      await indexedDBService.delete('settings', key);
      console.log(`🧠 Cleared memory for user: ${userId}`);
    } catch (error) {
      console.error('🧠 Failed to clear user memory:', error);
    }
  };

  /**
   * Get memory statistics
   */
  const getMemoryStats = async (): Promise<{
    totalProfiles: number;
    totalMemoryEntries: number;
    averageConfidence: number;
    lastUpdated?: string;
  }> => {
    try {
      console.log('🧠 DEBUG: getMemoryStats called - analyzing all memory data...');
      
      const allSettings = await indexedDBService.getAll<{ key: string; value: any }>('settings');
      console.log('🧠 DEBUG: Total settings entries:', allSettings.length);
      
      const memorySettings = allSettings.filter(item => item.key.startsWith('clara_user_memory_'));
      console.log('🧠 DEBUG: Memory-related settings:', memorySettings.length);
      console.log('🧠 DEBUG: Memory keys found:', memorySettings.map(item => item.key));
      
      const profiles = memorySettings.map(item => item.value as UserMemoryProfile);
      
      // 🔍 DEBUG: Log each profile found
      profiles.forEach((profile, index) => {
        console.log(`🧠 DEBUG: Profile ${index + 1}:`, {
          id: profile.id,
          userId: profile.userId,
          version: profile.version,
          confidence: profile.metadata.confidenceLevel,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          coreIdentityKeys: Object.keys(profile.coreIdentity || {}),
          personalCharacteristicsKeys: Object.keys(profile.personalCharacteristics || {}),
          preferencesKeys: Object.keys(profile.preferences || {}),
          interactionsKeys: Object.keys(profile.interactions || {}),
          contextKeys: Object.keys(profile.context || {}),
          practicalKeys: Object.keys(profile.practical || {}),
          hobbies: profile.personalCharacteristics?.hobbies,
          fullProfile: profile
        });
      });
      
      const totalProfiles = profiles.length;
      const totalMemoryEntries = profiles.reduce((sum, profile) => {
        // Count non-empty memory sections
        const sections = [
          profile.coreIdentity,
          profile.personalCharacteristics,
          profile.preferences,
          profile.relationship,
          profile.interactions,
          profile.context,
          profile.emotional,
          profile.practical
        ];
        return sum + sections.filter(section => 
          section && Object.keys(section).length > 0
        ).length;
      }, 0);

      const averageConfidence = profiles.length > 0
        ? profiles.reduce((sum, p) => sum + (p.metadata.confidenceLevel || 0), 0) / profiles.length
        : 0;

      const lastUpdated = profiles.length > 0
        ? profiles.reduce((latest, p) => 
            new Date(p.metadata.lastUpdated) > new Date(latest) ? p.metadata.lastUpdated : latest
          , profiles[0].metadata.lastUpdated)
        : undefined;

      const stats = {
        totalProfiles,
        totalMemoryEntries,
        averageConfidence,
        lastUpdated
      };
      
      console.log('🧠 DEBUG: Memory statistics summary:', stats);
      
      return stats;
    } catch (error) {
      console.error('🧠 ❌ FAILED to get memory stats:', error);
      return {
        totalProfiles: 0,
        totalMemoryEntries: 0,
        averageConfidence: 0
      };
    }
  };

  // ==================== INITIALIZATION ====================

  useEffect(() => {
    if (isEnabled) {
      initializeMemoryStore().catch(error => {
        console.error('🧠 Failed to initialize memory store:', error);
      });
    }
  }, [isEnabled]);

  // ==================== COMPONENT INTERFACE ====================

  // Expose functions for external use
  /**
   * Update a specific memory field
   */
  const updateMemoryField = async (cardId: string, newValue: string): Promise<void> => {
    try {
      const profile = await getCurrentUserProfile();
      
      if (!profile) {
        console.error('🧠 No profile found to update');
        return;
      }

      // Parse card ID to determine section and field
      const [section, field] = cardId.split('-');
      
      console.log(`🧠 Updating memory field: ${cardId} (${section}.${field}) = "${newValue}"`);
      
      // Update the specific field based on section
      const updatedProfile = { ...profile };
      
      if (section === 'core' && updatedProfile.coreIdentity) {
        (updatedProfile.coreIdentity as any)[field] = newValue;
      } else if (section === 'personalCharacteristics' && updatedProfile.personalCharacteristics) {
        (updatedProfile.personalCharacteristics as any)[field] = newValue;
      } else if (section === 'preferences' && updatedProfile.preferences) {
        (updatedProfile.preferences as any)[field] = newValue;
      } else if (section === 'context' && updatedProfile.context) {
        (updatedProfile.context as any)[field] = newValue;
      } else if (section === 'emotional' && updatedProfile.emotional) {
        (updatedProfile.emotional as any)[field] = newValue;
      } else if (section === 'interactions' && updatedProfile.interactions) {
        (updatedProfile.interactions as any)[field] = newValue;
      } else if (section === 'practical' && updatedProfile.practical) {
        (updatedProfile.practical as any)[field] = newValue;
      }
      
      // Update metadata
      updatedProfile.updatedAt = new Date().toISOString();
      updatedProfile.version = (updatedProfile.version || 0) + 1;
      
      // Save updated profile
      await saveMemoryProfile(updatedProfile);
      
      console.log(`🧠 Successfully updated memory field: ${cardId}`);
    } catch (error) {
      console.error('🧠 Failed to update memory field:', error);
      throw error;
    }
  };

  /**
   * Delete a specific memory field
   */
  const deleteMemoryField = async (cardId: string): Promise<void> => {
    try {
      const profile = await getCurrentUserProfile();
      
      if (!profile) {
        console.error('🧠 No profile found to delete from');
        return;
      }

      // Parse card ID to determine section and field
      const [section, field] = cardId.split('-');
      
      console.log(`🧠 Deleting memory field: ${cardId} (${section}.${field})`);
      
      // Delete the specific field based on section
      const updatedProfile = { ...profile };
      
      if (section === 'core' && updatedProfile.coreIdentity) {
        delete (updatedProfile.coreIdentity as any)[field];
      } else if (section === 'personalCharacteristics' && updatedProfile.personalCharacteristics) {
        delete (updatedProfile.personalCharacteristics as any)[field];
      } else if (section === 'preferences' && updatedProfile.preferences) {
        delete (updatedProfile.preferences as any)[field];
      } else if (section === 'context' && updatedProfile.context) {
        delete (updatedProfile.context as any)[field];
      } else if (section === 'emotional' && updatedProfile.emotional) {
        delete (updatedProfile.emotional as any)[field];
      } else if (section === 'interactions' && updatedProfile.interactions) {
        delete (updatedProfile.interactions as any)[field];
      } else if (section === 'practical' && updatedProfile.practical) {
        delete (updatedProfile.practical as any)[field];
      }
      
      // Update metadata
      updatedProfile.updatedAt = new Date().toISOString();
      updatedProfile.version = (updatedProfile.version || 0) + 1;
      
      // Save updated profile
      await saveMemoryProfile(updatedProfile);
      
      console.log(`🧠 Successfully deleted memory field: ${cardId}`);
    } catch (error) {
      console.error('🧠 Failed to delete memory field:', error);
      throw error;
    }
  };

  /**
   * Generate a summary using the same AI configuration as memory extraction
   * This ensures we use whatever provider/model is currently configured
   */
  const generateSummary = async (prompt: string, systemPrompt: string): Promise<string> => {
    console.log('🧠 Generating summary using memory extraction method...');
    
    try {
      // Import services - same as memory extraction
      const { claraApiService } = await import('../services/claraApiService');
      const { claraProviderService } = await import('../services/claraProviderService');
      
      // Get current provider and session config - exactly like memory extraction does
      const currentProvider = claraProviderService.getCurrentProvider();
      
      if (!currentProvider) {
        throw new Error('No provider currently configured. Please configure a provider first.');
      }
      
      console.log('🧠 DEBUG: Using current provider for summary generation:');
      console.log('  - Provider:', currentProvider.name);
      console.log('  - Provider ID:', currentProvider.id);
      
      // Get the ACTUAL current model from the provider config storage
      let currentTextModel = 'gpt-4o-mini'; // Fallback
      
      try {
        // Get the provider configs - this is where the real current model is stored
        const providerConfigs = localStorage.getItem('clara_provider_configs');
        if (providerConfigs) {
          const allConfigs = JSON.parse(providerConfigs);
          const currentProviderConfig = allConfigs[currentProvider.id];
          
          if (currentProviderConfig?.models?.text) {
            currentTextModel = currentProviderConfig.models.text;
            console.log('🧠 DEBUG: Found ACTUAL current text model for provider:', currentTextModel);
          } else {
            console.log('🧠 DEBUG: No text model found in provider config, using fallback');
          }
        } else {
          console.log('🧠 DEBUG: No provider configs found, using fallback');
        }
      } catch (error) {
        console.log('🧠 DEBUG: Error reading provider config:', error);
        
        // Use appropriate models for different providers as fallback
        if (currentProvider.type === 'openai') {
          currentTextModel = 'gpt-4o-mini';
        } else if (currentProvider.type === 'openrouter') {
          currentTextModel = 'meta-llama/llama-3.1-8b-instruct:free';
        } else if (currentProvider.type === 'ollama') {
          currentTextModel = 'Qwen3-0.6B-Q8_0.gguf';
        }
      }
      
      console.log('🧠 DEBUG: Using text model:', currentTextModel);
      
      // Use the EXACT same fallback approach as extractMemoryData
      // This mimics the `aiConfig || { fallback }` pattern from memory extraction
      const summaryConfig = {
        provider: currentProvider.id, // Use current provider ID
        models: {
          text: currentTextModel, // Use actual current model
          vision: currentTextModel
        },
        parameters: {
          temperature: 0.7, // Slightly higher for creative summaries
          maxTokens: 4000,
          topP: 1.0,
          topK: 40,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0,
          repetitionPenalty: 1.0,
          minP: 0.0,
          typicalP: 1.0,
          seed: null,
          stop: []
        },
        features: {
          enableTools: false,
          enableRAG: false,
          enableStreaming: false,
          enableVision: false,
          autoModelSelection: false,
          enableMCP: false,
          enableStructuredToolCalling: false,
          enableNativeJSONSchema: false,
          enableMemory: false
        },
        autonomousAgent: {
          enabled: false,
          maxRetries: 1,
          retryDelay: 1000,
          enableSelfCorrection: false,
          enableToolGuidance: false,
          enableProgressTracking: false,
          maxToolCalls: 1,
          confidenceThreshold: 0.7,
          enableChainOfThought: false,
          enableErrorLearning: false
        }
      };

      console.log('🧠 DEBUG: Summary AI config:');
      console.log('  - Provider:', summaryConfig.provider);
      console.log('  - Model:', summaryConfig.models.text);

      const response = await claraApiService.sendChatMessage(
        prompt,
        summaryConfig,
        [],
        systemPrompt,
        []
      );

      // Extract content from the response
      const summaryText = typeof response === 'object' && response.content 
        ? response.content 
        : typeof response === 'string' 
          ? response 
          : JSON.stringify(response);

      console.log('🧠 Summary generated successfully');
      return summaryText;
      
    } catch (error) {
      console.error('🧠 ERROR: Failed to generate summary:', error);
      throw error;
    }
  };

  (ClaraSweetMemory as any).extractMemoryFromConversation = extractMemoryFromConversation;
  (ClaraSweetMemory as any).getCurrentUserProfile = getCurrentUserProfile;
  (ClaraSweetMemory as any).clearUserMemory = clearUserMemory;
  (ClaraSweetMemory as any).getMemoryStats = getMemoryStats;
  (ClaraSweetMemory as any).processMemory = processMemory;
  (ClaraSweetMemory as any).updateMemoryField = updateMemoryField;
  (ClaraSweetMemory as any).deleteMemoryField = deleteMemoryField;
  (ClaraSweetMemory as any).generateSummary = generateSummary;

  // This component doesn't render anything - it's a pure service component
  return null;
};

// ==================== EXPORTS ====================

export default ClaraSweetMemory;

// Export utility functions for external use
export const ClaraSweetMemoryAPI = {
  extractMemoryFromConversation: (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = []
  ) => (ClaraSweetMemory as any).extractMemoryFromConversation?.(userMessage, assistantMessage, conversationHistory),
  
  getCurrentUserProfile: () => (ClaraSweetMemory as any).getCurrentUserProfile?.(),
  
  clearUserMemory: (userId?: string) => (ClaraSweetMemory as any).clearUserMemory?.(userId),
  
  getMemoryStats: () => (ClaraSweetMemory as any).getMemoryStats?.(),
  
  processMemory: (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = [],
    aiConfig?: ClaraAIConfig
  ) => (ClaraSweetMemory as any).processMemory?.(userMessage, assistantMessage, conversationHistory, aiConfig),

  // Update specific memory field
  updateMemoryField: (cardId: string, newValue: string) => (ClaraSweetMemory as any).updateMemoryField?.(cardId, newValue),

  // Delete specific memory field
  deleteMemoryField: (cardId: string) => (ClaraSweetMemory as any).deleteMemoryField?.(cardId),

  // Generate summary using same method as memory extraction
  generateSummary: (prompt: string, systemPrompt: string) => (ClaraSweetMemory as any).generateSummary?.(prompt, systemPrompt)
};
