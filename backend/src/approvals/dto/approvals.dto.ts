import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ===== Request DTOs =====

export const ResolveApprovalSchema = z.object({
  respondedBy: z.string().optional().describe('User ID or identifier of who resolved the approval'),
  responseNote: z.string().optional().describe('Optional note explaining the decision'),
});

export class ResolveApprovalDto extends createZodDto(ResolveApprovalSchema) {}

export const ListApprovalsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']).optional(),
});

export class ListApprovalsQueryDto extends createZodDto(ListApprovalsQuerySchema) {}

// ===== Response DTOs =====

export const ApprovalResponseSchema = z.object({
  id: z.string().uuid(),
  runId: z.string(),
  workflowId: z.string().uuid(),
  nodeRef: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']),
  title: z.string(),
  description: z.string().nullable(),
  context: z.any().nullable(),
  approveToken: z.string(),
  rejectToken: z.string(),
  timeoutAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  respondedBy: z.string().nullable(),
  responseNote: z.string().nullable(),
  organizationId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class ApprovalResponseDto extends createZodDto(ApprovalResponseSchema) {}

export const PublicApprovalResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  approval: z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']),
    respondedAt: z.string().nullable(),
  }),
});

export class PublicApprovalResultDto extends createZodDto(PublicApprovalResultSchema) {}
