import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, CameraOff, Square, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DetectedTool = { name: string; confidence: number; status?: string };

interface VideoFeedProps {
  className?: string;
  onDetection?: (tools: DetectedTool[]) => void;
}

export function VideoFeed({ className, onDetection }: VideoFeedProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fpsRef      = useRef<number[]>([]);
  const lastFrameTs = useRef<number>(0);
  const animRef     = useRef<number | null>(null);

  const [active,        setActive]        = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [detectedTool,  setDetectedTool]  = useState<DetectedTool | null>(null);
  const [fps,           setFps]           = useState(0);
  const [countdown,     setCountdown]     = useState(3);
  const [cameras,       setCameras]       = useState<MediaDeviceInfo[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>("");
  const [showCamMenu,   setShowCamMenu]   = useState(false);

  // ── Enumerate cameras on mount ──────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const cams = devices.filter(d => d.kind === "videoinput");
      setCameras(cams);
      if (cams.length > 0) setSelectedCamId(cams[0].deviceId);
    }).catch(() => {});
  }, []);

  // Re-enumerate after permission granted (labels become available)
  const refreshCameras = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams    = devices.filter(d => d.kind === "videoinput");
    setCameras(cams);
    return cams;
  };

  // ── FPS tracker ─────────────────────────────────────────────────────────────
  const trackFps = useCallback(() => {
    const now = performance.now();
    if (lastFrameTs.current) {
      const delta = now - lastFrameTs.current;
      fpsRef.current.push(1000 / delta);
      if (fpsRef.current.length > 30) fpsRef.current.shift();
      const avg = fpsRef.current.reduce((a, b) => a + b, 0) / fpsRef.current.length;
      setFps(Math.round(avg));
    }
    lastFrameTs.current = now;
    animRef.current = requestAnimationFrame(trackFps);
  }, []);

  // ── Attach stream ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
      animRef.current = requestAnimationFrame(trackFps);
    }
  }, [active, trackFps]);

  // ── Countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    setCountdown(3);
    const tick = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 3 : prev - 1);
    }, 1000);
    return () => clearInterval(tick);
  }, [active]);

  // ── Send frame every 3s ─────────────────────────────────────────────────────
  const sendFrame = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    try {
      const res   = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const data  = await res.json();
      const tools: DetectedTool[] = data.tools ?? [];
      setDetectedTool(tools[0] ?? null);
      onDetection?.(tools);
    } catch {}
  }, [onDetection]);

  // ── Start camera ────────────────────────────────────────────────────────────
  const startStream = async (deviceId: string) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animRef.current)     cancelAnimationFrame(animRef.current);
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: 640, height: 480 }
        : { width: 640, height: 480 },
    });
    streamRef.current = stream;
    fpsRef.current    = [];
    setActive(true);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    animRef.current     = requestAnimationFrame(trackFps);
    intervalRef.current = setInterval(sendFrame, 3000);
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const cams = await refreshCameras();
      const id   = selectedCamId || cams[0]?.deviceId || "";
      if (cams.length > 0 && !selectedCamId) setSelectedCamId(cams[0].deviceId);
      await startStream(id);
    } catch {
      alert("Could not access camera.");
    } finally {
      setLoading(false);
    }
  };

  // ── Switch camera while live ─────────────────────────────────────────────
  const handleSwitchCamera = async (deviceId: string) => {
    setSelectedCamId(deviceId);
    setShowCamMenu(false);
    if (active) {
      setLoading(true);
      try { await startStream(deviceId); }
      catch { alert("Could not switch camera."); }
      finally { setLoading(false); }
    }
  };

  const handleStop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (animRef.current)     cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    fpsRef.current    = [];
    setActive(false);
    setDetectedTool(null);
    setFps(0);
    setCountdown(3);
    onDetection?.([]);
  };

  useEffect(() => () => { handleStop(); }, []);

  const selectedCamLabel = cameras.find(c => c.deviceId === selectedCamId)?.label
    || (cameras.length > 0 ? `Camera ${cameras.findIndex(c => c.deviceId === selectedCamId) + 1}` : "Camera");

  const countdownColor =
    countdown === 3 ? "text-green-400" :
    countdown === 2 ? "text-yellow-400" : "text-red-400";

  return (
    <div className={cn("relative bg-black w-full aspect-[4/3] lg:aspect-[16/9] overflow-hidden group", className)}>

      {/* ── Top-left: FPS + Countdown ── */}
      {active && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">FPS</span>
            <span className={cn("text-[11px] font-black tabular-nums",
              fps >= 20 ? "text-green-400" : fps >= 10 ? "text-yellow-400" : "text-red-400"
            )}>{fps}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Next</span>
            <span className={cn("text-[11px] font-black tabular-nums", countdownColor)}>{countdown}s</span>
          </div>
        </div>
      )}

      {/* ── Camera selector — top right when active, bottom when offline ── */}
      {cameras.length > 1 && active && (
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={() => setShowCamMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/80 text-[11px] font-medium shadow-xl hover:bg-black/80 transition-colors"
          >
            <Camera className="h-3 w-3" />
            <span className="max-w-[100px] truncate">{selectedCamLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {showCamMenu && (
            <div className="absolute right-0 mt-1 w-52 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
              {cameras.map((cam, i) => (
                <button
                  key={cam.deviceId}
                  onClick={() => handleSwitchCamera(cam.deviceId)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-[12px] text-white hover:bg-white/10 transition-colors truncate",
                    cam.deviceId === selectedCamId && "bg-primary/20 text-primary font-semibold"
                  )}
                >
                  {cam.label || `Camera ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Detected tool ── */}
      {active && detectedTool && (
        <div className="absolute bottom-14 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-600/80 backdrop-blur-md border border-green-400/30 text-white shadow-xl">
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] font-bold capitalize">
            {detectedTool.name.replace(/_/g, " ")} · {Math.round(detectedTool.confidence * 100)}%
          </span>
        </div>
      )}

      {/* ── No tool ── */}
      {active && !detectedTool && (
        <div className="absolute bottom-14 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/60 shadow-xl">
          <span className="text-[11px] font-medium">No tool detected</span>
        </div>
      )}

      {/* ── Live badge ── */}
      {active && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
        </div>
      )}

      {/* ── Stop button ── */}
      {active && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <Button size="sm" variant="destructive" onClick={handleStop} disabled={loading}
            className="gap-1.5 rounded-full bg-red-600/80 hover:bg-red-600 backdrop-blur-md border border-white/10 text-white shadow-xl text-[11px] lg:text-sm lg:px-5 lg:h-9">
            <Square className="h-3 w-3 fill-current" /> Stop
          </Button>
        </div>
      )}

      {/* ── Live video ── */}
      {active && (
        <video ref={videoRef} autoPlay muted playsInline
          className="absolute inset-0 w-full h-full object-contain" />
      )}

      {/* ── Offline state ── */}
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/10 text-muted-foreground gap-4">
          <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center">
            <CameraOff className="h-8 w-8 opacity-40" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold">Camera is off</p>
            <p className="text-xs opacity-60">Press Start Camera to begin detection</p>
          </div>

          {/* Camera selector when offline */}
          {cameras.length > 1 && (
            <div className="flex flex-col items-center gap-2 w-48">
              <p className="text-xs opacity-60 uppercase tracking-wider font-semibold">Select Camera</p>
              <select
                value={selectedCamId}
                onChange={e => setSelectedCamId(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-black/40 text-white text-xs px-3 py-2 backdrop-blur-md focus:outline-none focus:border-primary"
              >
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button onClick={handleStart} disabled={loading} className="gap-2 mt-2 border border-emerald-400">
            <Camera className="h-4 w-4" />
            {loading ? "Starting..." : "Start Camera"}
          </Button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 pointer-events-none border-[12px] border-transparent group-hover:border-primary/5 transition-all duration-500" />
    </div>
  );
}