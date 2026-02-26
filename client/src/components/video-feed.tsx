import { useState, useEffect } from "react";
import { Camera, CameraOff, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VideoFeed({ className }: { className?: string }) {
  const [active, setActive]   = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync with backend status on mount
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
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch("/api/camera/stop", { method: "POST" });
      setActive(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("relative bg-black w-full overflow-hidden", className)}>

      {/* Live badge — only when active */}
      {active && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
        </div>
      )}

      {/* Start / Stop button — top right */}
      <div className="absolute top-4 right-4 z-10">
        {active ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStop}
            disabled={loading}
            className="gap-1.5 rounded-full bg-red-600/80 hover:bg-red-600 backdrop-blur-md border border-white/10 text-white shadow-xl text-[11px]"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleStart}
            disabled={loading}
            className="gap-1.5 rounded-full bg-primary/80 hover:bg-primary backdrop-blur-md border border-white/10 text-white shadow-xl text-[11px]"
          >
            <Play className="h-3 w-3 fill-current" />
            {loading ? "Starting..." : "Start Camera"}
          </Button>
        )}
      </div>

      {/* Video or offline state */}
      <div className="aspect-video relative group">
        {active ? (
          <img
            src="/stream/video"
            alt="Surgical Stream"
            className="w-full h-full object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
        ) : (
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
              className="gap-2 mt-2"
            >
              <Camera className="h-4 w-4" />
              {loading ? "Starting..." : "Start Camera"}
            </Button>
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none border-[12px] border-transparent group-hover:border-primary/5 transition-all duration-500" />
      </div>
    </div>
  );
}