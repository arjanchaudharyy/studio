import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import {
  ApprovalsController,
  PublicApproveController,
  PublicRejectController,
} from './approvals.controller';
import { TemporalModule } from '../temporal/temporal.module';

@Module({
  imports: [TemporalModule],
  controllers: [ApprovalsController, PublicApproveController, PublicRejectController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
