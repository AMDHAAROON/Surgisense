import { VideoFeed } from "@/components/video-feed";
import { ToolLogs } from "@/components/tool-logs";
import { useToolDetectionSocket } from "@/hooks/use-tool-detection";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Eye, Cpu, Layers3, ShieldCheck, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Home() {
  const { connected, last, history } = useToolDetectionSocket({ historyLimit: 100 });

  return (
    <div className="space-y-24">
      <section className="relative pt-20 sm:pt-20 md:pt-16 text-center max-w-4xl mx-auto space-y-6 sm:space-y-8 px-2">
        {/* Glow — scaled down on mobile */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[280px] sm:w-[450px] lg:w-[600px] h-[150px] sm:h-[220px] lg:h-[300px] bg-primary/10 blur-[80px] sm:blur-[120px] rounded-full -z-10" />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] sm:text-xs font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Next-Gen Analysis
        </div>

        {/* Heading — smooth scale across all breakpoints */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60 leading-[1.1] animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
          Precision Visual <br />
          <span className="text-primary text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-glow italic">
            Intelligence
          </span>
        </h1>

        {/* Subtext — smaller on mobile */}
        <p className="text-sm sm:text-base md:text-xl text-muted-foreground max-w-xl sm:max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200 px-2">
          The world's most advanced real-time surgical tool tracking system. Monitor, validate, and excel with sub-millisecond precision.
        </p>

        {/* Buttons — full width on mobile, auto on sm+ */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300 px-4 sm:px-0">
          <Link href="/test" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-10 rounded-full text-base sm:text-lg font-bold gap-3 shadow-2xl shadow-primary/20 hover:scale-105 transition-transform active:scale-95 border border-emerald-400">
              <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-current" /> Start Validation
            </Button>
          </Link>
          <Button variant="outline" size="lg" onClick={() => window.location.reload()}
            className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-10 rounded-full text-base sm:text-lg font-bold bg-background/50 backdrop-blur-sm border-2">
            Refresh System
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 group">
          <div className="glass-card ">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-muted/10 ">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-xl">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                <div >
                  <h2 className="font-bold text-sm sm:text-lg">System Eye</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-normal sm:tracking-wide font-semibold"> Stream Processing</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Processing
              </div>
            </div>
            <VideoFeed />
          </div>
        </div>

        <div className="lg:col-span-4 h-full">
          <div className="glass-card h-full flex flex-col min-h-[500px]">
            <div className="p-6 border-b border-white/10 bg-muted/10">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-xl">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Logic Trace</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Telemetry Buffer</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ToolLogs
                connected={connected}
                fps={last?.fps}
                hands={last?.hands}
                history={history}
              />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-16 py-24">
        <div className="text-center space-y-4">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight">System Capabilities</h2>
          <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { icon: Eye, title: "Optical Flow", desc: "Advanced motion vectors tracking tools with sub-pixel accuracy." },
            { icon: Cpu, title: "Neural Core", desc: "Proprietary models optimized for minimal latency and maximum confidence." },
            { icon: Layers3, title: "Stage Engine", desc: "State-machine validation ensuring procedural protocols are strictly met." },
            { icon: ShieldCheck, title: "Trust", desc: "Hardened security protocols protecting every frame of sensitive telemetry." },
          ].map((item, i) => (
            <div key={i} className="glass-card group p-8 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center transition-all duration-500 group-hover:bg-primary group-hover:rotate-6 group-hover:scale-110">
                <item.icon className="h-8 w-8 text-primary group-hover:text-white transition-colors" />
              </div>
              <div className="space-y-2">
                <h3 className="font-black text-lg sm:text-xl tracking-tight">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}