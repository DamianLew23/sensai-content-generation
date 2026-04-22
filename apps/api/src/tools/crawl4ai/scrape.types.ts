export const MIN_CONTENT_CHARS = 200;

export const CLOUDFLARE_SIGNATURES = [
  "Just a moment...",
  "cf-chl-",
  "Attention Required! | Cloudflare",
] as const;

export function isCloudflareChallenge(markdown: string): boolean {
  return CLOUDFLARE_SIGNATURES.some((s) => markdown.includes(s));
}
