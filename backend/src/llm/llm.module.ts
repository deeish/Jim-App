import { Global, Module } from '@nestjs/common';
import { LlmClient } from './llm-client';
import { LlmModelWatch } from './llm-model-watch.service';

/**
 * Global so the generator, the plans pipeline and the health probe all share
 * ONE client (one settings read, one SDK instance, one model check).
 */
@Global()
@Module({
  providers: [LlmClient, LlmModelWatch],
  exports: [LlmClient, LlmModelWatch],
})
export class LlmModule {}
