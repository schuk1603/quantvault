import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : n.toFixed(dec);
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;

function alphaLabel(v: number): { label: string; cls: string } {
  if (v >= 0.3) return { label: "STRONG BUY", cls: "signal-strong-buy" };
  if (v >= 0.1) return { label: "BUY", cls: "signal-buy" };
  if (v > -0.1) return { label: "NEUTRAL", cls: "signal-neutral" };
  if (v > -0.3) return { label: "SELL", cls: "signal-sell" };
  return { label: "STRONG SELL", cls: "signal-strong-sell" };
}
function regimeBadge(r: string) {
  if (r === "bull") return <Badge className="bg-green-500/15 text-green-400 border border-green-500/25">● Bull</Badge>;
  if (r === "bear") return <Badge className="bg-red-500/15 text-red-400 border border-red-500/25">● Bear</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/25">● Sideways</Badge>;
}

const SCREENER_DEFAULT = ["SPY","QQQ","AAPL","MSFT","TSLA","NVDA","META","JPM","GLD","TLT"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex gap-2">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-bold text-foreground">{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Screener Table ────────────────────────────────────────────────
function ScreenerTable({ results, onSelect }: { results: any[]; onSelect: (t: string) => void }) {
  const sorted = [...results].sort((a, b) =>
    (b.signals?.compositeAlpha ?? 0) - (a.signals?.compositeAlpha ?? 0)
  );
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Alpha Screen — {results.length} tickers</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th><th>Price</th><th>Chg%</th>
                <th>Alpha</th><th>Signal</th><th>Momentum</th>
                <th>MeanRev</th><th>Trend</th><th>Regime</th><th>RSI</th><th>Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => {
                const s = r.signals || {};
                const alpha = s.compositeAlpha ?? 0;
                const { label, cls } = alphaLabel(alpha);
                return (
                  <tr key={r.ticker} className="cursor-pointer" onClick={() => onSelect(r.ticker)} data-testid={`screener-row-${r.ticker}`}>
                    <td><span className="ticker text-green-400 hover:underline">{r.ticker}</span></td>
                    <td className="font-mono">${fmt(r.price)}</td>
                    <td className={r.changePct >= 0 ? "text-pos" : "text-neg"}>{fmt(r.changePct, 2)}%</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden relative">
                          <div
                            className="absolute top-0 h-full rounded-full"
                            style={{
                              width: `${Math.abs(alpha) * 50}%`,
                              left: alpha >= 0 ? "50%" : `${50 - Math.abs(alpha) * 50}%`,
                              background: alpha >= 0 ? "#22c55e" : "#ef4444",
                            }}
                          />
                          <div className="absolute top-0 left-1/2 w-px h-full bg-border" />
                        </div>
                        <span className={alpha >= 0 ? "text-pos font-mono" : "text-neg font-mono"}>{fmt(alpha, 3)}</span>
                      </div>
                    </td>
                    <td><span className={`signal-badge ${cls}`}>{label}</span></td>
                    <td className={s.momentum12_1 >= 0 ? "text-pos font-mono" : "text-neg font-mono"}>{fmtPct(s.momentum12_1)}</td>
                    <td className="font-mono text-muted-foreground">{fmt(s.meanRevScore, 2)}</td>
                    <td className={s.trendSignal === 1 ? "text-pos" : "text-neg"}>{s.trendSignal === 1 ? "↑ Golden" : "↓ Death"}</td>
                    <td>{s.regime ? regimeBadge(s.regime) : "—"}</td>
                    <td className={s.rsi > 70 ? "text-neg font-mono" : s.rsi < 30 ? "text-pos font-mono" : "font-mono"}>{fmt(s.rsi, 0)}</td>
                    <td className={s.sharpe >= 1 ? "text-pos font-mono" : "font-mono"}>{fmt(s.sharpe, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function Signals() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("SPY");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<string | null>(null);

  // Screener
  const screenMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/signals/screen", { tickers: SCREENER_DEFAULT }).then(r => r.json()),
  });

  // Single ticker signal
  const { data: tickerData, isLoading: tickerLoading } = useQuery({
    queryKey: ["/api/signals", activeTicker],
    queryFn: () => apiRequest("GET", `/api/signals/${activeTicker}`).then(r => r.json()),
    enabled: !!activeTicker,
  });

  // AI commentary
  const commentaryMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ai/analyze-signal", {
        ticker: activeTicker,
        signals: tickerData?.signals,
      }).then(r => r.json()),
    onSuccess: (d) => setCommentary(d.commentary),
  });

  const handleSearch = () => {
    const t = searchInput.trim().toUpperCase();
    if (t) { setActiveTicker(t); setCommentary(null); }
  };

  const handleSelect = (t: string) => { setActiveTicker(t); setSearchInput(t); setCommentary(null); };

  const s = tickerData?.signals;
  const history: { date: string; close: number }[] = tickerData?.history || [];
  const chartData = history.map(h => ({
    date: h.date.slice(5),
    price: h.close,
    sma20: s?.sma20,
  }));

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Alpha Signals</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Multi-factor signal engine — momentum, mean reversion, trend, regime</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Enter ticker…"
              className="w-36 font-mono uppercase text-sm h-8"
              data-testid="input-ticker-search"
            />
            <Button size="sm" onClick={handleSearch} className="h-8 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="btn-analyze">
              Analyze
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => screenMutation.mutate()}
              disabled={screenMutation.isPending}
              className="h-8 text-xs"
              data-testid="btn-screen-all"
            >
              {screenMutation.isPending ? "Screening…" : "Screen S&P500 Picks"}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6">

        {/* Screener results */}
        {screenMutation.isSuccess && !activeTicker && (
          <ScreenerTable results={screenMutation.data} onSelect={handleSelect} />
        )}
        {screenMutation.isPending && (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        )}

        {/* No ticker selected + no screen → default screener prompt */}
        {!activeTicker && !screenMutation.isSuccess && !screenMutation.isPending && (
          <div className="text-center py-16 space-y-4">
            <div className="text-5xl">📈</div>
            <p className="text-muted-foreground text-sm">Enter a ticker above or run the default screen to get started.</p>
            <Button variant="outline" size="sm" onClick={() => screenMutation.mutate()}>
              Screen Default Tickers
            </Button>
          </div>
        )}

        {/* Single ticker analysis */}
        {activeTicker && (
          <>
            {tickerLoading ? (
              <div className="grid grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : tickerData?.signals ? (
              <>
                {/* Ticker header */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <span className="ticker text-3xl text-green-400">{activeTicker}</span>
                    <span className="text-muted-foreground text-sm ml-3">{tickerData.price ? `$${tickerData.price.toFixed(2)}` : ""}</span>
                    <span className={`ml-2 text-sm font-semibold ${tickerData.change >= 0 ? "text-pos" : "text-neg"}`}>
                      {tickerData.change >= 0 ? "+" : ""}{fmt(tickerData.change, 2)}%
                    </span>
                  </div>
                  {regimeBadge(s.regime)}
                  <span className={`signal-badge text-sm px-3 py-1 ${alphaLabel(s.compositeAlpha).cls}`}>
                    {alphaLabel(s.compositeAlpha).label}
                  </span>
                </div>

                {/* Composite Alpha big display */}
                <Card className="border-border bg-card">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">Composite Alpha</div>
                        <div
                          className="text-4xl font-bold"
                          style={{ fontFamily: "var(--font-display)", color: s.compositeAlpha >= 0 ? "#22c55e" : "#ef4444" }}
                        >
                          {s.compositeAlpha >= 0 ? "+" : ""}{s.compositeAlpha.toFixed(3)}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>-1.0 Strong Sell</span><span>Strong Buy +1.0</span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden relative">
                          <div className="absolute left-1/2 top-0 w-px h-full bg-border z-10" />
                          <div
                            className="absolute top-0 h-full rounded-full transition-all"
                            style={{
                              width: `${Math.abs(s.compositeAlpha) * 50}%`,
                              left: s.compositeAlpha >= 0 ? "50%" : `${50 - Math.abs(s.compositeAlpha) * 50}%`,
                              background: s.compositeAlpha >= 0
                                ? `linear-gradient(90deg, #22c55e, #16a34a)`
                                : `linear-gradient(90deg, #dc2626, #ef4444)`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Signal cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: "Momentum 12-1M", value: fmtPct(s.momentum12_1), good: s.momentum12_1 >= 0 },
                    { label: "Momentum 1M", value: fmtPct(s.momentum1m), good: s.momentum1m >= 0 },
                    { label: "Mean Reversion", value: fmt(s.meanRevScore, 3), good: s.meanRevScore > 0 },
                    { label: "Trend (SMA)", value: s.trendSignal === 1 ? "Golden Cross ↑" : "Death Cross ↓", good: s.trendSignal === 1 },
                    { label: "Vol (Ann.)", value: fmtPct(s.volatility), good: s.volatility < 0.2 },
                  ].map(card => (
                    <div key={card.label} className="kpi-card">
                      <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
                      <div className={`text-base font-bold ${card.good ? "text-pos" : "text-neg"}`}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Technical row */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "RSI (14)", value: fmt(s.rsi, 1), color: s.rsi > 70 ? "#ef4444" : s.rsi < 30 ? "#22c55e" : "#94a3b8" },
                    { label: "Sharpe", value: fmt(s.sharpe, 3), color: s.sharpe >= 1 ? "#22c55e" : "#94a3b8" },
                    { label: "Max Drawdown", value: fmtPct(s.maxDrawdown), color: "#ef4444" },
                    { label: "Low-Vol Score", value: fmt(s.lowVolScore, 4), color: s.lowVolScore > -0.2 ? "#22c55e" : "#ef4444" },
                  ].map(m => (
                    <div key={m.label} className="kpi-card text-center">
                      <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                      <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* SMA levels */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">Moving Averages:</span>
                  {s.sma20 && <Badge className={tickerData.price > s.sma20 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>SMA20: ${s.sma20}</Badge>}
                  {s.sma50 && <Badge className={tickerData.price > s.sma50 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>SMA50: ${s.sma50}</Badge>}
                  {s.sma200 && <Badge className={tickerData.price > s.sma200 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>SMA200: ${s.sma200}</Badge>}
                </div>

                {/* Price chart */}
                {chartData.length > 0 && (
                  <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{activeTicker} — 60-Day Price History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} interval={9} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} domain={["auto", "auto"]} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="price" name="Price" stroke="#22c55e" strokeWidth={2} dot={false} />
                          {s.sma20 && <ReferenceLine y={s.sma20} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: "SMA20", fill: "#f59e0b", fontSize: 10 }} />}
                          {s.sma50 && <ReferenceLine y={s.sma50} stroke="#60a5fa" strokeDasharray="4 3" label={{ value: "SMA50", fill: "#60a5fa", fontSize: 10 }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* AI Commentary */}
                <div className="flex items-start gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => commentaryMutation.mutate()}
                    disabled={commentaryMutation.isPending}
                    data-testid="btn-ai-commentary"
                  >
                    {commentaryMutation.isPending ? "Generating…" : "✦ AI Signal Commentary"}
                  </Button>
                </div>
                {commentary && (
                  <Card className="border-green-500/20 bg-green-500/5">
                    <CardContent className="py-4 text-sm text-foreground leading-relaxed">{commentary}</CardContent>
                  </Card>
                )}

                {/* Back to screener */}
                {screenMutation.isSuccess && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveTicker(null)}>
                    ← Back to Screener
                  </Button>
                )}
              </>
            ) : tickerData?.error ? (
              <div className="text-center py-10 text-red-400 text-sm">Ticker "{activeTicker}" not found or no data available.</div>
            ) : null}
          </>
        )}

        {/* Show screener results below single ticker if available */}
        {activeTicker && screenMutation.isSuccess && (
          <ScreenerTable results={screenMutation.data} onSelect={handleSelect} />
        )}
      </div>
    </div>
  );
}
