import { describe, it, expect } from "vitest";
import { validateRerunRequest, RerunValidationError } from "../runs/rerun-validation";

const baseRun = { id: "run-1", status: "completed" } as any;
const baseStep = { id: "step-1", runId: "run-1", status: "completed" } as any;

describe("validateRerunRequest", () => {
  it("ok when step is completed and run is not cancelled", () => {
    expect(validateRerunRequest({ run: baseRun, step: baseStep }).ok).toBe(true);
  });

  it("ok when step is failed", () => {
    expect(
      validateRerunRequest({
        run: { ...baseRun, status: "failed" },
        step: { ...baseStep, status: "failed" },
      }).ok,
    ).toBe(true);
  });

  it("ok when run is running but step is completed (mid-run retry)", () => {
    expect(
      validateRerunRequest({
        run: { ...baseRun, status: "running" },
        step: baseStep,
      }).ok,
    ).toBe(true);
  });

  it("step_not_rerunnable when step is pending", () => {
    expect(() =>
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "pending" } }),
    ).toThrow(expect.objectContaining({ code: "step_not_rerunnable", httpStatus: 409 }));
  });

  it("step_not_rerunnable when step is running", () => {
    expect(() =>
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "running" } }),
    ).toThrow(expect.objectContaining({ code: "step_not_rerunnable", httpStatus: 409 }));
  });

  it("step_not_rerunnable when step is skipped", () => {
    expect(() =>
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "skipped" } }),
    ).toThrow(expect.objectContaining({ code: "step_not_rerunnable", httpStatus: 409 }));
  });

  it("run_cancelled when run.status is cancelled", () => {
    expect(() =>
      validateRerunRequest({ run: { ...baseRun, status: "cancelled" }, step: baseStep }),
    ).toThrow(expect.objectContaining({ code: "run_cancelled", httpStatus: 409 }));
  });

  it("step_not_in_run when step.runId does not match run.id", () => {
    expect(() =>
      validateRerunRequest({
        run: baseRun,
        step: { ...baseStep, runId: "other-run" },
      }),
    ).toThrow(expect.objectContaining({ code: "step_not_in_run", httpStatus: 404 }));
  });

  it("errors are instances of RerunValidationError", () => {
    try {
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "pending" } });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RerunValidationError);
    }
  });
});
