# PayRox Refactor Studio - Web UI

A production-ready web interface for the PayRox async job system, providing real-time monitoring and control of refactoring operations.

## Features

### 🚀 Real-time Job Monitoring
- **Live Progress Updates**: WebSocket-powered real-time progress tracking
- **Visual Progress Bars**: Step-by-step progress visualization with percentages
- **Live Connection Status**: Real-time connection indicator
- **Auto-refresh Job List**: Automatically updates every 5 seconds

### 💼 Job Management
- **Start New Jobs**: Intuitive form for launching refactor operations
- **Job History**: Complete list of all jobs with status indicators
- **Job Cancellation**: Cancel running jobs with confirmation
- **Job Details**: Comprehensive view of job progress, logs, and results

### 📊 Multi-tab Interface
- **Progress Tab**: Real-time progress tracking with current step info
- **Logs Tab**: Live terminal-style logs with auto-scroll
- **Result Tab**: Job results with JSON download capability

### 🎨 Professional UI/UX
- **Modern Design**: Gradient backgrounds with glass-morphism effects
- **Responsive Layout**: Works on desktop, tablet, and mobile
- **Status Indicators**: Color-coded status with intuitive icons
- **Smooth Animations**: Hover effects and smooth transitions
- **Professional Typography**: Clean, readable fonts with proper hierarchy

### 🔧 Technical Features
- **No Build Required**: Pure HTML/JS using CDN resources
- **React-based**: Modern component architecture
- **WebSocket Integration**: Real-time bidirectional communication
- **Error Handling**: Comprehensive error display and handling
- **File Downloads**: JSON result downloads with proper formatting

## Architecture

### Frontend Stack
- **React 18**: Modern React with hooks
- **Tailwind CSS**: Utility-first CSS framework
- **Font Awesome**: Professional icon library
- **Babel Standalone**: In-browser JSX compilation

### Backend Integration
- **FastAPI**: RESTful API endpoints
- **WebSocket**: Real-time updates via `/ws/jobs/{id}`
- **Static Files**: Served via FastAPI static file handler

### Job System Integration
- **Job CRUD**: Create, Read, Update, Delete operations
- **Progress Tracking**: 5-step refactor pipeline monitoring
- **Real-time Logs**: Live log streaming
- **Result Management**: Structured result handling and downloads

## API Endpoints Used

### REST Endpoints
- `POST /jobs/start` - Start new refactor job
- `GET /jobs/{id}` - Get job details
- `GET /jobs` - List all jobs
- `POST /jobs/{id}/cancel` - Cancel running job

### WebSocket Endpoints
- `WS /ws/jobs/{id}` - Real-time job updates

## File Structure

```
web-ui/
├── index.html          # Main application file
└── README.md          # This documentation
```

## Usage

### Starting the Server
The web UI is automatically served by the FastAPI application:

```bash
cd app
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Accessing the Interface
Open your browser to: `http://localhost:8000`

### Creating a New Job
1. Click "New Job" button in the header
2. Select job type (currently "refactor")
3. Specify input file path
4. Add custom parameters as JSON (optional)
5. Click "Start Job"

### Monitoring Job Progress
1. Select a job from the list (left panel)
2. View real-time progress in the main panel
3. Switch between Progress, Logs, and Result tabs
4. Monitor live connection status
5. Cancel jobs if needed

### Downloading Results
1. Navigate to the "Result" tab for completed jobs
2. Click "Download" to save results as JSON
3. Results include all artifacts and metadata

## Customization

### Styling
The interface uses Tailwind CSS classes and custom CSS variables:
- Modify colors in the `<style>` section
- Adjust gradient backgrounds with `.gradient-bg`
- Customize glass effects with `.glass-effect`

### Job Types
Currently supports "refactor" jobs. To add new types:
1. Update the job type dropdown in `NewJobForm`
2. Add corresponding backend handlers
3. Update progress step definitions if needed

### Real-time Features
WebSocket connection automatically handles:
- Connection status monitoring
- Automatic reconnection
- Live progress updates
- Error handling and display

## Production Considerations

### Performance
- Uses React production builds via CDN
- Optimized CSS with Tailwind
- Efficient WebSocket handling
- Auto-scrolling logs with performance limits

### Security
- JSON input validation
- Confirmation dialogs for destructive actions
- Proper error message sanitization
- CORS-ready for production deployment

### Scalability
- Lightweight single-file deployment
- CDN-based dependencies
- Efficient WebSocket usage
- Minimal server-side requirements

## Browser Support
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Dependencies
All dependencies are loaded via CDN:
- React 18 (Production)
- ReactDOM 18 (Production)
- Babel Standalone 7
- Tailwind CSS 2.2.19
- Font Awesome 6.0.0
