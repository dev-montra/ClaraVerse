import React, { useState } from 'react';
import { X, Search, Download, Star, Sparkles, Globe, FileText, Image as ImageIcon, Brain, Wrench } from 'lucide-react';
import { FlowTemplate } from '../../types/agent/types';

interface TemplateBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: FlowTemplate) => void;
}

// Mock templates for now - will be replaced with actual template system
const mockTemplates: FlowTemplate[] = [
  {
    id: 'simple-chat',
    name: 'Simple Chat Assistant',
    description: 'A basic conversational AI that can answer questions using LLM',
    category: 'ai',
    difficulty: 'beginner' as const,
    tags: ['chat', 'llm', 'conversational'],
    author: 'ClaraVerse',
    downloads: 1250,
    rating: 4.8,
    flow: {
      name: 'Simple Chat Assistant',
      icon: '🤖',
      nodes: [],
      connections: [],
      variables: [],
      settings: { name: 'Simple Chat Assistant', version: '1.0.0' },
      version: '1.0.0'
    }
  },
  {
    id: 'research-agent',
    name: 'Autonomous Research Agent',
    description: 'An autonomous AI agent that can research topics with multi-step reasoning',
    category: 'ai',
    difficulty: 'intermediate' as const,
    tags: ['autonomous', 'research', 'mcp-tools'],
    author: 'ClaraVerse',
    downloads: 850,
    rating: 4.9,
    flow: {
      name: 'Autonomous Research Agent',
      icon: '🔬',
      nodes: [],
      connections: [],
      variables: [],
      settings: { name: 'Autonomous Research Agent', version: '1.0.0' },
      version: '1.0.0'
    }
  },
  {
    id: 'content-summarizer',
    name: 'Content Summarizer',
    description: 'Fetch web content and generate concise summaries using AI',
    category: 'content',
    difficulty: 'beginner' as const,
    tags: ['web', 'summarization', 'api'],
    author: 'ClaraVerse',
    downloads: 2100,
    rating: 4.7,
    flow: {
      name: 'Content Summarizer',
      icon: '📄',
      nodes: [],
      connections: [],
      variables: [],
      settings: { name: 'Content Summarizer', version: '1.0.0' },
      version: '1.0.0'
    }
  },
  {
    id: 'image-analyzer',
    name: 'Image Analyzer',
    description: 'Analyze images and generate detailed descriptions using vision AI',
    category: 'vision',
    difficulty: 'intermediate' as const,
    tags: ['vision', 'image-analysis', 'multimodal'],
    author: 'ClaraVerse',
    downloads: 1650,
    rating: 4.6,
    flow: {
      name: 'Image Analyzer',
      icon: '🖼️',
      nodes: [],
      connections: [],
      variables: [],
      settings: { name: 'Image Analyzer', version: '1.0.0' },
      version: '1.0.0'
    }
  },
  {
    id: 'data-extractor',
    name: 'Structured Data Extractor',
    description: 'Extract structured JSON data from unstructured text',
    category: 'automation',
    difficulty: 'intermediate' as const,
    tags: ['json', 'structured-output', 'automation'],
    author: 'ClaraVerse',
    downloads: 1420,
    rating: 4.8,
    flow: {
      name: 'Structured Data Extractor',
      icon: '📊',
      nodes: [],
      connections: [],
      variables: [],
      settings: { name: 'Structured Data Extractor', version: '1.0.0' },
      version: '1.0.0'
    }
  },
  {
    id: 'audio-transcription',
    name: 'Audio Transcription Pipeline',
    description: 'Transcribe audio files with Whisper AI and generate summaries',
    category: 'automation',
    difficulty: 'beginner' as const,
    tags: ['audio', 'transcription', 'whisper'],
    author: 'ClaraVerse',
    downloads: 980,
    rating: 4.5,
    flow: {
      name: 'Audio Transcription Pipeline',
      icon: '🎤',
      nodes: [],
      connections: [],
      variables: [],
      settings: { name: 'Audio Transcription Pipeline', version: '1.0.0' },
      version: '1.0.0'
    }
  }
];

const TemplateBrowser: React.FC<TemplateBrowserProps> = ({ isOpen, onClose, onSelectTemplate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isOpen) return null;

  const categories = [
    { id: 'all', name: 'All Templates', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'ai', name: 'AI & LLM', icon: <Brain className="w-4 h-4" /> },
    { id: 'automation', name: 'Automation', icon: <Wrench className="w-4 h-4" /> },
    { id: 'content', name: 'Content', icon: <FileText className="w-4 h-4" /> },
    { id: 'vision', name: 'Vision & Media', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'api', name: 'API & Web', icon: <Globe className="w-4 h-4" /> },
  ];

  const difficultyColors = {
    beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const filteredTemplates = mockTemplates.filter((template: FlowTemplate) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glassmorphic rounded-xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20 dark:border-gray-700/50">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-sakura-500" />
              Agent Templates
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Start with a pre-built workflow and customize to your needs
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search and Filter */}
        <div className="p-6 border-b border-white/20 dark:border-gray-700/50">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 border border-white/30 dark:border-gray-700/50 rounded-lg glassmorphic-card text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap transition-all ${
                    selectedCategory === category.id
                      ? 'bg-sakura-500 text-white shadow-lg'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {category.icon}
                  <span className="text-sm font-medium">{category.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                No templates found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Try adjusting your search or filter criteria
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template: FlowTemplate) => (
                <div
                  key={template.id}
                  className="glassmorphic-card p-5 rounded-xl border border-white/30 dark:border-gray-700/50 hover:border-sakura-300 dark:hover:border-sakura-500 hover:shadow-xl cursor-pointer transition-all duration-200 hover:-translate-y-1 flex flex-col"
                  onClick={() => onSelectTemplate(template)}
                >
                  {/* Template Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                        {template.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${difficultyColors[template.difficulty as keyof typeof difficultyColors]}`}>
                          {template.difficulty}
                        </span>
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                          {template.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-1">
                    {template.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {template.tags.slice(0, 3).map((tag: string, idx: number) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 3 && (
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                        +{template.tags.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/20 dark:border-gray-700/50">
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        <span>{template.rating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        <span>{template.downloads}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTemplate(template);
                      }}
                      className="px-3 py-1 bg-sakura-500 hover:bg-sakura-600 text-white text-xs rounded-lg transition-colors"
                    >
                      Use Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/20 dark:border-gray-700/50 flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateBrowser;
