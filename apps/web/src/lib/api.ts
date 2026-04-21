import type { StartRunDto } from "@sensai/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL!;
const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN!;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  config: unknown;
  createdAt: string;
}
export interface Template {
  id: string;
  name: string;
  version: number;
  stepsDef: { steps: Array<{ key: string; type: string; auto: boolean }> };
  createdAt: string;
}
export interface Step {
  id: string;
  runId: string;
  stepKey: string;
  stepOrder: number;
  type: string;
  status: string;
  requiresApproval: boolean;
  input: unknown;
  output: unknown;
  error: unknown;
  retryCount: number;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface Run {
  id: string;
  projectId: string;
  templateId: string;
  input: unknown;
  status: string;
  currentStepOrder: number;
  createdAt: string;
  finishedAt: string | null;
  steps?: Step[];
}

export const api = {
  projects: {
    list: () => apiFetch<Project[]>("/projects"),
  },
  templates: {
    list: () => apiFetch<Template[]>("/templates"),
  },
  runs: {
    list: () => apiFetch<Run[]>("/runs"),
    get: (id: string) => apiFetch<Run & { steps: Step[] }>(`/runs/${id}`),
    start: (dto: StartRunDto) =>
      apiFetch<Run & { steps: Step[] }>("/runs", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    resume: (runId: string, stepId: string, dto: { input: { urls: string[] } }) =>
      apiFetch<Run & { steps: Step[] }>(`/runs/${runId}/steps/${stepId}/resume`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
  },
};
