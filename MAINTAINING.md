# ShipSecAI Frontend - Maintaining Documentation

This document provides a comprehensive overview of the ShipSecAI frontend architecture, features, and implementation details to assist with maintenance and future development.

## Overview

The ShipSecAI frontend is a React-based workflow builder application that allows users to create, manage, and execute security automation workflows using a visual canvas. It's built with Vite, TypeScript, Tailwind CSS, and uses React Flow for the workflow visualization.

## Core Features

### 1. Workflow Builder Canvas
- **Visualization**: Uses React Flow to create a drag-and-drop workflow canvas
- **Node Management**: 
  - Add nodes by dragging components from the sidebar
  - Delete nodes/edges using Delete/Backspace keys
  - Select nodes to configure their properties
- **Connection Handling**:
  - Connect nodes using input/output ports
  - Automatic connection validation based on port types
  - Smoothstep edge styling

### 2. Component System
- **Component Registry**: Centralized registry system (src/components/workflow/nodes/registry.ts) that manages all available workflow components
- **Component Categories**:
  - Security Tools (e.g., Subfinder)
  - Building Blocks (e.g., Merge)
  - Input/Output (e.g., File Loader)
- **Component Types**:
  - Input: Data sources
  - Scan: Security scanning tools
  - Process: Data processing components
  - Output: Result handlers
- **JSON Specification**: Each component is defined by a JSON specification file that includes:
  - Metadata (id, name, description, version)
  - Input/output port definitions
  - Configurable parameters
  - Author information

### 3. UI Components

#### Layout Components
- Sidebar (src/components/layout/Sidebar.tsx): Component palette for dragging onto canvas
- TopBar (src/components/layout/TopBar.tsx): Navigation and workflow controls (save, run)
- BottomPanel (src/components/layout/BottomPanel.tsx): Execution logs and output display

#### Workflow Components
- WorkflowNode (src/components/workflow/WorkflowNode.tsx): Visual representation of a workflow component with:
  - Lucide icon rendering
  - Status indicators (running, success, error)
  - Input/output port handles
  - Execution time/error display
- ConfigPanel (src/components/workflow/ConfigPanel.tsx): Configuration interface for selected nodes showing:
  - Component information
  - Input port status
  - Parameter editing fields
- ParameterField (src/components/workflow/ParameterField.tsx): Dynamic form field rendering based on parameter type:
  - Text inputs
  - Text areas
  - Number inputs with min/max constraints
  - Boolean checkboxes
  - Single and multi-select dropdowns
  - File upload fields

### 4. State Management
- **Zustand Stores**:
  - ComponentStore (src/store/componentStore.ts): Manages component metadata
  - ExecutionStore (src/store/executionStore.ts): Handles workflow execution state and logs
- **Schema Validation**:
  - Uses Zod for validating component specifications, workflow structures, and execution data
  - Strong typing throughout the application with TypeScript inference from Zod schemas

### 5. API Integration
- **apiClient** (src/services/api.ts): Centralized Axios instance for backend communication
- **Endpoints**:
  - Workflow CRUD operations
  - Component metadata retrieval
  - Execution start/cancel/status
  - Execution log retrieval
- **Error Handling**: Global interceptor for API error handling

## Project Structure

```
src/
├── components/
│   ├── layout/          # TopBar, Sidebar, BottomPanel
│   └── workflow/       # Canvas, WorkflowNode, ConfigPanel, ParameterField
│       └── nodes/      # Component registry and specifications
│           ├── building-blocks/
│           ├── input-output/
│           └── security-tools/
├── pages/
│   ├── WorkflowBuilder.tsx
│   └── WorkflowList.tsx
├── schemas/           # Zod schemas for validation
├── services/          # API client
├── store/             # Zustand stores
└── utils/             # Utility functions
```

## Key Implementation Details

### Component Registry
- Components are imported as JSON specifications and registered in COMPONENT_REGISTRY
- Functions to retrieve components by slug, type, category, or search query
- Version management is planned for future implementation

### Workflow Execution
- Currently mocked in the frontend using Zustand store
- Implementation follows a three-phase approach:
  1. Individual node mocking
  2. Workflow execution mocking
  3. API integration
- Visual status feedback on nodes during execution

### Styling
- Tailwind CSS for styling with custom theme configuration
- Dynamic node styling based on execution status and component type
- Responsive design for different panel layouts

## Development Approach

The project follows an outside-in development approach:
1. Project documentation defines the overall vision and architecture
2. API contract specifies backend interface requirements
3. Roadmap outlines development phases and priorities
4. Component design documentation details individual features
5. Implementation focuses on one feature at a time with comprehensive testing

## Testing

Testing is handled in phases:
1. Unit tests for individual components
2. Integration tests for component interactions
3. End-to-end tests for complete workflow execution
4. Manual testing guides for UI features

## Recent Changes and Fixes

### Component Parameter State Management Fix (2025-01)
**Issue**: Parameter inputs (checkboxes, dropdowns, etc.) in ConfigPanel were not updating their visual state when changed.

**Root Cause**: ConfigPanel was using a stale `selectedNode` reference that wasn't synchronized with the updated node data in the Canvas state.

**Solution**: Added a `useEffect` hook in `Canvas.tsx` that syncs `selectedNode` with the latest node data from the nodes array whenever nodes are updated:
```typescript
// Sync selectedNode with the latest node data from nodes array
useEffect(() => {
  if (selectedNode) {
    const updatedNode = nodes.find(n => n.id === selectedNode.id)
    if (updatedNode && updatedNode !== selectedNode) {
      setSelectedNode(updatedNode as Node<NodeData>)
    }
  }
}, [nodes, selectedNode])
```

**Files Modified**: `src/components/workflow/Canvas.tsx`

### Documentation Links Feature (2025-01)
**Feature**: Added support for external documentation links in component specifications.

**Implementation**:
- Added optional `documentationUrl` field to `ComponentMetadataSchema` with URL validation
- Enhanced ConfigPanel to display "View docs" link with external link icon when URL is provided
- Opens in new tab with security attributes (`noopener noreferrer`)

**Schema Changes**:
```typescript
documentationUrl: z.string().url().optional()
```

**UI Enhancement**: Added subtle link with hover states that appears next to Documentation heading.

**Files Modified**: 
- `src/schemas/component.ts`
- `src/components/workflow/ConfigPanel.tsx`
- `src/components/workflow/nodes/security-tools/Subfinder/Subfinder.spec.json`

### Component Logo Support (2025-01)
**Feature**: Added support for component logos alongside existing Lucide icons.

**Key Design Decision**: Chose co-located asset approach over public folder for better component encapsulation and contributor experience.

**Implementation Strategy**:
1. **Schema Enhancement**: Modified logo field from `z.string().url()` to `z.string()` to support both URLs and local paths
2. **Asset Co-location**: Logos stored in component folders (e.g., `Subfinder/subfinder.png`)
3. **Registry Import System**: Logo assets imported via Vite's asset handling and URLs overridden at registration time
4. **Graceful Fallback**: If logo fails to load, automatically falls back to Lucide icon

**Technical Details**:
```typescript
// Registry imports and overrides
import subfinderLogo from './security-tools/Subfinder/subfinder.png'

function registerComponent(spec: unknown, logoOverride?: string): void {
  const component = ComponentMetadataSchema.parse(spec)
  if (logoOverride) {
    component.logo = logoOverride
  }
  COMPONENT_REGISTRY[component.slug] = component
}
```

**Sizing Strategy**: Used `object-contain` with fixed dimensions (h-5 w-5 for nodes, h-6 w-6 for ConfigPanel) to ensure consistent UI regardless of original image dimensions.

**Files Modified**:
- `src/schemas/component.ts` - Schema relaxation
- `src/components/workflow/nodes/registry.ts` - Import and override logic
- `src/components/workflow/WorkflowNode.tsx` - Logo display with fallback
- `src/components/workflow/ConfigPanel.tsx` - Logo in component info
- `src/components/layout/Sidebar.tsx` - Logo in draggable items
- Component specs updated to use local filenames

**Benefits Achieved**:
- Self-contained components for easier contributions
- Vite-optimized assets with proper caching
- Type-safe imports with build-time validation
- Backwards compatibility with external URLs

## Outstanding Tasks

1. Implement actual API integration for workflow execution
2. Add component version management
3. Implement save workflow functionality with API persistence
4. Add execution results/history tabs in BottomPanel
5. Add toast notifications for connection validation errors