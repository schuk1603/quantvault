import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area, BarChart, Bar
} from "recharts";
import {
  TrendingUp, TrendingDown, Activity, Search, Plus, BookOpen,
  AlertCircle, Star, Target, Clock, ChevronLeft
} from "lucide-react";
import type { WatchlistItem, InsertWatchlistItem, InsertThesis } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : n.toFixed(dec);
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtLarge = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
};

function alphaLabel(v: number): { label: string; cls: string } {
  if (v >= 0.3) return { label: "STRONG BUY", cls: "signal-strong-buy" };
  if (v >= 0.1) return { label: "BUY", cls: "signal-buy" };
  if (v > -0.1) return { label: "NEUTRAL", cls: "signal-neutral" };
  if (v > -0.3) return { label: "SELL", cls: "signal-sell" };
  return { label: "STRONG SELL", cls: "signal-strong-sell" };
}

function StatCard({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean | null }) {
  return (
    <div className="bg-card border border-border rounded-md p-3">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-base font-bold font-mono ${up === true ? "text-green-400" : up === false ? "text-red-400" : "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs space-y-0.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold text-foreground">${payload[0]?.value?.toFixed(2)}</p>
      {payload[1] && (
        <p className="text-muted-foreground">Vol: {(payload[1]?.value / 1e6).toFixed(1)}M</p>
      )}
    </div>
  );
}

// ── Ticker search bar ─────────────────────────────────────────────────────────
function TickerSearch({ current }: { current: string }) {
  const [, setLocation] = useLocation();
  const [val, setVal] = useState(current);

  const go = () => {
    const t = val.trim().toUpperCase();
    if (t) setLocation(`/company/${t}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={val}
        onChange={e => setVal(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === "Enter" && go()}
        placeholder="AAPL"
        className="font-mono uppercase w-28 h-8 text-sm"
        data-testid="input-company-ticker"
      />
      <Button size="sm" onClick={go} className="h-8 bg-primary text-primary-foreground" data-testid="btn-company-go">
        <Search className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ── Add Thesis Dialog ─────────────────────────────────────────────────────────
function AddThesisDialog({ ticker, companyName }: { ticker: string; companyName: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<InsertThesis>>({
    ticker, companyName,
    direction: "long",
    conviction: 3,
    thesis: "",
    catalysts: "[]",
    risks: "[]",
    timeHorizon: "12M",
    status: "active",
  });

  const mut = useMutation({
    mutationFn: (data: InsertThesis) => apiRequest("POST", "/api/theses", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/theses"] });
      setOpen(false);
      toast({ title: "Thesis created" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" data-testid="btn-add-thesis">
          <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Add Thesis
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Thesis — {ticker}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
              <Select value={form.direction || "long"} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Conviction (1–5)</label>
              <Select value={String(form.conviction || 3)} onValueChange={v => setForm(f => ({ ...f, conviction: Number(v) }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Time Horizon</label>
            <Select value={form.timeHorizon || "12M"} onValueChange={v => setForm(f => ({ ...f, timeHorizon: v }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1M">1 Month</SelectItem>
                <SelectItem value="3M">3 Months</SelectItem>
                <SelectItem value="6M">6 Months</SelectItem>
                <SelectItem value="12M">12 Months</SelectItem>
                <SelectItem value="24M">2 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Thesis</label>
            <Textarea
              rows={4}
              value={form.thesis || ""}
              onChange={e => setForm(f => ({ ...f, thesis: e.target.value }))}
              placeholder="Why is this a compelling opportunity?"
              data-testid="input-thesis-body"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Target Price (optional)</label>
            <Input
              type="number"
              value={form.targetPrice ?? ""}
              onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
              placeholder="200.00"
              data-testid="input-thesis-target"
            />
          </div>
          <Button
            className="w-full bg-primary text-primary-foreground"
            disabled={!form.thesis || mut.isPending}
            onClick={() => {
              const now = new Date().toISOString();
              mut.mutate({
                ...form as InsertThesis,
                createdAt: now,
                updatedAt: now,
                catalysts: form.catalysts || "[]",
                risks: form.risks || "[]",
              });
            }}
            data-testid="btn-submit-thesis"
          >
            {mut.isPending ? "Saving…" : "Save Thesis"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add to Watchlist Button ───────────────────────────────────────────────────
function WatchlistBtn({ ticker, companyName }: { ticker: string; companyName: string }) {
  const { toast } = useToast();
  const { data: wl = [] } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
    queryFn: () => apiRequest("GET", "/api/watchlist").then(r => r.json()),
  });
  const inWatchlist = wl.some(w => w.ticker === ticker);

  const addMut = useMutation({
    mutationFn: (d: InsertWatchlistItem) => apiRequest("POST", "/api/watchlist", d).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: `${ticker} added to watchlist` });
    },
  });
  const removeMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/watchlist/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: `${ticker} removed from watchlist` });
    },
  });

  if (inWatchlist) {
    const item = wl.find(w => w.ticker === ticker)!;
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-green-500/30 text-green-400"
        onClick={() => removeMut.mutate(item.id)}
        data-testid="btn-watchlist-remove"
      >
        <Star className="w-3.5 h-3.5 mr-1.5 fill-green-400" /> Watching
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8"
      disabled={addMut.isPending}
      onClick={() => addMut.mutate({
        ticker,
        companyName: companyName || ticker,
        addedAt: new Date().toISOString(),
      })}
      data-testid="btn-watchlist-add"
    >
      <Star className="w-3.5 h-3.5 mr-1.5" /> Watch
    </Button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CompanyPage() {
  const params = useParams<{ ticker: string }>();
  const [, setLocation] = useLocation();
  const rawTicker = params.ticker || "AAPL";
  const ticker = rawTicker.toUpperCase();
  const [tab, setTab] = useState("overview");

  // Market + signal data
  const { data: quote, isLoading: quoteLoading } = useQuery<any>({
    queryKey: ["/api/market/quote", ticker],
    queryFn: () => apiRequest("GET", `/api/market/quote/${ticker}`).then(r => r.json()),
    enabled: !!ticker,
    staleTime: 60_000,
  });

  const { data: signal, isLoading: signalLoading } = useQuery<any>({
    queryKey: ["/api/signals", ticker],
    queryFn: () => apiRequest("GET", `/api/signals/${ticker}`).then(r => r.json()),
    enabled: !!ticker,
    staleTime: 60_000,
  });

  // Price history for chart
  const history: any[] = quote?.history || [];
  const chartData = history.slice(-252).map((d: any) => ({
    date: d.date?.slice(0, 10),
    price: d.close,
    volume: d.volume,
  }));

  // Volume chart data (last 60 days)
  const volData = chartData.slice(-60).map(d => ({
    date: d.date,
    volume: d.volume,
  }));

  // 52-week stats
  const prices = history.map((d: any) => d.close).filter(Boolean);
  const high52 = prices.length ? Math.max(...prices) : null;
  const low52 = prices.length ? Math.min(...prices) : null;
  const currentPrice = quote?.price ?? null;
  const change1d = quote?.change ?? null;
  const changePct1d = quote?.changePct ?? null;
  const up = changePct1d != null ? changePct1d >= 0 : null;

  // Signal composite
  const alpha = signal?.composite ?? null;
  const sig = alpha != null ? alphaLabel(alpha) : null;
  const regime = signal?.regime ?? "—";

  const companyName = quote?.companyName || ticker;

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/watchlist")}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-back"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              {quoteLoading ? (
                <Skeleton className="h-6 w-40" />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {ticker}
                  </h1>
                  <span className="text-sm text-muted-foreground">{companyName}</span>
                  {sig && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${sig.cls}`}>
                      {sig.label}
                    </span>
                  )}
                </div>
              )}
              {!quoteLoading && currentPrice != null && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-2xl font-bold font-mono">${currentPrice.toFixed(2)}</span>
                  <span className={`text-sm font-mono ${up ? "text-green-400" : "text-red-400"}`}>
                    {up ? "+" : ""}{change1d?.toFixed(2)} ({up ? "+" : ""}{fmtPct(changePct1d)})
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TickerSearch current={ticker} />
            {!quoteLoading && <WatchlistBtn ticker={ticker} companyName={companyName} />}
            {!quoteLoading && <AddThesisDialog ticker={ticker} companyName={companyName} />}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setLocation(`/signals/${ticker}`)}
              data-testid="btn-view-signals"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Signals
            </Button>
          </div>
        </div>
      </header>

      {/* ── Stats bar ── */}
      {!quoteLoading && (
        <div className="px-6 py-3 border-b border-border bg-card/50 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <StatCard label="Market Cap" value={fmtLarge(quote?.marketCap)} />
            <StatCard label="52W High" value={high52 ? `$${high52.toFixed(2)}` : "—"} />
            <StatCard label="52W Low" value={low52 ? `$${low52.toFixed(2)}` : "—"} />
            <StatCard label="Avg Volume" value={
              quote?.avgVolume ? `${(quote.avgVolume / 1e6).toFixed(1)}M` : "—"
            } />
            <StatCard label="RSI (14)" value={fmt(signal?.rsi)} up={signal?.rsi != null ? signal.rsi > 50 : null} />
            <StatCard label="Sharpe" value={fmt(signal?.sharpe)} up={signal?.sharpe != null ? signal.sharpe > 0.5 : null} />
            <StatCard label="Regime"
              value={regime === "bull" ? "● Bull" : regime === "bear" ? "● Bear" : "● Sideways"}
              up={regime === "bull" ? true : regime === "bear" ? false : null}
            />
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex-1 p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 bg-card border border-border">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="signals" data-testid="tab-signals">Signal Detail</TabsTrigger>
            <TabsTrigger value="volume" data-testid="tab-volume">Volume</TabsTrigger>
          </TabsList>

          {/* ── Overview tab: price chart + key metrics ── */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-normal">1-Year Price</CardTitle>
              </CardHeader>
              <CardContent>
                {quoteLoading ? (
                  <Skeleton className="h-52 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" /> No price data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(152 69% 45%)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(152 69% 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={d => d?.slice(5)} interval={Math.floor(chartData.length / 6)} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={v => `$${v.toFixed(0)}`} domain={["auto", "auto"]} />
                      <Tooltip content={<PriceTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="hsl(152 69% 45%)"
                        strokeWidth={1.5}
                        fill="url(#priceGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Signal scorecard */}
            {signal && !signalLoading && (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground font-normal">Factor Scores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Momentum 12-1M", val: signal.momentum12m },
                      { label: "Momentum 1M", val: signal.momentum1m },
                      { label: "Mean Reversion", val: signal.meanReversion },
                      { label: "Trend", val: signal.trend },
                      { label: "Low Vol", val: signal.lowVol },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-background border border-border rounded-md p-2.5">
                        <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                        <div className="flex items-center gap-1.5">
                          {val != null && val >= 0.1 ? (
                            <TrendingUp className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          ) : val != null && val <= -0.1 ? (
                            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          ) : (
                            <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className={`font-mono text-sm font-bold ${
                            val != null && val >= 0.1 ? "text-green-400" :
                            val != null && val <= -0.1 ? "text-red-400" :
                            "text-muted-foreground"
                          }`}>
                            {val != null ? (val >= 0 ? "+" : "") + val.toFixed(3) : "—"}
                          </span>
                        </div>
                        {/* Mini bar */}
                        <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${val != null && val >= 0 ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, Math.abs((val ?? 0) * 100))}%`, marginLeft: val != null && val < 0 ? "auto" : undefined }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Signal detail tab ── */}
          <TabsContent value="signals" className="space-y-4">
            {signalLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : signal ? (
              <>
                {/* Composite alpha */}
                <Card className="border-border bg-card">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Composite Alpha Score</p>
                        <div className="flex items-center gap-3">
                          <span className="text-3xl font-bold font-mono">
                            {alpha != null ? (alpha >= 0 ? "+" : "") + alpha.toFixed(3) : "—"}
                          </span>
                          {sig && <span className={`text-sm font-bold px-2 py-1 rounded ${sig.cls}`}>{sig.label}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">RSI</p>
                          <p className={`font-mono text-lg font-bold ${
                            signal.rsi > 70 ? "text-red-400" : signal.rsi < 30 ? "text-green-400" : "text-foreground"
                          }`}>{fmt(signal.rsi, 1)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {signal.rsi > 70 ? "Overbought" : signal.rsi < 30 ? "Oversold" : "Neutral"}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Sharpe</p>
                          <p className={`font-mono text-lg font-bold ${signal.sharpe > 0.5 ? "text-green-400" : "text-red-400"}`}>
                            {fmt(signal.sharpe)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">1Y risk-adj</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Max DD</p>
                          <p className="font-mono text-lg font-bold text-red-400">{fmtPct(signal.maxDrawdown)}</p>
                          <p className="text-[10px] text-muted-foreground">1Y peak→trough</p>
                        </div>
                      </div>
                    </div>
                    {/* Alpha bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>STRONG SELL</span><span>NEUTRAL</span><span>STRONG BUY</span>
                      </div>
                      <div className="h-2 bg-gradient-to-r from-red-500 via-muted to-green-500 rounded-full relative">
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-foreground"
                          style={{ left: `${((alpha ?? 0) + 1) / 2 * 100}%`, transform: "translate(-50%, -50%)" }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Factor bar chart */}
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-normal">Factor Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={[
                          { factor: "Mom 12-1", value: signal.momentum12m ?? 0 },
                          { factor: "Mom 1M", value: signal.momentum1m ?? 0 },
                          { factor: "MeanRev", value: signal.meanReversion ?? 0 },
                          { factor: "Trend", value: signal.trend ?? 0 },
                          { factor: "LowVol", value: signal.lowVol ?? 0 },
                        ]}
                        margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="factor" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={[-1, 1]} />
                        <Tooltip
                          formatter={(v: any) => [(Number(v) >= 0 ? "+" : "") + Number(v).toFixed(3)]}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                        />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                        <Bar
                          dataKey="value"
                          radius={[2, 2, 0, 0]}
                          fill="hsl(152 69% 45%)"
                          label={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                No signal data available for {ticker}
              </div>
            )}
          </TabsContent>

          {/* ── Volume tab ── */}
          <TabsContent value="volume">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-normal">60-Day Volume</CardTitle>
              </CardHeader>
              <CardContent>
                {quoteLoading ? (
                  <Skeleton className="h-52 w-full" />
                ) : volData.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={volData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={d => d?.slice(5)} interval={Math.floor(volData.length / 6)} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
                      <Tooltip
                        formatter={(v: any) => [`${(Number(v) / 1e6).toFixed(2)}M shares`]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      />
                      <Bar dataKey="volume" fill="hsl(152 69% 45% / 0.6)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
