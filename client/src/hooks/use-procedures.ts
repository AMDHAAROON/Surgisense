import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useProcedures() {
  return useQuery({
    queryKey: [api.procedures.list.path],
    queryFn: async () => {
      const res = await fetch(api.procedures.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch procedures");
      const json = await res.json();
      return parseWithLogging(api.procedures.list.responses[200], json, "procedures.list");
    },
  });
}

export function useProcedureStages(procedureId?: number | null) {
  return useQuery({
    queryKey: [api.procedures.getStages.path, procedureId ?? "none"],
    enabled: typeof procedureId === "number" && Number.isFinite(procedureId),
    queryFn: async () => {
      const url = buildUrl(api.procedures.getStages.path, { id: procedureId as number });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Failed to fetch stages");
      const json = await res.json();
      return parseWithLogging(api.procedures.getStages.responses[200], json, "procedures.getStages");
    },
  });
}

export function useSaveTestResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: unknown) => {
      const validated = api.tests.saveResult.input.parse(input);
      const res = await fetch(api.tests.saveResult.path, {
        method: api.tests.saveResult.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const err = parseWithLogging(api.tests.saveResult.responses[400], await res.json(), "tests.saveResult.400");
          throw new Error(err.message);
        }
        throw new Error("Failed to save test result");
      }

      const json = await res.json();
      return parseWithLogging(api.tests.saveResult.responses[201], json, "tests.saveResult.201");
    },
    onSuccess: () => {
      // no list endpoint for results; still safe to refresh procedures/stages
      queryClient.invalidateQueries({ queryKey: [api.procedures.list.path] });
    },
  });
}
