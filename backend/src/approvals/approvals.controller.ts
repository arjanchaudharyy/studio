import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/auth-context.decorator';
import type { AuthContext } from '../auth/types';
import {
  ResolveApprovalDto,
  ListApprovalsQueryDto,
  ApprovalResponseDto,
  PublicApprovalResultDto,
} from './dto/approvals.dto';

@ApiTags('Approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List all approval requests' })
  @ApiResponse({ status: 200, description: 'List of approval requests', type: [ApprovalResponseDto] })
  async list(
    @CurrentAuth() auth: AuthContext | null,
    @Query() query: ListApprovalsQueryDto,
  ) {
    const orgId = auth?.organizationId ?? null;
    if (query.status === 'pending') {
      return this.approvalsService.listPending(orgId);
    }
    return this.approvalsService.list(orgId);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get approval request by ID' })
  @ApiParam({ name: 'id', description: 'Approval request ID' })
  @ApiResponse({ status: 200, description: 'Approval request details', type: ApprovalResponseDto })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  async get(@Param('id') id: string) {
    const approval = await this.approvalsService.findById(id);
    if (!approval) {
      throw new NotFoundException('Approval not found');
    }
    return approval;
  }

  @Post(':id/approve')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an approval request' })
  @ApiParam({ name: 'id', description: 'Approval request ID' })
  @ApiResponse({ status: 200, description: 'Approval request approved', type: ApprovalResponseDto })
  @ApiResponse({ status: 400, description: 'Approval already resolved or expired' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  async approve(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext | null,
    @Body() body: ResolveApprovalDto,
  ) {
    return this.approvalsService.resolve(id, {
      approved: true,
      respondedBy: body.respondedBy ?? auth?.userId ?? 'unknown',
      responseNote: body.responseNote,
    });
  }

  @Post(':id/reject')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an approval request' })
  @ApiParam({ name: 'id', description: 'Approval request ID' })
  @ApiResponse({ status: 200, description: 'Approval request rejected', type: ApprovalResponseDto })
  @ApiResponse({ status: 400, description: 'Approval already resolved or expired' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  async reject(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext | null,
    @Body() body: ResolveApprovalDto,
  ) {
    return this.approvalsService.resolve(id, {
      approved: false,
      respondedBy: body.respondedBy ?? auth?.userId ?? 'unknown',
      responseNote: body.responseNote,
    });
  }
}

/**
 * Public endpoints for approve/reject links (no auth required)
 * These use secure tokens instead of IDs
 */
@ApiTags('Approvals - Public')
@Controller('approve')
export class PublicApproveController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Approve via secure token (public link)' })
  @ApiParam({ name: 'token', description: 'Secure approval token' })
  @ApiResponse({ status: 200, description: 'Approval confirmed', type: PublicApprovalResultDto })
  @ApiResponse({ status: 404, description: 'Invalid or expired token' })
  async approveByToken(
    @Param('token') token: string,
    @Query('note') note?: string,
  ) {
    const approval = await this.approvalsService.resolveByApproveToken(token, {
      respondedBy: 'link',
      responseNote: note,
    });
    return {
      success: true,
      message: `Approved: ${approval.title}`,
      approval: {
        id: approval.id,
        title: approval.title,
        status: approval.status,
        respondedAt: approval.respondedAt,
      },
    };
  }
}

@ApiTags('Approvals - Public')
@Controller('reject')
export class PublicRejectController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Reject via secure token (public link)' })
  @ApiParam({ name: 'token', description: 'Secure rejection token' })
  @ApiResponse({ status: 200, description: 'Rejection confirmed', type: PublicApprovalResultDto })
  @ApiResponse({ status: 404, description: 'Invalid or expired token' })
  async rejectByToken(
    @Param('token') token: string,
    @Query('note') note?: string,
  ) {
    const approval = await this.approvalsService.resolveByRejectToken(token, {
      respondedBy: 'link',
      responseNote: note,
    });
    return {
      success: true,
      message: `Rejected: ${approval.title}`,
      approval: {
        id: approval.id,
        title: approval.title,
        status: approval.status,
        respondedAt: approval.respondedAt,
      },
    };
  }
}
