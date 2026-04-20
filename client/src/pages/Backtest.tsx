import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, PlayCircle, Save, TrendingUp, BarChart2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BacktestMetrics {
  totalReturn: number;
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  finalEquity: number;
}

interface Trade {
  date: string;
  action: "BUY" | "SELL";
  price: number;
  shares: number;
}

interface EquityPoint {
  date: string;
  equity: number;
  position: number;
}

interface BacktestResult {
  ticker: string;
  strategy: string;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
}

interface SavedBacktest {
  id: number;
  name: string;
  tickers: string;
  strategy: string;
  params: string;
  sharpe: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function fmt(v: number, d = 2): string {
  return v.toFixed(d);
}

function fmtK(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

const STRATEGIES = [
  { value: "momentum", label: "Momentum" },
  { value: "mean_reversion", label: "Mean Reversion" },
  { value: "trend", label: "Trend Following" },
  { value: "factor", label: "Multi-Factor" },
];

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-1">
      <p className="text-[10px] font-mono text-zinc-500 tracking-widest">{label}</p>
      <p className={`text-2xl font-mono font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs font-mono text-zinc-600">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Backtest() {
  const qc = useQueryClient();

  // Form state
  const [ticker, setTicker] = useState("SPY");
  const [strategy, setStrategy] = useState("momentum");
  const [initialCapital, setInitialCapital] = useState(100_000);
  const [targetVol, setTargetVol] = useState(15); // as % integer for slider
  const [commission, setCommission] = useState(0.001);
  const [lookback, setLookback] = useState(21);

  // Results
  const [results, setResults] = useState<BacktestResult | null>(null);

  // Save form state
  const [saveName, setSaveName] = useState("");

  // ── Saved backtests query ─────────────────────────────────────────
  const savedQuery = useQuery<SavedBacktest[]>({
    queryKey: ["/api/backtests"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/backtests");
      return res.json();
    },
  });

  // ── Run backtest mutation ─────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backtest/run", {
        ticker: ticker.trim().toUpperCase(),
        strategy,
        params: {
          initialCapital,
          targetVol: targetVol / 100,
          commission,
          lookback,
        },
      });
      return res.json() as Promise<BacktestResult>;
    },
    onSuccess: (data) => {
      setResults(data);
      setSaveName(`${data.ticker} ${STRATEGIES.find(s => s.value === data.strategy)?.label ?? data.strategy} — ${new Date().toLocaleDateString()}`);
    },
  });

  // ── Save backtest mutation ────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!results) return;
      const res = await apiRequest("POST", "/api/backtests", {
        name: saveName || `${results.ticker} ${strategy}`,
        tickers: JSON.stringify([results.ticker]),
        strategy: results.strategy,
        params: JSON.stringify({ initialCapital, targetVol: targetVol / 100, commission, lookback }),
        resultsJson: JSON.stringify(results),
        sharpe: results.metrics.sharpe,
        cagr: results.metrics.cagr,
        maxDrawdown: results.metrics.maxDrawdown,
        createdAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/backtests"] });
    },
  });

  // ── Delete mutation ───────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/backtests/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/backtests"] });
    },
  });

  const metrics = results?.metrics;

  // Prep equity curve: decimate for perf if very long
  const equityCurve = results?.equityCurve ?? [];
  const chartData = equityCurve.map(p => ({
    date: p.date.slice(5), // MM-DD
    equity: +p.equity.toFixed(2),
  }));

  const recentTrades = results?.trades?.slice(-10) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── LEFT: Config Panel (1/3) ───────────────────────────────── */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 space-y-4">

          {/* Config card */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono text-zinc-400 tracking-widest flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-green-500" />
                BACKTEST CONFIG
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Ticker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-zinc-500">TICKER</Label>
                <Input
                  className="font-mono uppercase bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-green-500/60 focus:ring-0"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                  placeholder="SPY"
                />
              </div>

              {/* Strategy */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-zinc-500">STRATEGY</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono focus:ring-0 focus:border-green-500/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                    {STRATEGIES.map(s => (
                      <SelectItem key={s.value} value={s.value} className="font-mono hover:bg-zinc-800 focus:bg-zinc-800">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Initial Capital */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-zinc-500">INITIAL CAPITAL ($)</Label>
                <Input
                  type="number"
                  className="font-mono bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-green-500/60 focus:ring-0"
                  value={initialCapital}
                  onChange={e => setInitialCapital(Number(e.target.value))}
                  min={1000}
                  step={1000}
                />
              </div>

              {/* Target Volatility slider */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs font-mono text-zinc-500">TARGET VOLATILITY</Label>
                  <span className="text-xs font-mono text-green-400">{targetVol}%</span>
                </div>
                <Slider
                  min={5}
                  max={30}
                  step={1}
                  value={[targetVol]}
                  onValueChange={([v]) => setTargetVol(v)}
                  className="[&_[role=slider]]:bg-green-500 [&_[role=slider]]:border-green-500"
                />
                <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                  <span>5%</span><span>30%</span>
                </div>
              </div>

              {/* Commission */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-zinc-500">COMMISSION (per trade)</Label>
                <Input
                  type="number"
                  className="font-mono bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-green-500/60 focus:ring-0"
                  value={commission}
                  onChange={e => setCommission(Number(e.target.value))}
                  min={0}
                  step={0.0001}
                />
              </div>

              {/* Lookback */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-zinc-500">LOOKBACK (days)</Label>
                <Input
                  type="number"
                  className="font-mono bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-green-500/60 focus:ring-0"
                  value={lookback}
                  onChange={e => setLookback(Number(e.target.value))}
                  min={5}
                  max={252}
                />
              </div>

              {/* Run button */}
              <Button
                className="w-full bg-green-600 hover:bg-green-500 text-black font-semibold gap-2"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
              >
                <PlayCircle className="w-4 h-4" />
                {runMutation.isPending ? "Running…" : "Run Backtest"}
              </Button>

              {runMutation.isError && (
                <p className="text-red-400 text-xs font-mono">
                  {(runMutation.error as Error).message}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Saved backtests */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-zinc-400 tracking-widest">SAVED BACKTESTS</CardTitle>
            </CardHeader>
            <CardContent>
              {savedQuery.isPending && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 bg-zinc-800" />)}
                </div>
              )}
              {savedQuery.isError && (
                <p className="text-red-400 text-xs font-mono">{(savedQuery.error as Error).message}</p>
              )}
              {savedQuery.data?.length === 0 && (
                <p className="text-xs font-mono text-zinc-600 text-center py-4">No saved backtests yet.</p>
              )}
              <div className="space-y-2">
                {savedQuery.data?.map(bt => (
                  <div key={bt.id} className="flex items-start justify-between gap-2 bg-zinc-800/50 rounded-lg p-3 group">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-mono text-zinc-200 truncate">{bt.name}</p>
                      <div className="flex gap-3 text-[10px] font-mono">
                        <span className={bt.sharpe && bt.sharpe > 0 ? "text-green-400" : "text-red-400"}>
                          S: {bt.sharpe != null ? fmt(bt.sharpe) : "—"}
                        </span>
                        <span className={bt.cagr && bt.cagr > 0 ? "text-green-400" : "text-red-400"}>
                          CAGR: {bt.cagr != null ? pct(bt.cagr) : "—"}
                        </span>
                        <span className="text-orange-400">
                          DD: {bt.maxDrawdown != null ? pct(bt.maxDrawdown) : "—"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(bt.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors mt-0.5 flex-shrink-0"
                      disabled={deleteMutation.isPending}
                      aria-label="Delete backtest"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Results Panel (2/3) ─────────────────────────────── */}
        <div className="flex-1 space-y-5">

          {/* Placeholder */}
          {!results && !runMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-96 rounded-xl border border-zinc-800 border-dashed bg-zinc-900/30 text-center">
              <TrendingUp className="w-10 h-10 text-zinc-700 mb-4" />
              <p className="font-mono text-zinc-500 text-sm">Configure and run a backtest</p>
              <p className="font-mono text-zinc-700 text-xs mt-1">Results will appear here</p>
            </div>
          )}

          {/* Loading skeleton */}
          {runMutation.isPending && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 bg-zinc-800" />)}
              </div>
              <Skeleton className="h-64 bg-zinc-800" />
            </div>
          )}

          {/* Results */}
          {results && metrics && !runMutation.isPending && (
            <>
              {/* Ticker/strategy header */}
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-xl text-white">{results.ticker}</span>
                <span className="font-mono text-sm text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                  {STRATEGIES.find(s => s.value === results.strategy)?.label ?? results.strategy}
                </span>
                <span className="font-mono text-xs text-zinc-600">
                  Capital: {fmtK(initialCapital)} → {fmtK(metrics.finalEquity)}
                </span>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard
                  label="TOTAL RETURN"
                  value={pct(metrics.totalReturn)}
                  color={metrics.totalReturn >= 0 ? "text-green-400" : "text-red-400"}
                />
                <KpiCard
                  label="CAGR"
                  value={pct(metrics.cagr)}
                  color={metrics.cagr >= 0 ? "text-green-400" : "text-red-400"}
                />
                <KpiCard
                  label="SHARPE"
                  value={fmt(metrics.sharpe)}
                  color={metrics.sharpe > 1 ? "text-green-400" : metrics.sharpe > 0.5 ? "text-emerald-400" : metrics.sharpe < 0 ? "text-red-400" : "text-orange-400"}
                />
                <KpiCard
                  label="MAX DRAWDOWN"
                  value={pct(metrics.maxDrawdown)}
                  color={metrics.maxDrawdown > -0.1 ? "text-orange-300" : metrics.maxDrawdown > -0.2 ? "text-orange-400" : "text-red-400"}
                />
                <KpiCard
                  label="WIN RATE"
                  value={pct(metrics.winRate)}
                  color={metrics.winRate >= 0.55 ? "text-green-400" : metrics.winRate >= 0.45 ? "text-zinc-300" : "text-orange-400"}
                />
                <KpiCard
                  label="TOTAL TRADES"
                  value={String(metrics.totalTrades)}
                  color="text-zinc-200"
                />
              </div>

              {/* Equity Curve */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-zinc-400 tracking-widest">EQUITY CURVE</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
                        tickLine={false}
                        axisLine={{ stroke: "#3f3f46" }}
                        interval={Math.floor(chartData.length / 8)}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }}
                        tickLine={false}
                        axisLine={false}
                        domain={["auto", "auto"]}
                        tickFormatter={v => fmtK(v)}
                        width={64}
                      />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontFamily: "monospace", fontSize: 11 }}
                        labelStyle={{ color: "#a1a1aa" }}
                        itemStyle={{ color: "#22c55e" }}
                        formatter={(v: number) => [fmtK(v), "Equity"]}
                      />
                      <ReferenceLine
                        y={initialCapital}
                        stroke="#71717a"
                        strokeDasharray="4 2"
                        label={{ value: "Initial", fontSize: 9, fill: "#71717a", position: "insideTopLeft", fontFamily: "monospace" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#22c55e"
                        strokeWidth={1.5}
                        fill="url(#equityGradient)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Save Backtest */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Input
                        className="font-mono bg-zinc-800 border-zinc-700 text-zinc-100 text-sm focus:border-green-500/60 focus:ring-0"
                        placeholder="Name this backtest…"
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5 font-mono text-xs"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !saveName.trim()}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saveMutation.isPending ? "Saving…" : "Save Backtest"}
                    </Button>
                  </div>
                  {saveMutation.isSuccess && (
                    <p className="text-green-400 text-xs font-mono mt-2">Saved successfully.</p>
                  )}
                  {saveMutation.isError && (
                    <p className="text-red-400 text-xs font-mono mt-2">{(saveMutation.error as Error).message}</p>
                  )}
                </CardContent>
              </Card>

              {/* Recent Trades */}
              {recentTrades.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-zinc-400 tracking-widest">
                      RECENT TRADES (last {recentTrades.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-xs font-mono text-zinc-500 px-3 py-2">DATE</TableHead>
                            <TableHead className="text-xs font-mono text-zinc-500 px-3 py-2">ACTION</TableHead>
                            <TableHead className="text-xs font-mono text-zinc-500 px-3 py-2">PRICE</TableHead>
                            <TableHead className="text-xs font-mono text-zinc-500 px-3 py-2">SHARES</TableHead>
                            <TableHead className="text-xs font-mono text-zinc-500 px-3 py-2">VALUE</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentTrades.map((trade, i) => (
                            <TableRow
                              key={i}
                              className={`border-zinc-800 transition-colors ${
                                trade.action === "BUY"
                                  ? "bg-green-950/20 hover:bg-green-950/30"
                                  : "bg-red-950/20 hover:bg-red-950/30"
                              }`}
                            >
                              <TableCell className="font-mono text-xs text-zinc-400 px-3 py-2">
                                {trade.date}
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <span
                                  className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded border ${
                                    trade.action === "BUY"
                                      ? "bg-green-500/15 border-green-500/30 text-green-400"
                                      : "bg-red-500/15 border-red-500/30 text-red-400"
                                  }`}
                                >
                                  {trade.action}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-zinc-200 px-3 py-2">
                                ${fmt(trade.price)}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-zinc-200 px-3 py-2">
                                {trade.shares.toLocaleString()}
                              </TableCell>
                              <TableCell className={`font-mono text-xs px-3 py-2 ${trade.action === "BUY" ? "text-green-400" : "text-red-400"}`}>
                                {fmtK(trade.price * trade.shares)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
