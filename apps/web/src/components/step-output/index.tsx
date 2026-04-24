import { CleanedOutput } from "./cleaned";
import { DeepResearchOutput } from "./deep-research";
import { JsonFallback } from "./json-fallback";
import { ScrapeOutput } from "./scrape";
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
    default:
      return <JsonFallback value={value} />;
  }
}

export function hasRichRenderer(type: string): boolean {
  return (
    type === "tool.youcom.research" ||
    type === "tool.serp.fetch" ||
    type === "tool.scrape" ||
    type === "tool.content.clean"
  );
}
