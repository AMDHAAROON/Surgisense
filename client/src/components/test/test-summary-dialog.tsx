import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Percent, Save } from "lucide-react";

export function TestSummaryDialog({
  open,
  onOpenChange,
  marks,
  completedStages,
  totalStages,
  isSaving,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  marks: number;
  completedStages: number;
  totalStages: number;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const grade = useMemo(() => {
    if (marks >= 90) return { label: "Excellent", tone: "secondary" as const };
    if (marks >= 75) return { label: "Strong", tone: "secondary" as const };
    if (marks >= 60) return { label: "Pass", tone: "outline" as const };
    return { label: "Needs review", tone: "outline" as const };
  }, [marks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/70 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Test Summary</DialogTitle>
          <DialogDescription>
            Review your performance and save the result to the system.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="rounded-2xl border bg-background/25 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-background/30">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Marks</p>
                  <p className="text-3xl font-bold">{marks}%</p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge variant={grade.tone} className="mono">
                  {grade.label}
                </Badge>
                <Badge variant="outline" className="mono">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {completedStages}/{totalStages} stages
                  </span>
                </Badge>
              </div>
            </div>

            <div className="mt-4 h-2 rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, marks))}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onReset} disabled={isSaving}>
              Start New Test
            </Button>
            <Button onClick={onSave} disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? "Saving…" : "Save Result"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
