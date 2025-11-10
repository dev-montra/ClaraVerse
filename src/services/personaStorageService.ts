/**
 * Persona Storage Service
 *
 * Manages storage and retrieval of Clara personas from localStorage.
 * Handles CRUD operations for custom system prompts/personas.
 */

import { ClaraPersona, PersonaStorage } from '../types/clara_assistant_types';

const STORAGE_KEY = 'clara_personas_v1';

/**
 * Default Clara persona
 */
const DEFAULT_PERSONA: ClaraPersona = {
  id: 'default',
  name: 'Clara',
  emoji: undefined,
  systemPrompt: 'You are Clara, a helpful AI assistant.',
  enableMemory: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * Get default Clara system prompt
 */
export function getDefaultSystemPrompt(): string {
  return DEFAULT_PERSONA.systemPrompt;
}

/**
 * Load personas from localStorage
 */
export function loadPersonas(): PersonaStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PersonaStorage;
      // Ensure default persona exists
      if (!parsed.personas.find(p => p.id === 'default')) {
        parsed.personas.unshift(DEFAULT_PERSONA);
      }
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load personas from localStorage:', error);
  }

  // Return default storage structure
  return {
    personas: [DEFAULT_PERSONA],
    activePersonaId: 'default',
  };
}

/**
 * Save personas to localStorage
 */
export function savePersonas(storage: PersonaStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error('Failed to save personas to localStorage:', error);
    throw error;
  }
}

/**
 * Get the currently active persona
 */
export function getActivePersona(): ClaraPersona | null {
  const storage = loadPersonas();
  const persona = storage.personas.find(p => p.id === storage.activePersonaId);
  return persona || null;
}

/**
 * Set the active persona by ID
 */
export function setActivePersona(personaId: string): void {
  const storage = loadPersonas();
  const persona = storage.personas.find(p => p.id === personaId);

  if (!persona) {
    throw new Error(`Persona with ID "${personaId}" not found`);
  }

  storage.activePersonaId = personaId;
  savePersonas(storage);
}

/**
 * Get all personas
 */
export function getAllPersonas(): ClaraPersona[] {
  const storage = loadPersonas();
  return storage.personas;
}

/**
 * Get a specific persona by ID
 */
export function getPersonaById(personaId: string): ClaraPersona | null {
  const storage = loadPersonas();
  return storage.personas.find(p => p.id === personaId) || null;
}

/**
 * Create a new persona
 */
export function createPersona(data: {
  name: string;
  emoji?: string;
  systemPrompt: string;
  enableMemory: boolean;
}): ClaraPersona {
  const storage = loadPersonas();

  // Check for duplicate names (case-insensitive)
  const nameExists = storage.personas.some(
    p => p.name.toLowerCase() === data.name.toLowerCase()
  );

  if (nameExists) {
    throw new Error(`A persona with the name "${data.name}" already exists`);
  }

  // Generate unique ID
  const id = `persona-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const newPersona: ClaraPersona = {
    id,
    name: data.name.trim(),
    emoji: data.emoji,
    systemPrompt: data.systemPrompt.trim(),
    enableMemory: data.enableMemory,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  storage.personas.push(newPersona);
  savePersonas(storage);

  return newPersona;
}

/**
 * Update an existing persona
 */
export function updatePersona(
  personaId: string,
  updates: {
    name?: string;
    emoji?: string;
    systemPrompt?: string;
    enableMemory?: boolean;
  }
): ClaraPersona {
  const storage = loadPersonas();
  const personaIndex = storage.personas.findIndex(p => p.id === personaId);

  if (personaIndex === -1) {
    throw new Error(`Persona with ID "${personaId}" not found`);
  }

  // Check for duplicate names if name is being updated
  if (updates.name) {
    const nameExists = storage.personas.some(
      (p, idx) =>
        idx !== personaIndex &&
        p.name.toLowerCase() === updates.name!.toLowerCase()
    );

    if (nameExists) {
      throw new Error(`A persona with the name "${updates.name}" already exists`);
    }
  }

  // Update persona
  const persona = storage.personas[personaIndex];
  const updatedPersona: ClaraPersona = {
    ...persona,
    ...(updates.name !== undefined && { name: updates.name.trim() }),
    ...(updates.emoji !== undefined && { emoji: updates.emoji }),
    ...(updates.systemPrompt !== undefined && { systemPrompt: updates.systemPrompt.trim() }),
    ...(updates.enableMemory !== undefined && { enableMemory: updates.enableMemory }),
    updatedAt: Date.now(),
  };

  storage.personas[personaIndex] = updatedPersona;
  savePersonas(storage);

  return updatedPersona;
}

/**
 * Delete a persona by ID
 * Cannot delete the default persona
 */
export function deletePersona(personaId: string): void {
  if (personaId === 'default') {
    throw new Error('Cannot delete the default Clara persona');
  }

  const storage = loadPersonas();
  const personaIndex = storage.personas.findIndex(p => p.id === personaId);

  if (personaIndex === -1) {
    throw new Error(`Persona with ID "${personaId}" not found`);
  }

  // Remove persona
  storage.personas.splice(personaIndex, 1);

  // If the deleted persona was active, switch to default
  if (storage.activePersonaId === personaId) {
    storage.activePersonaId = 'default';
  }

  savePersonas(storage);
}

/**
 * Check if a persona name already exists (case-insensitive)
 */
export function isPersonaNameTaken(name: string, excludeId?: string): boolean {
  const storage = loadPersonas();
  return storage.personas.some(
    p => p.id !== excludeId && p.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get the default Clara persona
 */
export function getDefaultPersona(): ClaraPersona {
  return { ...DEFAULT_PERSONA };
}

// Export as a service object for easier imports
export const personaStorageService = {
  getDefaultSystemPrompt,
  loadPersonas,
  savePersonas,
  getActivePersona,
  setActivePersona,
  getAllPersonas,
  getPersonaById,
  createPersona,
  updatePersona,
  deletePersona,
  isPersonaNameTaken,
  getDefaultPersona,
};
