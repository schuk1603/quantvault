import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Send,
  Trash2,
  Bot,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  PieChart,
  Lightbulb,
  AlertTriangle,
  Loader2,
  User,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiChat {
  id: number;
  role: "user" | "assistant";
  content: string;
  context?: string | null;
  createdAt: string;
}

interface SignalData {
  ticker: string;
  price: number;
  change: number;
  signals: {
    compositeAlpha: number;
    regime: string;
    momentum12_1: number;
    momentum1m: number;
    meanRevScore: number;
    trendSignal: number;
    volatility: number;
    rsi: number;
    sharpe: number;
    maxDrawdown: number;
  } | null;
}

// ── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What does a negative composite alpha signal mean for TSLA?",
  "Explain HMM regime detection in simple terms",
  "How should I interpret a Sharpe ratio below 1?",
  "What's the difference between VaR and CVaR?",
  "When does mean reversion work better than momentum?",
  "How do I size positions using volatility targeting?",
];

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

// ── Regime badge color ────────────────────────────────────────────────────────

function regimeBadgeClass(regime: string) {
  if (regime === "bull") return "bg-green-500/15 text-green-400 border border-green-500/25";
  if (regime === "bear") return "bg-red-500/15 text-red-400 border border-red-500/25";
  return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
}

function alphaBadgeClass(alpha: number) {
  if (alpha >= 0.3) return "bg-green-500/15 text-green-400 border border-green-500/25";
  if (alpha >= 0.1) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (alpha <= -0.3) return "bg-red-500/15 text-red-400 border border-red-500/25";
  if (alpha <= -0.1) return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
  return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
}

function momentumBadgeClass(mom: number) {
  if (mom > 0.05) return "bg-green-500/15 text-green-400 border border-green-500/25";
  if (mom > 0) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (mom < -0.05) return "bg-red-500/15 text-red-400 border border-red-500/25";
  return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
}

// ── Gemini warning detection ──────────────────────────────────────────────────

function isGeminiWarning(text: string) {
  return text.toLowerCase().includes("gemini api key not configured");
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIAnalyst() {
  const qc = useQueryClient();

  // Chat state
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Signal analysis state
  const [signalTicker, setSignalTicker] = useState("");
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [signalCommentary, setSignalCommentary] = useState<string | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);

  // Portfolio narrative state
  const [portfolioTickers, setPortfolioTickers] = useState("SPY,QQQ,AAPL");
  const [portfolioNarrative, setPortfolioNarrative] = useState<string | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  // Collapsible sections
  const [signalOpen, setSignalOpen] = useState(true);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);

  // ── Fetch chat history ──────────────────────────────────────────────────────

  const { data: chats = [], isLoading: chatsLoading } = useQuery<AiChat[]>({
    queryKey: ["/api/ai/chats"],
  });

  // ── Auto-scroll on new message ──────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats]);

  // ── Send message mutation ───────────────────────────────────────────────────

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/ai/ask", { question });
      return res.json() as Promise<{ answer: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai/chats"] });
    },
  });

  // ── Clear chat mutation ─────────────────────────────────────────────────────

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/ai/chats");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai/chats"] });
    },
  });

  // ── Send handler ────────────────────────────────────────────────────────────

  const handleSend = useCallback(
    (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || askMutation.isPending) return;
      if (!text) setInput("");
      askMutation.mutate(q);
    },
    [input, askMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Suggestion click ────────────────────────────────────────────────────────

  const handleSuggestion = (s: string) => {
    setInput(s);
    handleSend(s);
    textareaRef.current?.focus();
  };

  // ── Signal analysis ─────────────────────────────────────────────────────────

  const handleSignalAnalyze = async () => {
    const ticker = signalTicker.trim().toUpperCase();
    if (!ticker) return;
    setSignalLoading(true);
    setSignalError(null);
    setSignalCommentary(null);
    setSignalData(null);
    try {
      const sigRes = await apiRequest("GET", `/api/signals/${ticker}`);
      const sigData: SignalData = await sigRes.json();
      setSignalData(sigData);
      const aiRes = await apiRequest("POST", "/api/ai/analyze-signal", {
        ticker,
        signals: sigData.signals,
      });
      const aiData = await aiRes.json();
      setSignalCommentary(aiData.commentary);
    } catch (e: any) {
      setSignalError(e.message || "Failed to analyze signal");
    } finally {
      setSignalLoading(false);
    }
  };

  // ── Portfolio narrative ─────────────────────────────────────────────────────

  const handlePortfolioAnalyze = async () => {
    const tickers = portfolioTickers
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length < 2) {
      setPortfolioError("Enter at least 2 tickers separated by commas.");
      return;
    }
    setPortfolioLoading(true);
    setPortfolioError(null);
    setPortfolioNarrative(null);
    try {
      const optRes = await apiRequest("POST", "/api/portfolio/optimize", {
        tickers,
        method: "maxSharpe",
      });
      const optData = await optRes.json();
      const aiRes = await apiRequest("POST", "/api/ai/analyze-portfolio", {
        tickers: optData.tickers,
        metrics: {
          maxSharpe: optData.methods?.maxSharpe,
          assetStats: optData.assetStats,
        },
      });
      const aiData = await aiRes.json();
      setPortfolioNarrative(aiData.analysis);
    } catch (e: any) {
      setPortfolioError(e.message || "Failed to generate portfolio narrative");
    } finally {
      setPortfolioLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Chat ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-[2] border-r border-border min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-none">
                AI Strategist
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Powered by Gemini · Chief Quantitative Strategist
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive gap-1.5 h-7 px-2"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending || chats.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Chat
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          {chatsLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading conversation…
            </div>
          ) : chats.length === 0 && !askMutation.isPending ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                AI Strategist ready
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask the AI Strategist anything about markets, signals, or your
                portfolio.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {chats.map((msg) => {
                const isUser = msg.role === "user";
                const isWarning =
                  !isUser && isGeminiWarning(msg.content);
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {/* Avatar */}
                    {!isUser && (
                      <div className="w-6 h-6 rounded bg-primary/15 border border-primary/30 flex-shrink-0 flex items-center justify-center mb-0.5">
                        <span className="text-[9px] font-bold text-primary">QV</span>
                      </div>
                    )}
                    {isUser && (
                      <div className="w-6 h-6 rounded bg-blue-500/15 border border-blue-500/30 flex-shrink-0 flex items-center justify-center mb-0.5">
                        <User className="w-3 h-3 text-blue-400" />
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={[
                        "max-w-[80%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed",
                        isUser
                          ? "bg-blue-600/25 border border-blue-500/30 text-blue-50 rounded-br-sm"
                          : isWarning
                          ? "bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-bl-sm"
                          : "bg-card border border-border text-foreground rounded-bl-sm",
                      ].join(" ")}
                    >
                      {isWarning && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                            Configuration Required
                          </span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {isWarning && (
                        <p className="mt-1.5 text-[11px] text-amber-400/70">
                          Set{" "}
                          <code className="font-mono bg-amber-500/10 px-1 rounded">
                            GEMINI_API_KEY
                          </code>{" "}
                          in your environment variables to enable AI features.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {askMutation.isPending && (
                <div className="flex items-end gap-2.5">
                  <div className="w-6 h-6 rounded bg-primary/15 border border-primary/30 flex-shrink-0 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-primary">QV</span>
                  </div>
                  <div className="bg-card border border-border rounded-xl rounded-bl-sm px-3.5 py-2.5">
                    <TypingDots />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input row */}
        <div className="px-4 py-3 border-t border-border bg-card/30">
          {askMutation.isError && (
            <p className="text-xs text-red-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {(askMutation.error as Error)?.message ?? "Request failed"}
            </p>
          )}
          <div className="flex items-end gap-2.5">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about markets, signals, or portfolio strategy…"
              rows={2}
              className="flex-1 min-h-[60px] max-h-[140px] resize-none bg-muted border-border text-sm placeholder:text-muted-foreground focus-visible:ring-primary/50 leading-relaxed"
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || askMutation.isPending}
              className="h-[60px] w-12 bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0 p-0"
            >
              {askMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>

      {/* ── Right: Quick Analysis ────────────────────────────────────────────── */}
      <div className="flex flex-col flex-[1] min-w-0 overflow-y-auto scrollbar-thin">
        <div className="px-4 py-3 border-b border-border bg-card/50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Quick Analysis
          </p>
        </div>

        <div className="flex flex-col gap-0 flex-1">
          {/* ── Section 1: Signal Analysis ──────────────────────────────────── */}
          <Collapsible open={signalOpen} onOpenChange={setSignalOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Signal Analysis
                  </span>
                </div>
                {signalOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-3 border-b border-border space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={signalTicker}
                    onChange={(e) => setSignalTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleSignalAnalyze()}
                    placeholder="Ticker (e.g. AAPL)"
                    className="flex-1 h-8 text-xs bg-muted border-border font-mono placeholder:font-sans uppercase"
                    maxLength={10}
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-3 whitespace-nowrap"
                    onClick={handleSignalAnalyze}
                    disabled={!signalTicker.trim() || signalLoading}
                  >
                    {signalLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Analyze"
                    )}
                  </Button>
                </div>

                {signalError && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    {signalError}
                  </p>
                )}

                {signalData?.signals && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`signal-badge text-[10px] ${alphaBadgeClass(signalData.signals.compositeAlpha)}`}
                      >
                        α {signalData.signals.compositeAlpha > 0 ? "+" : ""}
                        {signalData.signals.compositeAlpha.toFixed(2)}
                      </span>
                      <span
                        className={`signal-badge text-[10px] ${regimeBadgeClass(signalData.signals.regime)}`}
                      >
                        {signalData.signals.regime.toUpperCase()}
                      </span>
                      <span
                        className={`signal-badge text-[10px] ${momentumBadgeClass(signalData.signals.momentum12_1)}`}
                      >
                        MOM {signalData.signals.momentum12_1 > 0 ? "+" : ""}
                        {(signalData.signals.momentum12_1 * 100).toFixed(1)}%
                      </span>
                      <span className="signal-badge signal-neutral text-[10px]">
                        RSI {signalData.signals.rsi.toFixed(0)}
                      </span>
                      <span className="signal-badge signal-neutral text-[10px]">
                        σ {(signalData.signals.volatility * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}

                {signalCommentary && (
                  <Card className="bg-muted/40 border-border/60">
                    <CardContent className="p-3">
                      {isGeminiWarning(signalCommentary) ? (
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-300 leading-relaxed">
                            {signalCommentary}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[12px] text-foreground leading-relaxed">
                          {signalCommentary}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ── Section 2: Portfolio Narrative ──────────────────────────────── */}
          <Collapsible open={portfolioOpen} onOpenChange={setPortfolioOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors">
                <div className="flex items-center gap-2">
                  <PieChart className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Portfolio Narrative
                  </span>
                </div>
                {portfolioOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-3 border-b border-border space-y-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">
                    Tickers (comma-separated)
                  </label>
                  <Input
                    value={portfolioTickers}
                    onChange={(e) => setPortfolioTickers(e.target.value.toUpperCase())}
                    placeholder="SPY,QQQ,AAPL"
                    className="h-8 text-xs bg-muted border-border font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Uses Max Sharpe allocation to optimize weights before generating
                  the institutional narrative.
                </p>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handlePortfolioAnalyze}
                  disabled={portfolioLoading}
                >
                  {portfolioLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Generating…
                    </>
                  ) : (
                    "Generate Analysis"
                  )}
                </Button>

                {portfolioError && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    {portfolioError}
                  </p>
                )}

                {portfolioNarrative && (
                  <Card className="bg-muted/40 border-border/60">
                    <CardContent className="p-3">
                      {isGeminiWarning(portfolioNarrative) ? (
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-300 leading-relaxed">
                            {portfolioNarrative}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[12px] text-foreground leading-relaxed">
                          {portfolioNarrative}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ── Section 3: Suggested Questions ──────────────────────────────── */}
          <Collapsible open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Suggested Questions
                  </span>
                </div>
                {suggestionsOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-3 border-b border-border">
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      disabled={askMutation.isPending}
                      className={[
                        "w-full text-left px-3 py-2 rounded-md text-[12px] leading-snug",
                        "bg-accent/50 hover:bg-primary/10 border border-border hover:border-primary/30",
                        "text-muted-foreground hover:text-foreground transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      ].join(" ")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
