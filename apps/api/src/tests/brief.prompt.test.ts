import { describe, expect, it } from "vitest";
import { briefPrompt } from "../prompts/brief.prompt";

const project: any = {
  id: "p", name: "click2docs",
  config: {
    toneOfVoice: "konkretny", targetAudience: "firmy SaaS",
    guidelines: "", defaultModels: {}, promptOverrides: {},
    productPitch: "", domain: "", keyTerms: [], antiTerms: [], competitors: [],
  },
};

describe("briefPrompt.system — antiAngles block", () => {
  it("omits antiAngles block when none provided", () => {
    const sys = briefPrompt.system(project);
    expect(sys).not.toMatch(/UNIKAJ.*interpretacji|antiAngle/i);
  });

  it("renders antiAngles as a hard guard when provided", () => {
    const sys = briefPrompt.system(project, ["urządzenia fizyczne", "AGD"]);
    expect(sys).toMatch(/KRYTYCZNE.*UNIKAJ/i);
    expect(sys).toContain("urządzenia fizyczne");
    expect(sys).toContain("AGD");
  });
});
