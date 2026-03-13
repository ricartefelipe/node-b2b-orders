import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiDocsService } from './ai-docs.service';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { NlpSearchController } from './nlp-search.controller';
import { NlpSearchService } from './nlp-search.service';

@Module({
  controllers: [AiController, RecommendationController, NlpSearchController],
  providers: [AiDocsService, RecommendationService, NlpSearchService],
})
export class AiModule {}
