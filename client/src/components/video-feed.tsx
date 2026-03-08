import { useState, useEffect } from "react";
import { Camera, CameraOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VideoFeed({ className }: { className?: string }) {
  const [active, setActive]   = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/camera/status")
      .then(r => r.json())
      .then(d => setActive(d.active))
      .catch(() => {});
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      await fetch("/api/camera/start", { method: "POST" });
      setActive(true);
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch("/api/camera/stop", { method: "POST" });
      setActive(false);
    } finally { setLoading(false); }
  };

  return (
    // aspect-[4/3] matches the backend's 640×480 stream exactly — no black bars
    <div className={cn("relative bg-black w-full aspect-[4/3] lg:aspect-[16/9] overflow-hidden group", className)}>

      {/* Live badge — top left, only when active */}
      {active && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
        </div>
      )}

      {/* Stop button — top right, only when active */}
      {active && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStop}
            disabled={loading}
            className="gap-1.5 rounded-full bg-red-600/80 hover:bg-red-600 backdrop-blur-md border border-white/10 text-white shadow-xl text-[11px] lg:text-sm lg:px-5 lg:h-9"
          >
            <Square className="h-3 w-3 fill-current" />
            {loading ? "Stopping..." : "Stop"}
          </Button>
        </div>
      )}

      {/* Live stream */}
      {active && (
        <img
          src="/stream/video"
          alt="Surgical Stream"
          className="absolute inset-0 w-full h-full object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}

      {/* Offline state — single Start Camera button, centered */}
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/10 text-muted-foreground gap-4">
          <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center">
            <CameraOff className="h-8 w-8 opacity-40" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold">Camera is off</p>
            <p className="text-xs opacity-60">Press Start Camera to begin detection</p>
          </div>
          <Button
            onClick={handleStart}
            disabled={loading}
            className="gap-2 mt-2 border border-emerald-400"
          >
            <Camera className="h-4 w-4" />
            {loading ? "Starting..." : "Start Camera"}
          </Button>
        </div>
      )}

      {/* Hover glow border */}
      <div className="absolute inset-0 pointer-events-none border-[12px] border-transparent group-hover:border-primary/5 transition-all duration-500" />
    </div>
  );
}