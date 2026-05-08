import { describe, it, expect } from "vitest";
import { validateResumeRequest, ResumeValidationError } from "../runs/resume-validation";

const run = {
  id: "run-1",
  status: "awaiting_approval",
  currentStepOrder: 2,
} as any;

const step = {
  id: "step-2",
  runId: "run-1",
  stepOrder: 2,
  status: "pending",
  requiresApproval: true,
  type: "tool.scrape",
} as any;

const prevStepOutput = {
  items: [
    { title: "T1", url: "https://a.example.com", description: "D1", position: 1 },
    { title: "T2", url: "https://b.example.com", description: "D2", position: 2 },
  ],
};

describe("validateResumeRequest", () => {
  it("returns ok on happy path", () => {
    const res = validateResumeRequest({
      run, step, prevStepOutput,
      dto: { input: { urls: ["https://a.example.com"] } },
    });
    expect(res.ok).toBe(true);
  });

  it("run_not_awaiting when run.status is running", () => {
    expect(() =>
      validateResumeRequest({
        run: { ...run, status: "running" }, step, prevStepOutput,
        dto: { input: { urls: ["https://a.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({
      code: "run_not_awaiting",
      httpStatus: 409,
    } as ResumeValidationError));
  });

  it("step_not_awaiting when step.status is completed", () => {
    expect(() =>
      validateResumeRequest({
        run, step: { ...step, status: "completed" }, prevStepOutput,
        dto: { input: { urls: ["https://a.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({ code: "step_not_awaiting", httpStatus: 409 }));
  });

  it("step_out_of_order when step.stepOrder != run.currentStepOrder", () => {
    expect(() =>
      validateResumeRequest({
        run: { ...run, currentStepOrder: 3 }, step, prevStepOutput,
        dto: { input: { urls: ["https://a.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({ code: "step_out_of_order", httpStatus: 409 }));
  });

  it("urls_not_in_serp when URL not in prev output items", () => {
    expect(() =>
      validateResumeRequest({
        run, step, prevStepOutput,
        dto: { input: { urls: ["https://evil.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({
      code: "urls_not_in_serp",
      httpStatus: 400,
    }));
  });
});

describe("validateResumeRequest — Plan 17 step types (no input validation)", () => {
  const baseRun = { status: "awaiting_approval", currentStepOrder: 1 } as any;
  const baseStep = { status: "pending", requiresApproval: true, stepOrder: 1 } as any;

  for (const stepType of [
    "tool.topic.disambiguate",
    "tool.youcom.research",
    "tool.serp.fetch",
  ]) {
    it(`accepts an empty resume payload for ${stepType}`, () => {
      const res = validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: stepType },
        prevStepOutput: undefined,
        dto: {},
      } as any);
      expect(res.ok).toBe(true);
    });
  }

  it("still rejects scrape resume when URLs are missing from SERP", () => {
    expect(() =>
      validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: "tool.scrape" },
        prevStepOutput: { items: [{ title: "t", url: "https://allowed.com", description: "", position: 1 }] },
        dto: { input: { urls: ["https://NOT-allowed.com"] } },
      } as any),
    ).toThrow();
  });

  it("rejects scrape resume when input is missing entirely", () => {
    expect(() =>
      validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: "tool.scrape" },
        prevStepOutput: { items: [{ title: "t", url: "https://allowed.com", description: "", position: 1 }] },
        dto: {},
      } as any),
    ).toThrow();
  });

  it("rejects unknown step types fail-fast", () => {
    expect(() =>
      validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: "tool.unknown" },
        prevStepOutput: undefined,
        dto: {},
      } as any),
    ).toThrow(/unsupported|unknown/i);
  });
});
