// Template Loader - Automatically imports all JSON templates from this folder
import { FlowTemplate } from '../../../types/agent/types';

// Import all template JSON files
// You can add new templates by creating JSON files in this folder following the template structure

// Example templates - these will be replaced by actual JSON imports
import simpleChatTemplate from './simple-chat-assistant.json';
import researchAgentTemplate from './autonomous-research-agent.json';
import contentSummarizerTemplate from './content-summarizer.json';
import imageAnalyzerTemplate from './image-analyzer.json';
import dataExtractorTemplate from './structured-data-extractor.json';
import audioTranscriptionTemplate from './audio-transcription.json';
import apiWeatherTemplate from './api-weather-dashboard.json';
import notebookAnalysisTemplate from './notebook-data-analysis.json';

/**
 * Load all templates from JSON files
 * To add a new template:
 * 1. Create a new .json file in this folder (e.g., my-template.json)
 * 2. Import it above
 * 3. Add it to the templates array below
 */
export const loadTemplates = (): FlowTemplate[] => {
  const templates: FlowTemplate[] = [
    simpleChatTemplate as FlowTemplate,
    researchAgentTemplate as FlowTemplate,
    contentSummarizerTemplate as FlowTemplate,
    imageAnalyzerTemplate as FlowTemplate,
    dataExtractorTemplate as FlowTemplate,
    audioTranscriptionTemplate as FlowTemplate,
    apiWeatherTemplate as unknown as FlowTemplate,
    notebookAnalysisTemplate as unknown as FlowTemplate,
  ];

  return templates;
};

/**
 * Template JSON Structure:
 * {
 *   "id": "unique-template-id",
 *   "name": "Template Name",
 *   "description": "What this template does",
 *   "category": "ai" | "automation" | "content" | "vision" | "api",
 *   "difficulty": "beginner" | "intermediate" | "advanced",
 *   "tags": ["tag1", "tag2", "tag3"],
 *   "author": "Your Name",
 *   "downloads": 0,
 *   "rating": 5.0,
 *   "flow": {
 *     "name": "Flow Name",
 *     "icon": "🤖",
 *     "description": "Flow description",
 *     "nodes": [
 *       {
 *         "id": "node-1",
 *         "type": "input",
 *         "name": "Input Node",
 *         "position": { "x": 100, "y": 200 },
 *         "data": {},
 *         "inputs": [],
 *         "outputs": [
 *           { "id": "output-1", "name": "text", "type": "output", "dataType": "string" }
 *         ]
 *       }
 *     ],
 *     "connections": [
 *       {
 *         "id": "conn-1",
 *         "sourceNodeId": "node-1",
 *         "sourcePortId": "output-1",
 *         "targetNodeId": "node-2",
 *         "targetPortId": "input-1"
 *       }
 *     ],
 *     "variables": [],
 *     "settings": {
 *       "name": "Flow Name",
 *       "version": "1.0.0"
 *     },
 *     "version": "1.0.0"
 *   }
 * }
 */
