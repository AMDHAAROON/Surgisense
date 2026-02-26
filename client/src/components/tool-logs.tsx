import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Filter, Radar, RotateCcw, Wifi, WifiOff, activity } from "lucide-react";
import { normalizeToolKey, type ToolHistoryItem } from "@/hooks/use-tool-detection";

function ToolPill({ name, confidence, status }: { name: string; confidence?: number; status?: string }) {
  const conf = typeof confidence === "number" ? Math.max(0, Math.min(1, confidence)) : null;
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border group hover:border-primary/30 transition-colors">
      <div className="flex flex-col">
        <span className="text-sm font-semibold capitalize">{name.replace(/_/g, ' ')}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{status || 'detected'}</span>
      </div>
      {conf !== null && (
        <Badge variant="secondary" className="font-mono text-[10px]">
          {Math.round(conf * 100)}%
        </Badge>
      )}
    </div>
  );
}

export function ToolLogs({ connected, fps, hands, history, onClear }: { 
  connected: boolean; 
  fps?: number; 
  hands?: number; 
  history: ToolHistoryItem[];
  onClear?: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = history.slice().reverse();
    if (!q) return items;
    return items.filter((h) => h.tools.some((t) => normalizeToolKey(t.name).includes(q)));
  }, [history, query]);

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", connected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-muted")} />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {connected ? "Live Stream" : "Offline"}
            </span>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">FPS: {fps?.toFixed(1) || 0}</Badge>
            <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">HND: {hands || 0}</Badge>
          </div>
        </div>

        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tools..."
            className="pl-8 h-8 text-xs bg-muted/20 border-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
            <Radar className="h-8 w-8 mb-2" />
            <p className="text-xs font-medium">No activity detected</p>
          </div>
        ) : (
          filtered.map((h, i) => (
            <div key={i} className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1">
                <span>{h.at.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span>{h.tools.length} tool{h.tools.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid gap-2">
                {h.tools.map((t, j) => (
                  <ToolPill key={j} name={t.name} confidence={t.confidence} status={t.status} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
