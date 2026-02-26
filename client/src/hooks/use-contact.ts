import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";

function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useCreateContactMessage() {
  return useMutation({
    mutationFn: async (input: unknown) => {
      const validated = api.contact.create.input.parse(input);
      const res = await fetch(api.contact.create.path, {
        method: api.contact.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const err = parseWithLogging(api.contact.create.responses[400], await res.json(), "contact.create.400");
          throw new Error(err.message);
        }
        throw new Error("Failed to send message");
      }

      const json = await res.json();
      return parseWithLogging(api.contact.create.responses[201], json, "contact.create.201");
    },
  });
}
