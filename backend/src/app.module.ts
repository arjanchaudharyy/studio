import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import './components/register-default-components';
import { ComponentsModule } from './components/components.module';
import { TraceModule } from './trace/trace.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [WorkflowsModule, TraceModule, ComponentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
