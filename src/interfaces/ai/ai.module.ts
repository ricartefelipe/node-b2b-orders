import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiDocsService } from './ai-docs.service';

@Module({
  controllers: [AiController],
  providers: [AiDocsService],
})
export class AiModule {}
