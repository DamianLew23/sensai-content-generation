"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { StartRunDto } from "@sensai/shared";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => api.projects.list() });
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: () => api.templates.list() });
}

export function useRuns() {
  return useQuery({ queryKey: ["runs"], queryFn: () => api.runs.list(), refetchInterval: 3000 });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => api.runs.get(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return 2000;
      return d.status === "completed" || d.status === "failed" || d.status === "cancelled"
        ? false
        : 2000;
    },
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: StartRunDto) => api.runs.start(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}
