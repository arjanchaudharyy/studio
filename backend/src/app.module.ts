import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import './components/register-default-components';
import { TraceModule } from './trace/trace.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [WorkflowsModule, TraceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
