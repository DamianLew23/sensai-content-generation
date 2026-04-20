import { describe, it, expect } from "vitest";
import { stableStringify } from "../tools/stable-stringify";

describe("stableStringify", () => {
  it("orders object keys alphabetically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ z: 1, a: 1 })).toBe('{"a":1,"z":1}');
  });

  it("produces equal output for equivalent objects with different key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("recurses into nested objects", () => {
    const a = stableStringify({ outer: { b: 2, a: 1 } });
    const b = stableStringify({ outer: { a: 1, b: 2 } });
    expect(a).toBe(b);
    expect(a).toBe('{"outer":{"a":1,"b":2}}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("handles primitives", () => {
    expect(stableStringify("hello")).toBe('"hello"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(true)).toBe("true");
  });
});
