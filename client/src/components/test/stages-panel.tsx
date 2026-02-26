import { useMemo } from "react";
import { Stage } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDashed, Wrench } from "lucide-react";
import { normalizeToolKey } from "@/hooks/use-tool-detection";

function StageRow({
  stage,
  index,
  isCurrent,
  completed,
  detected,
}: {
  stage: Stage;
  index: number;
  isCurrent: boolean;
  completed: boolean;
  detected: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 bg-background/20",
        isCurrent && "soft-ring",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px]">
          <div className="flex items-center gap-2">
            {completed ? (
              <CheckCircle2 className="h-4 w-4 text-[rgb(34,197,94)]" />
            ) : (
              <CircleDashed className="h-4 w-4 text-muted-foreground" />
            )}
            <p className="font-semibold">
              {index + 1}. {stage.name}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground mono">order: {stage.order}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="mono">
            <span className="inline-flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5" />
              {normalizeToolKey(stage.requiredTool)}
            </span>
          </Badge>
          <Badge
            variant={completed ? "secondary" : detected ? "secondary" : "outline"}
            className={cn("mono", detected && !completed && "border-[rgb(34,197,94)]/30")}
          >
            {completed ? "Completed" : detected ? "Detected" : "Waiting"}
          </Badge>
          {isCurrent && !completed && (
            <Badge variant="outline" className="mono">
              Current
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              completed ? "bg-[rgb(34,197,94)]" : detected ? "bg-primary" : "bg-muted-foreground/20",
            )}
            style={{ width: completed ? "100%" : detected ? "70%" : "18%" }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Required tool must appear in the detection stream to advance automatically.
        </p>
      </div>
    </div>
  );
}

export function StagesPanel({
  stages,
  currentIndex,
  completedSet,
  toolDetected,
}: {
  stages: Stage[];
  currentIndex: number;
  completedSet: Set<number>;
  toolDetected: (requiredTool: string) => boolean;
}) {
  const ordered = useMemo(() => stages.slice().sort((a, b) => a.order - b.order), [stages]);

  const completedCount = useMemo(() => ordered.filter((s) => completedSet.has(s.id)).length, [ordered, completedSet]);

  return (
    <Card className="bg-card/60 backdrop-blur shadow-[var(--shadow-md)]">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <p className="text-base font-semibold">Stages</p>
          <p className="text-sm text-muted-foreground">
            Progress updates as required tools are detected in the live feed.
          </p>
        </div>
        <Badge variant="outline" className="mono">
          {completedCount}/{ordered.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {ordered.length === 0 ? (
          <div className="rounded-xl border bg-background/20 p-6 text-center">
            <p className="text-sm font-semibold">No stages</p>
            <p className="mt-1 text-sm text-muted-foreground">Select a procedure to load stages.</p>
          </div>
        ) : (
          ordered.map((s, idx) => {
            const completed = completedSet.has(s.id);
            const isCurrent = idx === currentIndex;
            const detected = toolDetected(s.requiredTool);

            return (
              <StageRow
                key={s.id}
                stage={s}
                index={idx}
                isCurrent={isCurrent}
                completed={completed}
                detected={detected}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
