import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

export function VideoFeed({ className }: { className?: string }) {
  const src = "http://localhost:8000/stream/video";

  return (
    <div className={cn("relative bg-black w-full overflow-hidden", className)}>
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
      </div>
      
      <div className="aspect-video relative group">
        <img
          src={src}
          alt="Surgical Stream"
          className="w-full h-full object-contain"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              const fallback = document.createElement('div');
              fallback.className = 'absolute inset-0 flex flex-col items-center justify-center bg-muted/10 text-muted-foreground p-6 text-center';
              fallback.innerHTML = `
                <div class="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                </div>
                <p class="text-sm font-semibold">Camera Offline</p>
                <p class="text-xs opacity-60 mt-1">Ensure the detector server is running on port 8000</p>
              `;
              parent.appendChild(fallback);
            }
          }}
        />
        <div className="absolute inset-0 pointer-events-none border-[12px] border-transparent group-hover:border-primary/5 transition-all duration-500" />
      </div>
    </div>
  );
}
