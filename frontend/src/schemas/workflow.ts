import type { components } from '@shipsec/backend-client'

/**
 * Workflow types from backend API client
 * These types are auto-generated from the OpenAPI specification
 */

// Extract workflow types from backend client
type WorkflowResponseDto = components['schemas']['WorkflowResponseDto']
type CreateWorkflowRequestDto = components['schemas']['CreateWorkflowRequestDto']
type UpdateWorkflowRequestDto = components['schemas']['UpdateWorkflowRequestDto']

/**
 * Workflow metadata (for list endpoint)
 * Uses WorkflowResponseDto from backend API
 */
export type WorkflowMetadata = WorkflowResponseDto

/**
 * Complete workflow (for detail endpoint)
 * Uses WorkflowResponseDto from backend API
 */
export type Workflow = WorkflowResponseDto

/**
 * Create workflow request
 * Uses CreateWorkflowRequestDto from backend API
 */
export type CreateWorkflow = CreateWorkflowRequestDto

/**
 * Update workflow request
 * Uses UpdateWorkflowRequestDto from backend API
 * Note: The backend type requires name, but we make it optional for partial updates
 */
export type UpdateWorkflow = UpdateWorkflowRequestDto