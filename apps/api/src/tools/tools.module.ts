import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { ToolCallRecorder } from "./tool-call-recorder.service";
import { ToolCacheService } from "./tool-cache.service";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { FirecrawlModule } from "./firecrawl/firecrawl.module";

@Module({
  imports: [DbModule, DataForSeoModule, FirecrawlModule],
  providers: [ToolCallRecorder, ToolCacheService],
  exports: [ToolCacheService, DataForSeoModule, FirecrawlModule],
})
export class ToolsModule {}
