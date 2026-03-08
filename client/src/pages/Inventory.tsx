import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Camera,
  Upload,
  ScanSearch,
  Save,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Package,
  ArrowRightLeft,
  Layers3,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface InventoryTool {
  name: string;
  confidence: number;
  box: BBox;
}
interface ReconcileResult {
  allPresent: boolean;
  preCount: number;
  postCount: number;
  present: InventoryTool[];
  missing: { name: string }[];
  extra: InventoryTool[];
  summary: string;
}

const toolLabel = (n: string) =>
  n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const confColor = (c: number) =>
  c >= 0.8 ? "#22c55e" : c >= 0.6 ? "#f59e0b" : "#ef4444";

// ─── BBox SVG Overlay ─────────────────────────────────────────────────────────
function BBoxOverlay({
  tools,
  missingNames,
  imgW,
  imgH,
}: {
  tools: InventoryTool[];
  missingNames: string[];
  imgW: number;
  imgH: number;
}) {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${imgW} ${imgH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {tools.map((tool, i) => {
        const { x1, y1, x2, y2 } = tool.box;
        const px = x1 * imgW,
          py = y1 * imgH;
        const pw = (x2 - x1) * imgW,
          ph = (y2 - y1) * imgH;
        const isMissing = missingNames.includes(tool.name);
        const color = isMissing ? "#ef4444" : confColor(tool.confidence);
        const txt = `${toolLabel(tool.name)} ${Math.round(tool.confidence * 100)}%`;
        return (
          <g key={i}>
            <rect
              x={px}
              y={py}
              width={pw}
              height={ph}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              rx={4}
              strokeDasharray={isMissing ? "6 3" : "none"}
            />
            <rect
              x={px}
              y={Math.max(0, py - 22)}
              width={txt.length * 7.5 + 12}
              height={20}
              fill={color}
              rx={3}
            />
            <text
              x={px + 6}
              y={Math.max(14, py - 7)}
              fill="white"
              fontSize={12}
              fontFamily="system-ui, sans-serif"
              fontWeight="bold"
            >
              {txt}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Inventory() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [capturedImg, setCapturedImg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tools, setTools] = useState<InventoryTool[]>([]);
  const [phase, setPhase] = useState<"idle" | "pre" | "post">("idle");
  const [preSaved, setPreSaved] = useState(false);
  const [preSessionId, setPreSessionId] = useState<number | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  const [imgDims, setImgDims] = useState({ w: 640, h: 480 });
  const [status, setStatus] = useState<{
    msg: string;
    type: "ok" | "err" | "warn" | "info";
  } | null>(null);

  const setMsg = (msg: string, type: "ok" | "err" | "warn" | "info" = "info") =>
    setStatus({ msg, type });

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");
      // cameras[0] = built-in laptop webcam, cameras[1] = external
      const deviceId = cameras[1]?.deviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
      });
      streamRef.current = stream;
      setStreaming(true);
      setMsg("Camera ready — position tray then capture.", "info");
    } catch {
      setMsg("Could not access camera.", "err");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  // Attach stream to video element once it mounts after setStreaming(true)
  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [streaming]);

  const captureFrame = useCallback(() => {
    const v = videoRef.current,
      c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const url = c.toDataURL("image/jpeg", 0.9);
    setCapturedImg(url);
    setTools([]);
    setReconcile(null);
    setImgDims({ w: c.width, h: c.height });
    stopCamera();
    setMsg("Frame captured. Click Scan Tools to detect instruments.", "info");
  }, [stopCamera]);

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        setCapturedImg(url);
        setTools([]);
        setReconcile(null);
        const img = new Image();
        img.onload = () =>
          setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = url;
        stopCamera();
        setMsg(
          "Image uploaded. Click Scan Tools to detect instruments.",
          "info",
        );
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [stopCamera],
  );

  // ── Groq scan ──────────────────────────────────────────────────────────────
  const scanImage = useCallback(async () => {
    if (!capturedImg) return;
    setScanning(true);
    setMsg("Sending to Groq Vision… this may take 5–10 seconds.", "info");
    try {
      const res = await fetch("/api/inventory/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: capturedImg }),
      });
      const data = await res.json();
      setTools(data.tools || []);
      setMsg(`Detected ${data.count} tool(s). Review and save.`, "ok");
    } catch {
      setMsg("Scan failed. Check backend is running.", "err");
    } finally {
      setScanning(false);
    }
  }, [capturedImg]);

  // ── Save pre ───────────────────────────────────────────────────────────────
  const savePreSurgery = useCallback(async () => {
    if (!capturedImg || tools.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pre", tools, image: capturedImg }),
      });
      const data = await res.json();
      setPreSessionId(data.id);
      setPreSaved(true);
      setMsg(
        `Pre-surgery inventory saved — ${tools.length} tool(s) recorded.`,
        "ok",
      );
    } catch {
      setMsg("Failed to save inventory.", "err");
    } finally {
      setSaving(false);
    }
  }, [capturedImg, tools]);

  // ── Reconcile ──────────────────────────────────────────────────────────────
  const reconcilePost = useCallback(async () => {
    if (!capturedImg || tools.length === 0) return;
    setSaving(true);
    setMsg("Reconciling with pre-surgery inventory…", "info");
    try {
      await fetch("/api/inventory/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "post", tools, image: capturedImg }),
      });
      const res = await fetch("/api/inventory/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postTools: tools, preSessionId }),
      });
      const data: ReconcileResult = await res.json();
      setReconcile(data);
      setMsg(data.summary, data.allPresent ? "ok" : "warn");
    } catch {
      setMsg("Reconciliation failed.", "err");
    } finally {
      setSaving(false);
    }
  }, [capturedImg, tools, preSessionId]);

  const reset = () => {
    setCapturedImg(null);
    setTools([]);
    setReconcile(null);
    setStatus(null);
    setStreaming(false);
  };

  const missingNames = reconcile?.missing.map((m) => m.name) ?? [];

  const statusColors = {
    ok: "bg-green-500/10 text-green-400 border-green-500/20",
    err: "bg-red-500/10 text-red-400 border-red-500/20",
    warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    info: "bg-primary/10 text-primary border-primary/20",
  };

  return (
    <div className="space-y-10">
      {/* ── Hero heading ── */}
      <section className="relative text-center max-w-3xl mx-auto space-y-7 pt-4">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-primary/10 blur-[100px] rounded-full -z-10" />
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Instrument Reconciliation
        </div>
        <h1 className="text-[30px] sm:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60 leading-[1.1]">
          Surgical <span className="text-primary italic">Inventory</span>
        </h1>
        <p className="hidden sm:block sm:text-lg leading-relaxed text-muted-foreground">
          Photograph the instrument tray before and after surgery. AI detects
          every tool and flags anything missing.
        </p>
      </section>

      {/* ── Phase tabs ── */}
     <div className="flex justify-center px-4">
  <div className="flex w-full max-w-sm sm:w-auto gap-2 p-1 bg-muted/30 rounded-full border border-border/50">
    {(
      [
        ["pre", "Before Surgery", Package],
        ["post", "After Surgery", ArrowRightLeft],
      ] as const
    ).map(([p, label, Icon]) => (
      <button
        key={p}
        onClick={() => { setPhase(p); reset(); }}
        className={cn(
          "relative flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold transition-all rounded-full overflow-hidden",
          phase === p ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {phase === p && (
          <div className={cn(
            "absolute inset-0 shadow-lg z-0",
            p === "pre" ? "bg-primary shadow-primary/30" : "bg-primary shadow-violet-600/30"
          )} />
        )}
        <Icon className="h-4 w-4 relative z-10 shrink-0" />
        <span className="relative z-10">{label}</span>
      </button>
    ))}
  </div>
</div>

      {/* ── Idle state ── */}
      {phase === "idle" && (
        <div className="glass-card rounded-2xl p-16 text-center text-muted-foreground border border-border/30">
          <Layers3 className="h-10 w-10 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Select a phase above to begin</p>
          <p className="text-sm mt-1 opacity-60">
            Capture before surgery to build inventory, then after to reconcile
          </p>
        </div>
      )}

      {/* ── Main grid ── */}
      {phase !== "idle" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left — camera / image panel */}
          <div className="lg:col-span-8 space-y-4">
            <div className="glass-card overflow-hidden rounded-2xl">
              {/* Card header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 p-2 rounded-xl">
                    <ScanSearch className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">
                      {phase === "pre"
                        ? "Pre-Surgery Capture"
                        : "Post-Surgery Capture"}
                    </h2>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                      {phase === "pre"
                        ? "Build Inventory"
                        : "Verify & Reconcile"}
                    </p>
                  </div>
                </div>
                {tools.length > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-400 border-green-500/30 font-bold"
                  >
                    {tools.length} tools detected
                  </Badge>
                )}
              </div>

              {/* Video / image area */}
              <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
                {/* Live webcam */}
                {streaming && (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Captured image + bounding boxes */}
                {!streaming && capturedImg && (
                  <div className="relative w-full h-full">
                    <img
                      src={capturedImg}
                      alt="Tray scan"
                      className="w-full h-full object-contain"
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        setImgDims({ w: el.naturalWidth, h: el.naturalHeight });
                      }}
                    />
                    {tools.length > 0 && (
                      <BBoxOverlay
                        tools={tools}
                        missingNames={missingNames}
                        imgW={imgDims.w}
                        imgH={imgDims.h}
                      />
                    )}
                  </div>
                )}

                {/* Empty placeholder */}
                {!streaming && !capturedImg && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <div className="p-4 rounded-full bg-muted/20">
                      <Camera className="h-10 w-10 opacity-40" />
                    </div>
                    <p className="text-sm">
                      Use webcam or upload a photo below
                    </p>
                  </div>
                )}

                {/* Scanning overlay */}
                {scanning && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                    <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                    <p className="text-white text-sm font-medium">
                      Analysing with Groq Vision…
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="p-5 bg-muted/5 border-t border-white/10 flex flex-wrap gap-3">
                {/* Webcam flow */}
                {!streaming && !capturedImg && (
                  <Button
                    onClick={startCamera}
                    className="gap-2 rounded-full font-bold"
                  >
                    <Camera className="h-4 w-4" /> Start Webcam
                  </Button>
                )}
                {streaming && (
                  <Button
                    onClick={captureFrame}
                    className="gap-2 rounded-full font-bold bg-green-600 hover:bg-green-700"
                  >
                    <Camera className="h-4 w-4" /> Capture Frame
                  </Button>
                )}

                {/* Upload photo */}
                {!streaming && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      className="gap-2 rounded-full font-bold border-2"
                    >
                      <Upload className="h-4 w-4" /> Upload Photo
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </>
                )}

                {/* Scan */}
                {capturedImg && !scanning && tools.length === 0 && (
                  <Button
                    onClick={scanImage}
                    className="gap-2 rounded-full font-bold"
                  >
                    <ScanSearch className="h-4 w-4" /> Scan Tools
                  </Button>
                )}

                {/* Rescan */}
                {capturedImg && tools.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={scanImage}
                    disabled={scanning}
                    className="gap-2 rounded-full font-bold border-2"
                  >
                    <ScanSearch className="h-4 w-4" /> Rescan
                  </Button>
                )}

                {/* Save pre */}
                {capturedImg &&
                  tools.length > 0 &&
                  phase === "pre" &&
                  !preSaved && (
                    <Button
                      onClick={savePreSurgery}
                      disabled={saving}
                      className="gap-2 rounded-full font-bold bg-green-600 hover:bg-green-700"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Saving…" : "Save Pre-Surgery"}
                    </Button>
                  )}

                {/* Reconcile post */}
                {capturedImg &&
                  tools.length > 0 &&
                  phase === "post" &&
                  !reconcile && (
                    <Button
                      onClick={reconcilePost}
                      disabled={saving}
                      className="gap-2 rounded-full font-bold bg-violet-600 hover:bg-violet-700"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {saving ? "Reconciling…" : "Reconcile Now"}
                    </Button>
                  )}

                {/* Retake */}
                {capturedImg && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      reset();
                    }}
                    className="gap-2 rounded-full font-bold ml-auto"
                  >
                    <RotateCcw className="h-4 w-4" /> Retake
                  </Button>
                )}
              </div>
            </div>

            {/* Status bar */}
            {status && (
              <div
                className={cn(
                  "flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium",
                  statusColors[status.type],
                )}
              >
                {status.type === "ok" && (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                {status.type === "err" && (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                {status.type === "warn" && (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                {status.type === "info" && (
                  <ScanSearch className="h-4 w-4 shrink-0" />
                )}
                {status.msg}
              </div>
            )}
          </div>

          {/* Right — results */}
          <div className="lg:col-span-4 space-y-4">
            {/* Detected tools list */}
            {tools.length > 0 && (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-white/10 bg-muted/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/20 p-2 rounded-xl">
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-bold">Detected Tools</h3>
                  </div>
                  <Badge className="bg-primary/20 text-primary border-primary/30 font-black">
                    {tools.length}
                  </Badge>
                </div>
                <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                  {tools.map((t, i) => {
                    const isMissing = missingNames.includes(t.name);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all",
                          isMissing
                            ? "bg-red-500/10 border-red-500/20 text-red-400"
                            : "bg-muted/20 border-border/30 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isMissing ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                          <span className="text-sm font-medium">
                            {toolLabel(t.name)}
                          </span>
                        </div>
                        <span
                          className="text-xs font-black"
                          style={{ color: confColor(t.confidence) }}
                        >
                          {Math.round(t.confidence * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reconciliation result */}
            {reconcile && (
              <div
                className={cn(
                  "glass-card rounded-2xl overflow-hidden border-2",
                  reconcile.allPresent
                    ? "border-green-500/30"
                    : "border-red-500/30",
                )}
              >
                <div
                  className={cn(
                    "p-5 border-b border-white/10 flex items-center gap-3",
                    reconcile.allPresent ? "bg-green-500/10" : "bg-red-500/10",
                  )}
                >
                  {reconcile.allPresent ? (
                    <ShieldCheck className="h-5 w-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  )}
                  <h3
                    className={cn(
                      "font-bold",
                      reconcile.allPresent ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {reconcile.allPresent
                      ? "All Tools Accounted For"
                      : "Missing Tools Found"}
                  </h3>
                </div>

                <div className="p-4 space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Before", reconcile.preCount],
                      ["After", reconcile.postCount],
                    ].map(([label, count]) => (
                      <div
                        key={label as string}
                        className="bg-muted/20 rounded-xl p-3 text-center border border-border/30"
                      >
                        <div className="text-2xl font-black">{count}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Missing */}
                  {reconcile.missing.length > 0 && (
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-red-400 mb-2">
                        Missing ({reconcile.missing.length})
                      </p>
                      {reconcile.missing.map((m, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-1.5"
                        >
                          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          <span className="text-sm text-red-400 font-medium">
                            {toolLabel(m.name)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extra */}
                  {reconcile.extra.length > 0 && (
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-amber-400 mb-2">
                        Extra ({reconcile.extra.length})
                      </p>
                      {reconcile.extra.map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-1.5"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span className="text-sm text-amber-400 font-medium">
                            {toolLabel(t.name)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pre saved nudge */}
            {preSaved && phase === "pre" && (
              <div className="glass-card rounded-2xl p-5 border border-green-500/20 bg-green-500/5">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                  <span className="font-bold text-green-400">
                    Inventory Saved
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Switch to{" "}
                  <strong className="text-foreground">After Surgery</strong> tab
                  when the procedure is complete.
                </p>
              </div>
            )}

            {/* Legend */}
            {tools.length > 0 && (
              <div className="glass-card rounded-2xl p-4 space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                  Legend
                </p>
                {[
                  { color: "#22c55e", label: "High confidence (80%+)" },
                  { color: "#f59e0b", label: "Medium (60–79%)" },
                  { color: "#ef4444", label: "Low confidence / Missing" },
                ].map(({ color, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <div
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ background: color }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden canvas for webcam capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
