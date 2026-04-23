import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { ToolCallRecorder } from "./tool-call-recorder.service";
import { ToolCacheService } from "./tool-cache.service";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { FirecrawlModule } from "./firecrawl/firecrawl.module";
import { Crawl4aiModule } from "./crawl4ai/crawl4ai.module";
import { YoucomModule } from "./youcom/youcom.module";
import { ContentCleanerModule } from "./content-cleaner/content-cleaner.module";

@Module({
  imports: [DbModule, DataForSeoModule, FirecrawlModule, Crawl4aiModule, YoucomModule, ContentCleanerModule],
  providers: [ToolCallRecorder, ToolCacheService],
  exports: [ToolCacheService, ToolCallRecorder, DataForSeoModule, FirecrawlModule, Crawl4aiModule, YoucomModule, ContentCleanerModule],
})
export class ToolsModule {}
