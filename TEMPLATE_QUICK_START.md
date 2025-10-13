# 🎯 QUICK START: Adding Templates to Agent Studio

## Where to Put Templates

**📁 Folder Location:**
```
src/components/AgentBuilder/templates/
```

All your JSON template files go here!

## 🚀 How to Add a New Template

### Method 1: Export from Agent Studio (EASIEST!)

1. **Build your flow in Agent Studio**
   - Add nodes, connect them, configure everything
   - Test to make sure it works

2. **Export the flow**
   - Click "Export" button
   - Choose "JSON" format
   - Save the file

3. **Convert to template format**
   - Open your exported JSON
   - Wrap it in the template structure:

```json
{
  "id": "my-custom-template",
  "name": "My Custom Template",
  "description": "What this template does",
  "category": "ai",
  "difficulty": "beginner",
  "tags": ["tag1", "tag2"],
  "author": "Your Name",
  "downloads": 0,
  "rating": 5.0,
  "flow": {
    ... PASTE YOUR EXPORTED FLOW JSON HERE ...
  }
}
```

4. **Save in templates folder**
   - Save as `my-custom-template.json`

5. **Register in templateLoader.ts**
   - Add import: `import myCustomTemplate from './my-custom-template.json';`
   - Add to array: `myCustomTemplate as FlowTemplate,`

6. **Restart dev server** (if needed)
   ```bash
   npm run dev
   ```

Done! Your template will appear in the browser!

## 📝 Example: Creating a Simple Chat Template

Here's a complete example you can copy-paste:

**File: `simple-example.json`**
```json
{
  "id": "simple-example",
  "name": "Simple Example",
  "description": "A basic example template",
  "category": "ai",
  "difficulty": "beginner",
  "tags": ["example", "simple"],
  "author": "Me",
  "downloads": 0,
  "rating": 5.0,
  "flow": {
    "name": "Simple Example",
    "description": "Example flow",
    "icon": "🎯",
    "nodes": [
      {
        "id": "input-1",
        "type": "input",
        "name": "User Input",
        "position": { "x": 100, "y": 200 },
        "data": {},
        "inputs": [],
        "outputs": [
          {
            "id": "text-out",
            "name": "text",
            "type": "output",
            "dataType": "string"
          }
        ]
      },
      {
        "id": "llm-1",
        "type": "llm",
        "name": "AI Response",
        "position": { "x": 400, "y": 200 },
        "data": {
          "config": {
            "model": "llama3.2:latest",
            "systemPrompt": "You are a helpful assistant."
          }
        },
        "inputs": [
          {
            "id": "prompt-in",
            "name": "prompt",
            "type": "input",
            "dataType": "string"
          }
        ],
        "outputs": [
          {
            "id": "response-out",
            "name": "response",
            "type": "output",
            "dataType": "string"
          }
        ]
      },
      {
        "id": "output-1",
        "type": "output",
        "name": "Final Output",
        "position": { "x": 700, "y": 200 },
        "data": {},
        "inputs": [
          {
            "id": "value-in",
            "name": "value",
            "type": "input",
            "dataType": "any"
          }
        ],
        "outputs": []
      }
    ],
    "connections": [
      {
        "id": "conn-1",
        "sourceNodeId": "input-1",
        "sourcePortId": "text-out",
        "targetNodeId": "llm-1",
        "targetPortId": "prompt-in"
      },
      {
        "id": "conn-2",
        "sourceNodeId": "llm-1",
        "sourcePortId": "response-out",
        "targetNodeId": "output-1",
        "targetPortId": "value-in"
      }
    ],
    "variables": [],
    "settings": {
      "name": "Simple Example",
      "version": "1.0.0"
    },
    "version": "1.0.0"
  }
}
```

Then in `templateLoader.ts`:
```typescript
import simpleExample from './simple-example.json';

export const loadTemplates = (): FlowTemplate[] => {
  const templates: FlowTemplate[] = [
    // ... existing templates
    simpleExample as FlowTemplate,  // Add this line
  ];
  return templates;
};
```

## 🎨 Category Options

Pick ONE category:
- `"ai"` - AI models, chat, LLMs
- `"automation"` - Workflows, data processing
- `"content"` - Text, documents
- `"vision"` - Images, videos
- `"api"` - Web, APIs

## 🏆 Difficulty Levels

- `"beginner"` - Simple, easy to understand
- `"intermediate"` - Medium complexity
- `"advanced"` - Complex, multiple steps

## 📍 Current Template Files

You can edit these or create new ones:
- ✅ `simple-chat-assistant.json`
- ✅ `autonomous-research-agent.json`
- ✅ `content-summarizer.json`
- ✅ `image-analyzer.json`
- ✅ `structured-data-extractor.json`
- ✅ `audio-transcription.json`

## 🔧 Need to Test?

1. Save your JSON file
2. Register in `templateLoader.ts`
3. Go to Agent Studio
4. Click "Browse Templates"
5. Find your template
6. Click it!
7. Check if nodes appear correctly

## 💡 Pro Tips

✅ **DO:**
- Export working flows from Agent Studio
- Use clear, descriptive names
- Add good descriptions
- Test before sharing

❌ **DON'T:**
- Create templates manually (export from Agent Studio instead!)
- Forget to register in templateLoader.ts
- Use same ID for multiple templates

## 🆘 Having Issues?

**Template not showing up?**
- Check if registered in `templateLoader.ts`
- Restart dev server
- Check browser console for errors

**Template creates but nodes don't appear?**
- Compare your JSON structure with working templates
- Make sure `nodes` and `connections` arrays are correct
- Check node IDs match in connections

**Type errors?**
- Add `as FlowTemplate` when importing in templateLoader.ts

---

**Team Effort! 🤝**
- You create the flows in Agent Studio
- Export them
- Drop JSON files in the templates folder
- Register them
- Done!
