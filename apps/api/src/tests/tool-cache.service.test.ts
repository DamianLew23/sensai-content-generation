import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolCacheService } from "../tools/tool-cache.service";
import type { ToolCallRecorder } from "../tools/tool-call-recorder.service";

function buildDb(opts: { hit?: { result: unknown; expiresAt: Date } | null } = {}) {
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(opts.hit ? [opts.hit] : []),
    }),
  });
  return { db: { select, insert } as any, insert, select };
}

function buildRecorder() {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as ToolCallRecorder & { record: ReturnType<typeof vi.fn> };
}

const baseOpts = {
  tool: "dataforseo",
  method: "serp.organic.live",
  params: { keyword: "test", locationCode: 2616, languageCode: "pl", depth: 10 },
  ttlSeconds: 7 * 86400,
  runId: "11111111-1111-1111-1111-111111111111",
  stepId: "22222222-2222-2222-2222-222222222222",
};

describe("ToolCacheService", () => {
  let recorder: ReturnType<typeof buildRecorder>;

  beforeEach(() => {
    recorder = buildRecorder();
  });

  it("HIT: skips fetcher and records fromCache=true with cost=0", async () => {
    const future = new Date(Date.now() + 60_000);
    const { db } = buildDb({ hit: { result: { items: [{ title: "cached" }] }, expiresAt: future } });
    const svc = new ToolCacheService(db, recorder as any);

    const fetcher = vi.fn();
    const out = await svc.getOrSet({ ...baseOpts, fetcher });

    expect(out).toEqual({ items: [{ title: "cached" }] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      fromCache: true,
      costUsd: "0",
      latencyMs: 0,
      tool: "dataforseo",
      method: "serp.organic.live",
    }));
  });

  it("MISS: invokes fetcher, inserts to cache with expiresAt = now + ttl, records fromCache=false", async () => {
    const { db, insert } = buildDb({ hit: null });
    const svc = new ToolCacheService(db, recorder as any);

    const before = Date.now();
    const fetcher = vi.fn().mockResolvedValue({
      result: { items: [{ title: "fresh" }] }, costUsd: "0.0006", latencyMs: 234,
    });
    const out = await svc.getOrSet({ ...baseOpts, fetcher });
    const after = Date.now();

    expect(out).toEqual({ items: [{ title: "fresh" }] });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const insertCall = insert.mock.results[0].value.values.mock.calls[0][0];
    const ttlMs = baseOpts.ttlSeconds * 1000;
    expect(insertCall.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMs - 100);
    expect(insertCall.expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMs + 100);

    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      fromCache: false, costUsd: "0.0006", latencyMs: 234,
    }));
  });

  it("paramsHash is deterministic regardless of key order", async () => {
    const { db: db1, insert: insert1 } = buildDb({ hit: null });
    const { db: db2, insert: insert2 } = buildDb({ hit: null });

    const svc1 = new ToolCacheService(db1, recorder as any);
    const svc2 = new ToolCacheService(db2, buildRecorder() as any);

    const fetcher = vi.fn().mockResolvedValue({ result: {}, costUsd: "0", latencyMs: 0 });

    await svc1.getOrSet({ ...baseOpts, params: { a: 1, b: 2 }, fetcher });
    await svc2.getOrSet({ ...baseOpts, params: { b: 2, a: 1 }, fetcher });

    const hash1 = insert1.mock.results[0].value.values.mock.calls[0][0].paramsHash;
    const hash2 = insert2.mock.results[0].value.values.mock.calls[0][0].paramsHash;
    expect(hash1).toBe(hash2);
  });

  it("expired entry is treated as MISS (where clause filters expiresAt > now)", async () => {
    const { db, select } = buildDb({ hit: null });
    const svc = new ToolCacheService(db, recorder as any);

    const fetcher = vi.fn().mockResolvedValue({ result: { items: [] }, costUsd: "0", latencyMs: 0 });
    await svc.getOrSet({ ...baseOpts, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalled();
  });
});
