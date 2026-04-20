import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  BookOpen,
  Zap,
  BrainCircuit,
  Plus,
  ArrowRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────

interface QuoteData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

interface SignalData {
  ticker: string;
  price: number;
  change: number;
  signals: {
    compositeAlpha: number;
    momentum12_1: number;
    momentum1m: number;
    trendSignal: number;
    rsi: number;
    volatility: number;
    sharpe: number;
    regime: "bull" | "sideways" | "bear";
    recommendation: string;
  } | null;
}

interface WatchlistItem {
  id: number;
  ticker: string;
  companyName: string;
  sector?: string;
  addedAt: string;
  notes?: string;
  targetPrice?: number;
}

interface Thesis {
  id: number;
  ticker: string;
  companyName: string;
  direction: string;
  conviction: number;
  thesis: string;
  status: string;
  targetPrice?: number;
  timeHorizon?: string;
}

// ── Helper components ─────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n?.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function ChangeLabel({ value }: { value: number }) {
  if (value > 0) return <span className="text-pos flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{fmt(value)}%</span>;
  if (value < 0) return <span className="text-neg flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{fmt(value)}%</span>;
  return <span className="text-neu flex items-center gap-0.5"><Minus className="w-3 h-3" />{fmt(value)}%</span>;
}

function RegimeBadge({ regime }: { regime?: string }) {
  if (!regime) return null;
  const map: Record<string, { label: string; cls: string }> = {
    bull: { label: "BULL", cls: "bg-green-500/15 text-green-400 border-green-500/25" },
    sideways: { label: "SIDEWAYS", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
    bear: { label: "BEAR", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  };
  const { label, cls } = map[regime] ?? map.sideways;
  return (
    <span className={cn("signal-badge border", cls)}>{label}</span>
  );
}

function AlphaBar({ value }: { value: number }) {
  const clamped = Math.max(-1, Math.min(1, value));
  const pct = ((clamped + 1) / 2) * 100;
  const positive = clamped >= 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        {/* center mark */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-border/60 z-10" />
        <div
          className={cn("absolute top-0 h-full rounded-full transition-all", positive ? "bg-green-500" : "bg-red-500")}
          style={positive
            ? { left: "50%", width: `${pct - 50}%` }
            : { left: `${pct}%`, width: `${50 - pct}%` }}
        />
      </div>
      <span className={cn("text-[11px] font-mono w-12 text-right", positive ? "text-pos" : "text-neg")}>
        {clamped >= 0 ? "+" : ""}{fmt(clamped, 3)}
      </span>
    </div>
  );
}

function ConvictionStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("w-2.5 h-2.5", i <= value ? "fill-amber-400 text-amber-400" : "text-border")}
        />
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────

function KpiCard({ quote }: { quote: QuoteData }) {
  const pos = quote.changePct >= 0;
  return (
    <div className="kpi-card flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="ticker text-xs text-muted-foreground">{quote.ticker}</span>
        <ChangeLabel value={quote.changePct} />
      </div>
      <div className="kpi-value">${fmt(quote.price)}</div>
      <div className="text-[11px] text-muted-foreground truncate" title={quote.name}>
        {quote.name}
      </div>
      <div className={cn("text-xs font-medium", pos ? "text-pos" : "text-neg")}>
        {pos ? "+" : ""}{fmt(quote.change)} pts
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="kpi-card flex flex-col gap-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

// ── Market Signals Card ───────────────────────────────────────────

function SignalsCard({ data }: { data: SignalData }) {
  const s = data.signals;
  if (!s) return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      Insufficient data to compute signals.
    </div>
  );
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="ticker text-sm font-bold">{data.ticker}</span>
          <RegimeBadge regime={s.regime} />
        </div>
        <span className="text-[11px] text-muted-foreground">{s.recommendation}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[11px]">
        <div>
          <p className="text-muted-foreground mb-0.5">Sharpe</p>
          <p className={cn("font-mono font-bold", s.sharpe >= 0 ? "text-pos" : "text-neg")}>
            {s.sharpe >= 0 ? "+" : ""}{fmt(s.sharpe)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Volatility</p>
          <p className="font-mono font-bold text-foreground">{fmt(s.volatility * 100)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">RSI (14)</p>
          <p className={cn("font-mono font-bold", s.rsi > 70 ? "text-neg" : s.rsi < 30 ? "text-pos" : "text-foreground")}>
            {fmt(s.rsi, 1)}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-muted-foreground">Composite Alpha</span>
        </div>
        <AlphaBar value={s.compositeAlpha} />
      </div>
    </div>
  );
}

// ── Watchlist Row ─────────────────────────────────────────────────

function WatchlistRow({ item, onClick }: { item: WatchlistItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/60 cursor-pointer transition-all group"
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ background: "hsl(152 69% 45% / 0.1)", color: "hsl(152 69% 45%)" }}
        >
          {item.ticker.slice(0, 2)}
        </div>
        <div>
          <p className="ticker text-xs">{item.ticker}</p>
          <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.companyName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.sector && (
          <span className="hidden sm:block text-[10px] text-muted-foreground/60 px-1.5 py-0.5 bg-muted/40 rounded">
            {item.sector}
          </span>
        )}
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
      </div>
    </div>
  );
}

// ── Thesis Card ───────────────────────────────────────────────────

function ThesisCard({ thesis }: { thesis: Thesis }) {
  const isLong = thesis.direction?.toLowerCase() === "long";
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="ticker text-sm font-bold">{thesis.ticker}</span>
          <span
            className={cn(
              "signal-badge border text-[10px]",
              isLong ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-red-500/15 text-red-400 border-red-500/25"
            )}
          >
            {isLong ? "LONG" : "SHORT"}
          </span>
        </div>
        <ConvictionStars value={thesis.conviction} />
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{thesis.companyName}</p>
      <p className="text-[11px] text-foreground/80 line-clamp-2 leading-relaxed">{thesis.thesis}</p>
      {thesis.timeHorizon && (
        <p className="text-[10px] text-muted-foreground/60">{thesis.timeHorizon}</p>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fetch market quotes
  const { data: quotesRaw, isLoading: quotesLoading, error: quotesError } = useQuery({
    queryKey: ["/api/market/quotes"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/market/quotes?tickers=SPY,QQQ,IWM,TLT");
      return res.json() as Promise<QuoteData[]>;
    },
    refetchInterval: 60_000,
  });

  // Fetch SPY signals
  const { data: signalData, isLoading: signalsLoading } = useQuery({
    queryKey: ["/api/signals/SPY"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/signals/SPY");
      return res.json() as Promise<SignalData>;
    },
    refetchInterval: 120_000,
  });

  // Fetch watchlist
  const { data: watchlist, isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  // Fetch theses
  const { data: theses, isLoading: thesesLoading } = useQuery<Thesis[]>({
    queryKey: ["/api/theses"],
  });

  const activeTheses = theses?.filter((t) => t.status === "active").slice(0, 3) ?? [];
  const recentWatchlist = watchlist?.slice(0, 5) ?? [];

  return (
    <div className="min-h-full p-5 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Market Overview
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time quant intelligence</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">{today}</p>
          <div className="flex items-center gap-1.5 justify-end mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-green-500/80">Live</span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quotesLoading
            ? [0, 1, 2, 3].map((i) => <KpiSkeleton key={i} />)
            : quotesError
            ? <p className="col-span-4 text-sm text-destructive">Failed to load market data.</p>
            : (quotesRaw ?? []).map((q) => <KpiCard key={q.ticker} quote={q} />)}
        </div>
      </section>

      {/* Two-column middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Market Signals */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Market Signals
            </h2>
            <span className="text-[10px] text-muted-foreground">SPY</span>
          </div>
          {signalsLoading ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : signalData ? (
            <SignalsCard data={signalData} />
          ) : (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              Signal data unavailable.
            </div>
          )}
        </section>

        {/* Watchlist Snapshot */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Watchlist Snapshot
              </h2>
            </div>
            <button
              onClick={() => navigate("/watchlist")}
              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              View all →
            </button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {watchlistLoading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : recentWatchlist.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-3">Your watchlist is empty</p>
                <button
                  onClick={() => navigate("/watchlist")}
                  className="inline-flex items-center gap-1.5 text-xs text-primary border border-primary/30 px-3 py-1.5 rounded-md hover:bg-primary/10 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Add tickers
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border/50 py-1">
                {recentWatchlist.map((item) => (
                  <WatchlistRow
                    key={item.id}
                    item={item}
                    onClick={() => navigate(`/signals/${item.ticker}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent Theses */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Active Theses
            </h2>
          </div>
          <button
            onClick={() => navigate("/theses")}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            View all →
          </button>
        </div>
        {thesesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : activeTheses.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">No active theses yet</p>
            <button
              onClick={() => navigate("/theses")}
              className="inline-flex items-center gap-1.5 text-xs text-primary border border-primary/30 px-3 py-1.5 rounded-md hover:bg-primary/10 transition-all"
            >
              <Plus className="w-3 h-3" />
              Write a thesis
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {activeTheses.map((t) => (
              <ThesisCard key={t.id} thesis={t} />
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="pb-2">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Actions
          </h2>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => navigate("/signals")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all"
          >
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            Run Screen
          </button>
          <button
            onClick={() => navigate("/theses")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            New Thesis
          </button>
          <button
            onClick={() => navigate("/ai")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            AI Analysis
          </button>
        </div>
      </section>

    </div>
  );
}
