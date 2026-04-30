import { CleanedOutput } from "./cleaned";
import { DeepResearchOutput } from "./deep-research";
import { EntitiesOutput } from "./entities";
import { ExtractionOutput } from "./extraction";
import { JsonFallback } from "./json-fallback";
import { QueryFanOutOutput } from "./query-fanout";
import { ScrapeOutput } from "./scrape";
import { KGOutput } from "./kg";
import { OutlineGenOutput } from "./outline";
import { DistributeOutput } from "./distribute";
import { SerpOutput } from "./serp";

export function StepOutput({
  type,
  value,
  raw,
}: {
  type: string;
  value: unknown;
  raw: boolean;
}) {
  if (raw) return <JsonFallback value={value} />;
  if (value === null || value === undefined) return <JsonFallback value={value} />;

  switch (type) {
    case "tool.youcom.research":
      return <DeepResearchOutput value={value} />;
    case "tool.serp.fetch":
      return <SerpOutput value={value} />;
    case "tool.scrape":
      return <ScrapeOutput value={value} />;
    case "tool.content.clean":
      return <CleanedOutput value={value} />;
    case "tool.content.extract":
      return <ExtractionOutput value={value} />;
    case "tool.entity.extract":
      return <EntitiesOutput value={value} />;
    case "tool.query.fanout":
      return <QueryFanOutOutput value={value} />;
    case "tool.kg.assemble":
      return <KGOutput value={value} />;
    case "tool.outline.generate":
      return <OutlineGenOutput value={value} />;
    case "tool.outline.distribute":
      return <DistributeOutput value={value} />;
    default:
      return <JsonFallback value={value} />;
  }
}

export function hasRichRenderer(type: string): boolean {
  return (
    type === "tool.youcom.research" ||
    type === "tool.serp.fetch" ||
    type === "tool.scrape" ||
    type === "tool.content.clean" ||
    type === "tool.content.extract" ||
    type === "tool.entity.extract" ||
    type === "tool.query.fanout" ||
    type === "tool.kg.assemble" ||
    type === "tool.outline.generate" ||
    type === "tool.outline.distribute"
  );
}
