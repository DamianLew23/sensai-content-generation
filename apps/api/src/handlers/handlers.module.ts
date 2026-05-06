import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ScrapeFetchHandler } from "./scrape-fetch.handler";
import { YoucomResearchHandler } from "./youcom-research.handler";
import { ContentCleanHandler } from "./content-clean.handler";
import { ContentExtractHandler } from "./content-extract.handler";
import { EntityExtractHandler } from "./entity-extract.handler";
import { QueryFanOutHandler } from "./query-fanout.handler";
import { KGAssemblyHandler } from "./kg-assembly.handler";
import { OutlineGenerateHandler } from "./outline-generate.handler";
import { OutlineDistributeHandler } from "./outline-distribute.handler";
import { DraftGenerateHandler } from "./draft-generate.handler";
import { DataEnrichHandler } from "./data-enrich.handler";
import { ArticleOptimizeHandler } from "./article-optimize.handler";
import { ArticleIntermediateHandler } from "./article-intermediate.handler";
import { ArticleHumanizeHandler } from "./article-humanize.handler";
import { ToolsModule } from "../tools/tools.module";
import { OutlineGeneratorModule } from "../tools/outline-generator/outline-generator.module";
import { KGDistributorModule } from "../tools/kg-distributor/kg-distributor.module";
import { DraftGeneratorModule } from "../tools/draft-generator/draft-generator.module";
import { DataEnricherModule } from "../tools/data-enricher/data-enricher.module";
import { ArticleOptimizeModule } from "../tools/article-optimize/article-optimize.module";
import { ArticleIntermediateModule } from "../tools/article-intermediate/article-intermediate.module";
import { ArticleHumanizeModule } from "../tools/article-humanize/article-humanize.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";
import { loadEnv } from "../config/env";

@Module({
  imports: [
    ToolsModule,
    OutlineGeneratorModule,
    KGDistributorModule,
    DraftGeneratorModule,
    DataEnricherModule,
    ArticleOptimizeModule,
    ArticleIntermediateModule,
    ArticleHumanizeModule,
  ],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    ScrapeFetchHandler,
    YoucomResearchHandler,
    ContentCleanHandler,
    ContentExtractHandler,
    EntityExtractHandler,
    QueryFanOutHandler,
    KGAssemblyHandler,
    OutlineGenerateHandler,
    OutlineDistributeHandler,
    DraftGenerateHandler,
    DataEnrichHandler,
    {
      provide: "YOUCOM_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "CLEANING_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "ENTITY_EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "QUERY_FANOUT_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "OUTLINE_GENERATE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "OUTLINE_DISTRIBUTE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "DRAFT_GENERATE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "DATA_ENRICH_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "ARTICLE_OPTIMIZE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "ARTICLE_INTERMEDIATE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "ARTICLE_HUMANIZE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
    ArticleOptimizeHandler,
    ArticleIntermediateHandler,
    ArticleHumanizeHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (
        brief: BriefHandler,
        serp: SerpFetchHandler,
        scrape: ScrapeFetchHandler,
        youcom: YoucomResearchHandler,
        clean: ContentCleanHandler,
        extract: ContentExtractHandler,
        entities: EntityExtractHandler,
        fanout: QueryFanOutHandler,
        kg: KGAssemblyHandler,
        outlineGenerate: OutlineGenerateHandler,
        outlineDistribute: OutlineDistributeHandler,
        draftGenerate: DraftGenerateHandler,
        dataEnrich: DataEnrichHandler,
        articleOptimize: ArticleOptimizeHandler,
        articleIntermediate: ArticleIntermediateHandler,
        articleHumanize: ArticleHumanizeHandler,
      ): StepHandler[] => [
        brief,
        serp,
        scrape,
        youcom,
        clean,
        extract,
        entities,
        fanout,
        kg,
        outlineGenerate,
        outlineDistribute,
        draftGenerate,
        dataEnrich,
        articleOptimize,
        articleIntermediate,
        articleHumanize,
      ],
      inject: [
        BriefHandler,
        SerpFetchHandler,
        ScrapeFetchHandler,
        YoucomResearchHandler,
        ContentCleanHandler,
        ContentExtractHandler,
        EntityExtractHandler,
        QueryFanOutHandler,
        KGAssemblyHandler,
        OutlineGenerateHandler,
        OutlineDistributeHandler,
        DraftGenerateHandler,
        DataEnrichHandler,
        ArticleOptimizeHandler,
        ArticleIntermediateHandler,
        ArticleHumanizeHandler,
      ],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
