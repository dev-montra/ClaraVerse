# Agent Templates - README

## 📁 Template Location
**Put all your template JSON files in this folder:**
```
src/components/AgentBuilder/templates/
```

## 🎯 Quick Start

### Step 1: Create a JSON file
Create a new file in this folder, for example: `my-awesome-template.json`

### Step 2: Copy this template structure
```json
{
  "id": "unique-template-id",
  "name": "Template Name",
  "description": "What this template does",
  "category": "ai",
  "difficulty": "beginner",
  "tags": ["tag1", "tag2", "tag3"],
  "author": "Your Name",
  "downloads": 0,
  "rating": 5.0,
  "flow": {
    "name": "Flow Name",
    "description": "Flow description",
    "icon": "🤖",
    "nodes": [],
    "connections": [],
    "variables": [],
    "settings": {
      "name": "Flow Name",
      "version": "1.0.0"
    },
    "version": "1.0.0"
  }
}
```

### Step 3: Add your nodes
Replace the empty `"nodes": []` array with your actual nodes from Agent Studio.

To get nodes from an existing flow:
1. Create the flow in Agent Studio
2. Click "Export" → "JSON"
3. Copy the `nodes` array from the exported JSON
4. Paste it into your template JSON

### Step 4: Add your connections
Same as Step 3, but for the `connections` array.

### Step 5: Register in templateLoader.ts
Open `templateLoader.ts` and:

1. Add an import at the top:
```typescript
import myAwesomeTemplate from './my-awesome-template.json';
```

2. Add it to the templates array:
```typescript
export const loadTemplates = (): FlowTemplate[] => {
  const templates: FlowTemplate[] = [
    simpleChatTemplate,
    // ... other templates
    myAwesomeTemplate,  // Add your template here
  ];
  return templates;
};
```

## 📋 Field Descriptions

### Template Fields
- **id**: Unique identifier (use kebab-case, e.g., "my-template")
- **name**: Display name shown in browser
- **description**: Brief explanation of what it does
- **category**: One of: `"ai"`, `"automation"`, `"content"`, `"vision"`, `"api"`
- **difficulty**: One of: `"beginner"`, `"intermediate"`, `"advanced"`
- **tags**: Array of searchable keywords
- **author**: Your name or organization
- **downloads**: Number of times used (for display)
- **rating**: 1-5 star rating (for display)

### Flow Fields
- **name**: Flow name (can be same as template name)
- **description**: Optional detailed description
- **icon**: Emoji icon (e.g., "🤖", "🔬", "📄")
- **nodes**: Array of node objects from Agent Studio
- **connections**: Array of connection objects linking nodes
- **variables**: Array of flow variables (usually empty)
- **settings**: Flow metadata
- **version**: Semantic version string

## 🎨 Available Categories

Choose one category for your template:

- **ai**: LLM, chat, autonomous agents
- **automation**: Data processing, workflows
- **content**: Text processing, summarization
- **vision**: Image/video processing
- **api**: Web scraping, API integration

## 📊 Node Structure Reference

Each node should have this structure:
```json
{
  "id": "node-unique-id",
  "type": "node-type",
  "name": "Node Display Name",
  "position": { "x": 100, "y": 200 },
  "data": {
    "config": {
      "model": "llama3.2:latest",
      "systemPrompt": "Your prompt here"
    }
  },
  "inputs": [
    {
      "id": "input-id",
      "name": "input name",
      "type": "input",
      "dataType": "string"
    }
  ],
  "outputs": [
    {
      "id": "output-id",
      "name": "output name",
      "type": "output",
      "dataType": "string"
    }
  ]
}
```

## 🔗 Connection Structure Reference

Each connection should have:
```json
{
  "id": "conn-unique-id",
  "sourceNodeId": "source-node-id",
  "sourcePortId": "source-output-id",
  "targetNodeId": "target-node-id",
  "targetPortId": "target-input-id"
}
```

## 🚀 Testing Your Template

1. Save your JSON file
2. Register it in `templateLoader.ts`
3. Restart the dev server (if needed)
4. Go to Agent Studio
5. Click "Browse Templates"
6. Search for your template
7. Click to create a flow from it

## 💡 Tips

1. **Export existing flows**: The easiest way to create templates is to build a flow in Agent Studio first, then export it
2. **Clean up positions**: Adjust `x` and `y` positions to make nodes well-spaced
3. **Use clear names**: Make node names descriptive
4. **Add good descriptions**: Help users understand what each template does
5. **Choose appropriate tags**: Makes templates easier to find

## 📝 Example Templates

Check these existing templates for reference:
- `simple-chat-assistant.json` - Basic chat setup
- `autonomous-research-agent.json` - Agent with tools
- `content-summarizer.json` - API + LLM workflow
- `image-analyzer.json` - Vision model usage
- `api-weather-dashboard.json` 🆕 - REST API integration example
- `notebook-data-analysis.json` 🆕 - Python notebook with Pandas/data analysis

## ❓ Need Help?

The structure should match exactly what Agent Studio exports. If you're unsure:
1. Build a simple flow in Agent Studio
2. Export it as JSON
3. Use that as a reference
4. Copy the nodes and connections arrays

## 🔄 Hot Reload

Changes to JSON files should be picked up automatically by the dev server. If not, restart it:
```bash
npm run dev
```
