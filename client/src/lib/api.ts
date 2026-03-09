import { z } from "zod";

// ── Schemas (replaces shared/schema.ts inference) ─────────────────────────────
const procedureSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
});

const stageSchema = z.object({
  id: z.number(),
  procedureId: z.number(),
  name: z.string(),
  requiredTool: z.string(),
  order: z.number(),
});

const testResultSchema = z.object({
  id: z.number(),
  procedureId: z.number(),
  marks: z.number(),
  totalStages: z.number(),
  completedAt: z.string(),
});

const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
};

// ── API routes ────────────────────────────────────────────────────────────────
export const api = {
  procedures: {
    list: {
      method: "GET" as const,
      path: "/api/procedures" as const,
      responses: { 200: z.array(procedureSchema) },
    },
    getStages: {
      method: "GET" as const,
      path: "/api/procedures/:id/stages" as const,
      responses: {
        200: z.array(stageSchema),
        404: errorSchemas.notFound,
      },
    },
  },
  contact: {
    create: {
      method: "POST" as const,
      path: "/api/contact" as const,
      input: z.object({
        name: z.string().min(1),
        email: z.string().email(),
        message: z.string().min(1),
      }),
      responses: {
        201: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
  },
  tests: {
    saveResult: {
      method: "POST" as const,
      path: "/api/tests/results" as const,
      input: z.object({
        procedureId: z.number(),
        marks: z.number(),
        totalStages: z.number(),
      }),
      responses: {
        201: testResultSchema,
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}