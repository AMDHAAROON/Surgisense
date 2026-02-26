import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Loader2, ChevronDown } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function SurgiBot() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm SurgiBot 🤖 Your surgical AI assistant. Ask me anything about procedures, tools, or technique.",
    },
  ]);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          system:
            "You are SurgiBot, a concise and clinical surgical AI assistant. " +
            "Help with surgical procedures, tools, technique, and training. " +
            "Keep answers short and precise. Use markdown sparingly.",
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response ?? "Sorry, no response received." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Connection error. Is the backend running?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-300",
          "bg-primary text-primary-foreground hover:scale-110 active:scale-95",
          "shadow-primary/30",
          open && "rotate-12"
        )}
        aria-label="Toggle SurgiBot"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {/* ── Chat panel ── */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[360px] h-[520px]",
          "flex flex-col rounded-3xl overflow-hidden",
          "bg-background/80 backdrop-blur-xl border border-border/60",
          "shadow-2xl shadow-black/20",
          "transition-all duration-300 origin-bottom-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-90 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">SurgiBot</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                Surgical AI Assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1 inline-block animate-pulse" />
              Live
            </Badge>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0 px-4 py-3">
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted/60 text-foreground rounded-tl-sm border border-border/40"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted/60 border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border/50 bg-muted/10">
          <div className="flex gap-2 items-center">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about tools, procedures..."
              className="flex-1 rounded-full bg-background/60 border-border/50 text-sm h-10 px-4"
              disabled={loading}
            />
            <Button
              onClick={send}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2 font-mono">
            Powered by Gemini · Press Enter to send
          </p>
        </div>
      </div>
    </>
  );
}