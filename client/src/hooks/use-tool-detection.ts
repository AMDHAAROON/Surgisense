import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

const toolSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string(),
  confidence: z.number().optional(),
  status: z.string().optional(),
});

const detectionMessageSchema = z.object({
  fps: z.number().optional(),
  hands: z.number().optional(),
  tools: z.array(toolSchema).default([]),
});

export type DetectionTool = z.infer<typeof toolSchema>;
export type DetectionMessage = z.infer<typeof detectionMessageSchema>;

export type ToolHistoryItem = {
  at: Date;
  fps?: number;
  hands?: number;
  tools: DetectionTool[];
};

function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const res = schema.safeParse(data);
  if (!res.success) {
    console.error("[WS] Invalid detection message:", res.error.format());
    return null;
  }
  return res.data;
}

export function normalizeToolKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

export function useToolDetectionSocket(opts?: { url?: string; historyLimit?: number }) {
  const url = opts?.url ?? "ws://localhost:8000/ws/detection";
  const historyLimit = opts?.historyLimit ?? 140;

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<DetectionMessage | null>(null);
  const [history, setHistory] = useState<ToolHistoryItem[]>([]);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<number | null>(null);

  const toolsSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of last?.tools ?? []) set.add(normalizeToolKey(t.name));
    return set;
  }, [last]);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          setConnected(true);
          reconnectAttempt.current = 0;
        };

        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);

          const attempt = Math.min(reconnectAttempt.current + 1, 8);
          reconnectAttempt.current = attempt;
          const delay = Math.min(12000, 500 * 2 ** attempt);

          if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
          reconnectTimer.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // onclose will handle reconnect
        };

        ws.onmessage = (e) => {
          if (cancelled) return;
          try {
            const raw = JSON.parse(e.data);
            const parsed = safeParse(detectionMessageSchema, raw);
            if (!parsed) return;

            setLast(parsed);
            setHistory((prev) => {
              const next: ToolHistoryItem[] = [
                ...prev,
                { at: new Date(), fps: parsed.fps, hands: parsed.hands, tools: parsed.tools ?? [] },
              ];
              if (next.length > historyLimit) next.splice(0, next.length - historyLimit);
              return next;
            });
          } catch (err) {
            console.error("[WS] Failed to parse JSON:", err);
          }
        };
      } catch (err) {
        console.error("[WS] Failed to connect:", err);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [url, historyLimit]);

  const hasTool = (requiredTool: string) => {
    const key = normalizeToolKey(requiredTool);
    return toolsSet.has(key);
  };

  return { connected, last, history, hasTool };
}
