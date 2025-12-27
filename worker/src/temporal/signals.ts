import { defineSignal } from '@temporalio/workflow';

/**
 * Signal for resolving an approval gate
 */
export interface ApprovalResolution {
  /** The approval request ID */
  approvalId: string;
  /** The node reference that was waiting */
  nodeRef: string;
  /** Whether the approval was granted */
  approved: boolean;
  /** Who responded to the approval */
  respondedBy?: string;
  /** Optional note from the reviewer */
  responseNote?: string;
  /** When the response was received */
  respondedAt: string;
}

/**
 * Signal to resolve a pending approval gate
 */
export const resolveApprovalSignal = defineSignal<[ApprovalResolution]>('resolveApproval');

/**
 * Query to get pending approvals for a workflow run
 */
export interface PendingApproval {
  approvalId: string;
  nodeRef: string;
  title: string;
  createdAt: string;
}
