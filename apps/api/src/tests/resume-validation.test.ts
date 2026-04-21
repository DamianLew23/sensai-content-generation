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
