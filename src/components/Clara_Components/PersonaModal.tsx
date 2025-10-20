/**
 * PersonaModal Component
 *
 * Modal for creating and editing Clara personas
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { ClaraPersona } from '../../types/clara_assistant_types';
import { personaStorageService } from '../../services/personaStorageService';

interface PersonaModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  persona?: ClaraPersona;
  onSave: (persona: ClaraPersona) => void;
  onClose: () => void;
}

const PersonaModal: React.FC<PersonaModalProps> = ({
  isOpen,
  mode,
  persona,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | undefined>(undefined);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [enableMemory, setEnableMemory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Initialize form when modal opens or persona changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && persona) {
        setName(persona.name);
        setEmoji(persona.emoji);
        setSystemPrompt(persona.systemPrompt);
        setEnableMemory(persona.enableMemory);
      } else if (mode === 'create') {
        // Prefill with default Clara prompt
        setName('');
        setEmoji(undefined);
        setSystemPrompt(personaStorageService.getDefaultSystemPrompt());
        setEnableMemory(true);
      }
      setError(null);
    }
  }, [isOpen, mode, persona]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Handle click outside emoji picker to close it
  useEffect(() => {
    if (!showEmojiPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleClose = () => {
    setError(null);
    setShowEmojiPicker(false);
    onClose();
  };

  const handleSave = () => {
    // Validate
    if (!name.trim()) {
      setError('Persona name is required');
      return;
    }

    if (!systemPrompt.trim()) {
      setError('System prompt is required');
      return;
    }

    try {
      let savedPersona: ClaraPersona;

      if (mode === 'create') {
        // Create new persona
        savedPersona = personaStorageService.createPersona({
          name: name.trim(),
          emoji: emoji,
          systemPrompt: systemPrompt.trim(),
          enableMemory,
        });
      } else if (mode === 'edit' && persona) {
        // Update existing persona
        savedPersona = personaStorageService.updatePersona(persona.id, {
          name: name.trim(),
          emoji: emoji,
          systemPrompt: systemPrompt.trim(),
          enableMemory,
        });
      } else {
        throw new Error('Invalid mode or missing persona');
      }

      onSave(savedPersona);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save persona');
    }
  };

  // Handle emoji selection from picker
  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    setEmoji(emojiData.emoji);
    setShowEmojiPicker(false);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {mode === 'create' ? 'Create New Persona' : 'Edit Persona'}
            </h2>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Name Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Persona Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Code Assistant, Creative Writer"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
                autoFocus
              />
            </div>

            {/* Emoji Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Emoji Icon (Optional)
              </label>
              <div className="flex items-center gap-3 relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex items-center justify-center w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-sakura-500 dark:hover:border-sakura-500 transition-colors"
                >
                  {emoji ? (
                    <span className="text-2xl">{emoji}</span>
                  ) : (
                    <Smile className="w-6 h-6 text-gray-400" />
                  )}
                </button>

                {emoji ? (
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Selected: {emoji}</span>
                    <button
                      type="button"
                      onClick={() => setEmoji(undefined)}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Click the button to choose an emoji
                  </span>
                )}

                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div
                    ref={emojiPickerRef}
                    className="absolute top-14 left-0 z-50"
                  >
                    <EmojiPicker
                      onEmojiClick={handleEmojiSelect}
                      width={350}
                      height={400}
                    />
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Choose an emoji to represent this persona
              </p>
            </div>

            {/* System Prompt Textarea */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                System Prompt <span className="text-red-500">*</span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter the system prompt for this persona..."
                rows={10}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 font-mono text-sm resize-y"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This is the base instruction that defines how Clara behaves with this persona
              </p>
            </div>

            {/* Enable Memory Toggle */}
            <div className="mb-4">
              <label className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    Enable Memory Enhancement
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Allow Clara to enhance this persona with your memory data and conversation history
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={enableMemory}
                    onChange={(e) => setEnableMemory(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-500"></div>
                </div>
              </label>
            </div>

            {/* Preview Section (optional - can be added later) */}
            {/* <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Preview
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Preview section coming soon
              </p>
            </div> */}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 transition-colors font-medium"
            >
              {mode === 'create' ? 'Create Persona' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PersonaModal;
