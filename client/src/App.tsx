import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Test from "@/pages/Test";
import About from "@/pages/About";
import { ThemeProvider } from "@/components/theme/use-theme";
import { AppShell } from "@/components/app-shell";
import { SurgiBot } from "@/components/surgibot";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/test" component={Test} />
      <Route path="/about" component={About} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AppShell>
            <Router />
          </AppShell>
          <Toaster />
          {/* SurgiBot at root level — floats above everything, always visible */}
          <SurgiBot />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;