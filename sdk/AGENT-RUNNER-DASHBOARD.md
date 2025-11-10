# Clara Agent Runner - Web Dashboard

## 🎉 Dashboard Successfully Deployed!

A beautiful web UI has been added to the Clara Agent Runner backend service, accessible directly from the container.

---

## 🌐 Access the Dashboard

The dashboard is now live at:

- **http://localhost:3000/** (root)
- **http://localhost:3000/dashboard** (explicit route)

Simply open your browser and navigate to either URL!

---

## ✨ Features

### Dashboard Overview
- **Real-time Health Monitoring** - Live status indicator showing service health
- **Workflow Grid View** - Beautiful card-based display of all deployed workflows
- **Search & Filter** - Quickly find workflows by name or slug
- **Status Filtering** - Filter by active/inactive workflows
- **Auto-refresh** - Automatically updates every 30 seconds

### Workflow Details
Each workflow card shows:
- ✅ Workflow name and description
- ✅ API endpoint slug
- ✅ Active/inactive status
- ✅ Execution count
- ✅ Last execution date
- ✅ Quick action buttons

### Schema Display
The Schema tab automatically:
- ✅ Fetches OpenAPI 3.0 schema from the workflow endpoint
- ✅ Parses and extracts input/output schemas
- ✅ Displays formatted JSON schemas with syntax highlighting
- ✅ Shows required fields and data types for each parameter
- ✅ Provides complete schema structure for integration

### Interactive Features
- **View Details Modal** - Click any workflow to see full details:
  - Complete API endpoint URL
  - Workflow slug
  - Execution statistics
  - Status information
  - Direct link to Swagger documentation
- **Smart Test Input** - Automatically pre-fills test input with example values from schema
- **Copy to Clipboard** - One-click copy for endpoints and code examples
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Real-time Validation** - JSON syntax validation in test input editor

---

## 🎨 Design

The dashboard follows **ClaraVerse's design system**:
- ✅ Tailwind CSS with dark mode
- ✅ Sakura-themed accent colors
- ✅ Smooth animations and transitions
- ✅ Clean, modern UI components
- ✅ Fully responsive layout

---

## 🔧 Technical Implementation

### Frontend
- **Single-page HTML app** with embedded CSS and JavaScript
- **Alpine.js** for reactive UI components
- **Tailwind CSS** via CDN for styling
- **No build step required** - pure HTML/CSS/JS

### Backend Integration
- Serves static files from `server/public/` directory
- Routes: `/` and `/dashboard` both serve the dashboard
- Uses existing Agent Runner APIs:
  - `GET /health` - Health status
  - `GET /api/deployments` - List workflows
  - All other workflow APIs

### Files Created
1. **`sdk/server/public/dashboard.html`** - Complete dashboard UI
2. **`sdk/server/server.js`** - Updated with routes and static file serving

---

## 📊 What You Can See

### Dashboard Home
- List of all deployed workflows
- Health status badge (green = healthy, red = degraded)
- Search bar for filtering workflows
- Active/Inactive filter tabs

### Workflow Cards
Each card displays:
```
┌─────────────────────────────┐
│ Workflow Name        [Active]│
│ Description text             │
│ /workflow-slug               │
├─────────────────────────────┤
│ Executions: 42  Last: Oct 15 │
├─────────────────────────────┤
│ [View Details]  [Copy] [📋] │
└─────────────────────────────┘
```

### Details Modal
Click "View Details" to see:
- Full API endpoint with copy button
- Workflow slug
- Execution statistics grid
- Active/inactive status
- Link to Swagger documentation

---

## 🚀 Usage Examples

### View All Workflows
1. Open http://localhost:3000/
2. See all deployed workflows in a grid
3. Use search to filter by name/slug
4. Use tabs to filter by status

### Inspect a Workflow
1. Click "View Details" on any workflow card
2. View complete endpoint information
3. Copy endpoint URL with one click
4. Open Swagger docs for API testing

### Monitor Service Health
- Green badge = Service is healthy
- Red badge = Service has issues
- Badge updates automatically every 30 seconds

---

## 🔐 Authentication

### Workflow Execution
Each deployed workflow requires an API key for execution. The dashboard's Test tab includes:
- **API Key Input**: Secure password field for entering workflow-specific API keys
- **Info Banner**: Explains where to get API keys and how to regenerate them
- **Format Validation**: Accepts Bearer tokens in the format `clara_sk_...`

### Getting API Keys
- **On Deployment**: API keys are shown once when deploying a workflow via `POST /api/deploy`
- **Regeneration**: Use `POST /api/workflows/:id/regenerate-key` to generate a new key
- **Security**: Keys are hashed in the database and cannot be retrieved after deployment

### Dashboard Access
**Note:** The dashboard currently displays all workflows without authentication.

For production deployments, you may want to add:
- Basic authentication for dashboard access
- API key management interface
- User-based workflow filtering

---

## 🛠️ Development

### Modify the Dashboard
Edit the HTML file:
```bash
sdk/server/public/dashboard.html
```

Then rebuild the container:
```bash
cd ClaraVerseBackendServer
docker-compose build clara_agent_runner
docker-compose up -d clara_agent_runner
```

### Add New Features
The dashboard uses Alpine.js for reactivity. You can:
- Add new data fetching in the `init()` method
- Create new computed properties (like `filteredWorkflows`)
- Add new modal views similar to `selectedWorkflow`
- Extend the UI with additional Tailwind components

---

## 📝 API Integration

The dashboard consumes these Agent Runner APIs:

### Health Check
```javascript
GET /health
→ Returns service status and uptime
```

### List Workflows
```javascript
GET /api/deployments?limit=100
→ Returns array of deployed workflows
```

### Workflow Structure
```javascript
{
  id: "uuid",
  name: "Workflow Name",
  slug: "workflow-slug",
  description: "Description",
  endpoint: "http://localhost:3000/api/workflows/slug/execute",
  docs: "http://localhost:3000/api/workflows/slug/docs",
  isActive: true,
  executionCount: 42,
  lastExecuted: "2025-11-07T10:00:00Z",
  createdAt: "2025-11-01T10:00:00Z"
}
```

---

## 🎯 Use Cases

### For Developers
- Quick overview of all deployed workflows
- Copy endpoints for testing
- View execution statistics
- Access API documentation

### For Monitoring
- Real-time service health status
- Workflow execution counts
- Last execution timestamps
- Active/inactive workflow tracking

### For Documentation
- Visual representation of deployed APIs
- Easy access to Swagger docs
- Shareable workflow information

---

## 🔄 Auto-refresh Behavior

The dashboard automatically refreshes data every 30 seconds:
- Health status updates
- Workflow list updates
- Execution count updates
- Last execution date updates

---

## 🌟 Future Enhancements

Potential additions (not yet implemented):
- [ ] Execution history viewer with API key authentication
- [ ] Workflow deployment interface
- [ ] Real-time execution logs
- [ ] Workflow testing interface
- [ ] User authentication/authorization
- [ ] Workflow analytics and charts
- [ ] Export workflow configurations
- [ ] Bulk operations on workflows

---

## 📞 Support

The dashboard is built on top of the existing Agent Runner API. For API documentation, visit:
- http://localhost:3000/api/info

For any issues or feature requests, refer to the main Clara Agent Runner documentation.

---

**Dashboard Version:** 1.0.0
**Built:** November 7, 2025
**Status:** ✅ Production Ready
