import { Module } from '@nestjs/common';
import { NodeIORepository } from './node-io.repository';
import { NodeIOService } from './node-io.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [NodeIORepository, NodeIOService],
  exports: [NodeIOService, NodeIORepository],
})
export class NodeIOModule {}
