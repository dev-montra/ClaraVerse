/**
 * PersonaDropdown Component
 *
 * Dropdown menu for selecting, editing, and managing Clara personas
 */

import React, { useEffect, useRef } from 'react';
import { Check, Edit2, Trash2, Plus, User } from 'lucide-react';
import { ClaraPersona } from '../../types/clara_assistant_types';

interface PersonaDropdownProps {
  show: boolean;
  onClose: () => void;
  personas: ClaraPersona[];
  activePersonaId: string;
  onPersonaSelect: (personaId: string) => void;
  onPersonaEdit: (persona: ClaraPersona) => void;
  onPersonaDelete: (personaId: string) => void;
  onCreateNew: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

const PersonaDropdown: React.FC<PersonaDropdownProps> = ({
  show,
  onClose,
  personas,
  activePersonaId,
  onPersonaSelect,
  onPersonaEdit,
  onPersonaDelete,
  onCreateNew,
  triggerRef,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);
      const isOutsideTrigger = triggerRef?.current && !triggerRef.current.contains(target);

      if (isOutsideDropdown && isOutsideTrigger) {
        onClose();
      }
    };

    // Add a small delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [show, onClose, triggerRef]);

  // Handle ESC key to close
  useEffect(() => {
    if (!show) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  const handleDelete = (e: React.MouseEvent, persona: ClaraPersona) => {
    e.stopPropagation();

    if (persona.id === 'default') {
      return; // Cannot delete default persona
    }

    if (confirm(`Are you sure you want to delete the persona "${persona.name}"?`)) {
      onPersonaDelete(persona.id);
    }
  };

  const handleEdit = (e: React.MouseEvent, persona: ClaraPersona) => {
    e.stopPropagation();
    onPersonaEdit(persona);
  };

  if (!show) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full right-0 mb-2 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-50 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Select Persona
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Choose how Clara responds
        </p>
      </div>

      {/* Persona List */}
      <div className="max-h-80 overflow-y-auto">
        {personas.map((persona) => {
          const isActive = persona.id === activePersonaId;
          const canDelete = persona.id !== 'default';

          return (
            <div
              key={persona.id}
              onClick={() => {
                onPersonaSelect(persona.id);
                onClose();
              }}
              className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-sakura-50 dark:bg-sakura-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {/* Emoji or Default Icon */}
              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                {persona.emoji ? (
                  <span className="text-xl">{persona.emoji}</span>
                ) : (
                  <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                )}
              </div>

              {/* Persona Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {persona.name}
                  </span>
                  {isActive && (
                    <Check className="w-4 h-4 text-sakura-500 flex-shrink-0" />
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {persona.systemPrompt.substring(0, 50)}...
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleEdit(e, persona)}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  title="Edit persona"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {canDelete && (
                  <button
                    onClick={(e) => handleDelete(e, persona)}
                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Delete persona"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create New Button */}
      <div className="border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            onCreateNew();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-sakura-600 dark:text-sakura-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Persona</span>
        </button>
      </div>
    </div>
  );
};

export default PersonaDropdown;
