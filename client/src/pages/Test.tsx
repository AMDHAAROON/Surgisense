import { useState } from "react";
import { useProcedures, useProcedureStages } from "@/hooks/use-procedures";
import { useToolDetectionSocket } from "@/hooks/use-tool-detection";
import { VideoFeed } from "@/components/video-feed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { TestSummaryDialog } from "@/components/test/test-summary-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Test() {
  const { data: procedures = [] } = useProcedures();
  const [selectedProcId, setSelectedProcId] = useState<number | null>(null);
  const { data: stages = [] } = useProcedureStages(selectedProcId ?? 0);
  const { last } = useToolDetectionSocket({ historyLimit: 10 });
  const { toast } = useToast();

  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [testStarted, setTestStarted] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentStage  = stages[currentStageIdx];
  const detectedTools = last?.tools || [];
  const isToolDetected = currentStage &&
    detectedTools.some(t => t.name === currentStage.requiredTool);

  if (isToolDetected && testStarted && !completedStages.includes(currentStage.id)) {
    setCompletedStages(prev => [...prev, currentStage.id]);
    if (currentStageIdx < stages.length - 1) {
      setCurrentStageIdx(prev => prev + 1);
    }
  }

  const marks    = stages.length > 0
    ? Math.round((completedStages.length / stages.length) * 100)
    : 0;
  const progress = stages.length > 0
    ? (completedStages.length / stages.length) * 100
    : 0;

  const handleStart = (id: number) => {
    setSelectedProcId(id);
    setTestStarted(true);
    setCurrentStageIdx(0);
    setCompletedStages([]);
  };

  // "End & Finalize" just opens the summary dialog — no save yet
  const handleFinish = () => setShowSummary(true);

  // "Save Result" inside the dialog POSTs to API then resets
  const handleSave = async () => {
    if (!selectedProcId) return;
    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/tests/results", {
        procedureId: selectedProcId,
        marks,
        totalStages: stages.length,
      });
      toast({ title: "Result saved!" });
      handleReset();
    } catch {
      toast({ title: "Error saving results", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // "Start New Test" inside the dialog resets everything
  const handleReset = () => {
    setShowSummary(false);
    setTestStarted(false);
    setSelectedProcId(null);
    setCurrentStageIdx(0);
    setCompletedStages([]);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {!testStarted ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Select a Procedure</h1>
            <p className="text-muted-foreground">Choose a surgical workflow to begin your validation test.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {procedures.map((proc) => (
              <Card key={proc.id} className="group hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader>
                  <CardTitle>{proc.name}</CardTitle>
                  <CardDescription>{proc.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => handleStart(proc.id)} className="w-full gap-2">
                    <Play className="h-4 w-4 fill-current" /> Start Test
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
          <div className="lg:col-span-8 space-y-6">
            <Card className="overflow-hidden border-none shadow-xl">
              <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between py-4">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Live Procedure Stream
                  </CardTitle>
                </div>
                <Badge variant="outline" className="font-mono">FPS: {last?.fps || 0}</Badge>
              </CardHeader>
              <CardContent className="p-0 bg-black aspect-video flex items-center justify-center">
                <VideoFeed />
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <CardDescription>Overall Progress</CardDescription>
                    <CardTitle className="text-2xl">{Math.round(progress)}% Complete</CardTitle>
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    {completedStages.length} of {stages.length} Stages
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={progress} className="h-3" />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card className="border-none shadow-md h-full flex flex-col">
              <CardHeader className="border-b bg-muted/10">
                <CardTitle>Current Objective</CardTitle>
                <CardDescription>Follow the surgical protocol</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-6 space-y-8">
                {currentStage ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Badge className="mb-2">Stage {currentStageIdx + 1}</Badge>
                      <h3 className="text-2xl font-bold">{currentStage.name}</h3>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <AlertCircle className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          Required:{" "}
                          <span className="capitalize">
                            {currentStage.requiredTool.replace(/_/g, " ")}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Detection Status
                      </p>
                      {isToolDetected ? (
                        <div className="flex items-center gap-3 text-green-600 bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-900/30">
                          <CheckCircle2 className="h-6 w-6 shrink-0" />
                          <p className="font-bold">Tool Identified</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-muted-foreground bg-muted/20 p-4 rounded-xl border border-dashed border-muted">
                          <div className="h-6 w-6 rounded-full border-2 border-muted border-t-primary animate-spin" />
                          <p className="font-medium italic">Waiting for tool...</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-bold">All Stages Verified</h3>
                    <p className="text-muted-foreground">
                      The procedure has been successfully completed according to protocol.
                    </p>
                  </div>
                )}
              </CardContent>
              <div className="p-6 border-t bg-muted/5 space-y-3">
                <Button
                  onClick={handleFinish}
                  className="w-full h-12 text-lg shadow-lg shadow-primary/20"
                >
                  End &amp; Finalize Test
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setTestStarted(false)}
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4 mr-2" /> Select Different Procedure
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      <TestSummaryDialog
        open={showSummary}
        onOpenChange={setShowSummary}
        marks={marks}
        completedStages={completedStages.length}
        totalStages={stages.length}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={handleReset}
      />
    </div>
  );
}