import { PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import { Activity, FlaskConical, Home, Info, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/use-theme";

function NavLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  const [loc] = useLocation();
  const active = loc === href;

  return (
    <Link href={href} className={cn(
      "relative flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all rounded-full overflow-hidden",
      active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
    )}>
      {active && <div className="absolute inset-0 bg-primary shadow-lg shadow-primary/30 z-0" />}
      <Icon className={cn("h-4 w-4 relative z-10", active ? "text-white" : "")} />
      <span className="relative z-10">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex flex-col min-h-screen app-surface">
      <header className="sticky top-6 z-50 w-full max-w-5xl mx-auto px-4">
        <div className="glass rounded-full px-6 h-16 flex items-center justify-between shadow-2xl shadow-primary/5">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 font-black text-2xl tracking-tighter hover:opacity-80 transition-opacity">
              <div className="bg-primary p-1.5 rounded-lg shadow-lg shadow-primary/20 animate-pulse">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                Surgisense
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-2 p-1 bg-muted/30 rounded-full border border-border/50">
              <NavLink href="/" icon={Home} label="Home" />
              <NavLink href="/test" icon={FlaskConical} label="Test" />
              <NavLink href="/about" icon={Info} label="About" />
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggle} className="rounded-full h-10 w-10 hover:bg-muted/50">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Link href="/test">
              <Button size="sm" className="hidden sm:flex rounded-full px-6 font-bold">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-7xl mx-auto py-12 px-6">
        {children}
      </main>

      <footer className="border-t py-12 bg-muted/10">
        <div className="container max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-muted-foreground">
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Activity className="h-5 w-5 text-primary" />
              <span>SurgiTrack AI</span>
            </div>
            <p className="max-w-xs leading-relaxed">
              Advancing surgical education through real-time telemetry and intelligent feedback systems.
            </p>
          </div>
          <div className="flex flex-col md:items-end justify-center gap-4">
            <div className="flex gap-4 font-mono text-[10px] bg-muted/50 px-4 py-2 rounded-full border border-border/50">
              <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-green-500" /> API: Live</span>
              <span className="opacity-30">|</span>
              <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-blue-500" /> WS: Ready</span>
            </div>
            <p>© 2026 SurgiTrack. Built for precision.</p>
          </div>
        </div>
      </footer>

      {/* Floating SurgiBot moved to App.tsx root level */}
    </div>
  );
}