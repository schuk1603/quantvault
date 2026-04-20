import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import {
  insertWatchlistItemSchema, insertThesisSchema,
  insertNewsAnnotationSchema, insertAlertSchema, insertSavedBacktestSchema, insertAiChatSchema
} from "@shared/schema";

// ── Yahoo Finance price fetch (free, no API key) ─────────────────
async function fetchPrice(ticker: string): Promise<any> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const timestamps: number[] = result.timestamp || [];
    const closes: number[] = result.indicators?.quote?.[0]?.close || [];
    const volumes: number[] = result.indicators?.quote?.[0]?.volume || [];
    const opens: number[] = result.indicators?.quote?.[0]?.open || [];
    return {
      ticker: ticker.toUpperCase(),
      name: meta.longName || meta.shortName || ticker,
      price: meta.regularMarketPrice,
      prevClose: meta.previousClose || meta.chartPreviousClose,
      change: meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose),
      changePct: ((meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose)) / (meta.previousClose || meta.chartPreviousClose)) * 100,
      volume: meta.regularMarketVolume,
      marketCap: meta.marketCap,
      currency: meta.currency,
      exchange: meta.exchangeName,
      history: timestamps.map((t: number, i: number) => ({
        date: new Date(t * 1000).toISOString().split("T")[0],
        close: closes[i],
        volume: volumes[i],
        open: opens[i],
      })).filter(d => d.close != null),
    };
  } catch {
    return null;
  }
}

// ── Quant signal computation (JS port of QuantCore logic) ────────
function computeSignals(history: { date: string; close: number }[]) {
  if (!history || history.length < 30) return null;
  const prices = history.map(h => h.close);
  const n = prices.length;

  // Momentum: 12-1 month return (252 - 21 days)
  const momentum12_1 = n >= 252
    ? (prices[n - 21] - prices[n - 252]) / prices[n - 252]
    : (prices[n - 1] - prices[0]) / prices[0];

  // Short-term momentum (1 month)
  const momentum1m = n >= 21
    ? (prices[n - 1] - prices[n - 21]) / prices[n - 21]
    : (prices[n - 1] - prices[0]) / prices[0];

  // Mean reversion: current vs 20-day SMA (z-score)
  const window = Math.min(20, n);
  const sma20 = prices.slice(n - window).reduce((a, b) => a + b, 0) / window;
  const std20 = Math.sqrt(prices.slice(n - window).reduce((a, b) => a + (b - sma20) ** 2, 0) / window);
  const meanRevScore = std20 > 0 ? -(prices[n - 1] - sma20) / std20 : 0; // neg = buy on dip

  // Trend: 50-day SMA vs 200-day SMA
  const sma50 = n >= 50 ? prices.slice(n - 50).reduce((a, b) => a + b, 0) / 50 : null;
  const sma200 = n >= 200 ? prices.slice(n - 200).reduce((a, b) => a + b, 0) / 200 : null;
  const trendSignal = sma50 && sma200 ? (sma50 > sma200 ? 1 : -1) : 0;

  // Volatility (annualized)
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const vol = returns.length > 1
    ? Math.sqrt(returns.reduce((a, r) => a + r ** 2, 0) / returns.length) * Math.sqrt(252)
    : 0;

  // Low-vol score (negative vol = positive signal)
  const lowVolScore = -vol;

  // RSI (14-day)
  const rsiPeriod = Math.min(14, returns.length);
  const recentReturns = returns.slice(-rsiPeriod);
  const gains = recentReturns.filter(r => r > 0).reduce((a, b) => a + b, 0) / rsiPeriod;
  const losses = Math.abs(recentReturns.filter(r => r < 0).reduce((a, b) => a + b, 0)) / rsiPeriod;
  const rs = losses > 0 ? gains / losses : 100;
  const rsi = 100 - (100 / (1 + rs));

  // Composite alpha (equal-weighted, normalized to [-1,1])
  const rawComposite = (
    Math.sign(momentum12_1) * Math.min(Math.abs(momentum12_1) * 5, 1) * 0.3 +
    Math.sign(momentum1m) * Math.min(Math.abs(momentum1m) * 10, 1) * 0.2 +
    Math.tanh(meanRevScore * 0.3) * 0.15 +
    trendSignal * 0.25 +
    Math.tanh(lowVolScore * 10) * 0.1
  );

  // Regime detection (simplified 3-state based on recent vol vs historical)
  const recentVol = returns.slice(-21).reduce((a, r) => a + r ** 2, 0) / 21;
  const historicalVol = returns.reduce((a, r) => a + r ** 2, 0) / returns.length;
  const volRatio = historicalVol > 0 ? recentVol / historicalVol : 1;
  const regime = volRatio > 1.5 ? "bear" : volRatio < 0.7 ? "bull" : "sideways";

  // Drawdown
  let peak = -Infinity, maxDD = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  // Sharpe (annualized, rf=0)
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const retStd = Math.sqrt(returns.reduce((a, r) => a + (r - meanReturn) ** 2, 0) / returns.length);
  const sharpe = retStd > 0 ? (meanReturn / retStd) * Math.sqrt(252) : 0;

  return {
    momentum12_1: +momentum12_1.toFixed(4),
    momentum1m: +momentum1m.toFixed(4),
    meanRevScore: +meanRevScore.toFixed(3),
    trendSignal,
    lowVolScore: +lowVolScore.toFixed(4),
    compositeAlpha: +rawComposite.toFixed(3),
    volatility: +vol.toFixed(4),
    rsi: +rsi.toFixed(1),
    regime,
    maxDrawdown: +maxDD.toFixed(4),
    sharpe: +sharpe.toFixed(3),
    sma20: sma20 ? +sma20.toFixed(2) : null,
    sma50: sma50 ? +sma50.toFixed(2) : null,
    sma200: sma200 ? +sma200.toFixed(2) : null,
  };
}

// ── Backtest engine (JS port) ────────────────────────────────────
function runBacktest(history: { date: string; close: number }[], strategy: string, params: any) {
  if (!history || history.length < 60) return null;
  const prices = history.map(h => h.close);
  const dates = history.map(h => h.date);
  const n = prices.length;
  const capital = params.initialCapital || 100000;

  let cash = capital;
  let shares = 0;
  const equityCurve: { date: string; equity: number; position: number }[] = [];
  const trades: { date: string; action: string; price: number; shares: number }[] = [];

  for (let i = 50; i < n; i++) {
    const window = Math.min(50, i);
    const recentPrices = prices.slice(i - window, i);
    const sma = recentPrices.reduce((a, b) => a + b, 0) / window;
    const sma20 = prices.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
    const returns = recentPrices.slice(1).map((p, j) => (p - recentPrices[j]) / recentPrices[j]);
    const vol = Math.sqrt(returns.reduce((a, r) => a + r ** 2, 0) / returns.length) * Math.sqrt(252);

    let signal = 0;
    if (strategy === "momentum") {
      const mom = (prices[i] - prices[i - (params.lookback || 21)]) / prices[i - (params.lookback || 21)];
      signal = mom > 0.02 ? 1 : mom < -0.02 ? -1 : 0;
    } else if (strategy === "mean_reversion") {
      const std = Math.sqrt(recentPrices.reduce((a, p) => a + (p - sma) ** 2, 0) / window);
      const z = std > 0 ? (prices[i] - sma) / std : 0;
      signal = z < -1.5 ? 1 : z > 1.5 ? -1 : 0;
    } else if (strategy === "trend") {
      signal = sma20 > sma ? 1 : -1;
    } else if (strategy === "factor") {
      const mom = (prices[i] - prices[Math.max(0, i - 252)]) / prices[Math.max(0, i - 252)];
      const lowvol = vol < 0.25 ? 1 : 0;
      signal = (mom > 0 ? 1 : -1) * 0.6 + lowvol * 0.4 > 0.3 ? 1 : -1;
    }

    // Position sizing (volatility target)
    const targetVol = params.targetVol || 0.15;
    const sizeFraction = vol > 0 ? Math.min(targetVol / vol, 1) : 0.5;

    const equity = cash + shares * prices[i];
    const targetShares = signal === 1 ? Math.floor((equity * sizeFraction) / prices[i]) : 0;

    if (targetShares !== shares) {
      const cost = Math.abs(targetShares - shares) * prices[i] * (params.commission || 0.001);
      cash -= (targetShares - shares) * prices[i] + cost;
      if (targetShares !== shares) {
        trades.push({ date: dates[i], action: targetShares > shares ? "BUY" : "SELL", price: prices[i], shares: Math.abs(targetShares - shares) });
      }
      shares = targetShares;
    }

    equityCurve.push({ date: dates[i], equity: cash + shares * prices[i], position: signal });
  }

  // Performance metrics
  const equities = equityCurve.map(e => e.equity);
  const totalReturn = (equities[equities.length - 1] - capital) / capital;
  const years = equityCurve.length / 252;
  const cagr = Math.pow(1 + totalReturn, 1 / Math.max(years, 0.1)) - 1;
  const dailyReturns = equities.slice(1).map((e, i) => (e - equities[i]) / equities[i]);
  const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const retStd = Math.sqrt(dailyReturns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / dailyReturns.length);
  const sharpe = retStd > 0 ? (meanRet / retStd) * Math.sqrt(252) : 0;
  let peak = -Infinity, maxDD = 0;
  for (const e of equities) { if (e > peak) peak = e; const dd = (e - peak) / peak; if (dd < maxDD) maxDD = dd; }
  const wins = dailyReturns.filter(r => r > 0).length;
  const winRate = dailyReturns.length > 0 ? wins / dailyReturns.length : 0;

  return {
    equityCurve: equityCurve.slice(0, 300).concat(equityCurve.slice(-50)), // trimmed for payload
    trades: trades.slice(-50),
    metrics: {
      totalReturn: +totalReturn.toFixed(4),
      cagr: +cagr.toFixed(4),
      sharpe: +sharpe.toFixed(3),
      maxDrawdown: +maxDD.toFixed(4),
      winRate: +winRate.toFixed(3),
      totalTrades: trades.length,
      finalEquity: +equities[equities.length - 1].toFixed(2),
    },
  };
}

// ── Gemini AI helper ─────────────────────────────────────────────
async function askGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "Gemini API key not configured. Set GEMINI_API_KEY environment variable.";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";
  } catch (e: any) {
    return `Gemini error: ${e.message}`;
  }
}

// ── Route registration ───────────────────────────────────────────
export async function registerRoutes(httpServer: any, app: Express) {
  // ── Market Data ────────────────────────────────────────────────
  app.get("/api/market/quote/:ticker", async (req: any, res: any) => {
    try {
      const data = await fetchPrice(req.params.ticker.toUpperCase());
      if (!data) return res.status(404).json({ error: "Ticker not found" });
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/market/quotes", async (req: any, res: any) => {
    try {
      const tickers = ((req.query.tickers as string) || "SPY,QQQ,IWM,GLD,TLT").split(",");
      const results = await Promise.all(tickers.map(t => fetchPrice(t.trim().toUpperCase())));
      res.json(results.filter(Boolean));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Signals ────────────────────────────────────────────────────
  app.get("/api/signals/:ticker", async (req: any, res: any) => {
    try {
      const data = await fetchPrice(req.params.ticker.toUpperCase());
      if (!data) return res.status(404).json({ error: "Ticker not found" });
      const signals = computeSignals(data.history);
      res.json({ ticker: req.params.ticker.toUpperCase(), price: data.price, change: data.changePct, signals, history: data.history.slice(-60) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/signals/screen", async (req: any, res: any) => {
    try {
      const { tickers } = req.body;
      const results = await Promise.all(
        (tickers || []).slice(0, 20).map(async (t: string) => {
          const data = await fetchPrice(t.toUpperCase());
          if (!data) return null;
          const signals = computeSignals(data.history);
          return { ticker: t.toUpperCase(), name: data.name, price: data.price, changePct: data.changePct, signals };
        })
      );
      const sorted = results.filter(Boolean).sort((a: any, b: any) => (b.signals?.compositeAlpha || 0) - (a.signals?.compositeAlpha || 0));
      res.json(sorted);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Backtest ───────────────────────────────────────────────────
  app.post("/api/backtest/run", async (req: any, res: any) => {
    try {
      const { ticker, strategy, params } = req.body;
      const data = await fetchPrice(ticker?.toUpperCase() || "SPY");
      if (!data) return res.status(404).json({ error: "Ticker not found" });
      const result = runBacktest(data.history, strategy || "momentum", params || {});
      res.json({ ticker, strategy, ...result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/backtests", (_req: any, res: any) => { res.json(storage.getSavedBacktests()); });
  app.post("/api/backtests", (req: any, res: any) => {
    try {
      const data = insertSavedBacktestSchema.parse(req.body);
      res.json(storage.saveBacktest(data));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/backtests/:id", (req: any, res: any) => {
    storage.deleteBacktest(Number(req.params.id));
    res.json({ success: true });
  });

  // ── Portfolio Optimizer ────────────────────────────────────────
  app.post("/api/portfolio/optimize", async (req: any, res: any) => {
    try {
      const { tickers, method } = req.body;
      if (!tickers || tickers.length < 2) return res.status(400).json({ error: "Need at least 2 tickers" });

      const allData = await Promise.all(tickers.map((t: string) => fetchPrice(t.toUpperCase())));
      const valid = allData.filter((d: any) => d && d.history?.length >= 60);
      if (valid.length < 2) return res.status(400).json({ error: "Not enough data" });

      // Align dates and compute returns
      const dateMap = new Map<string, number[]>();
      for (const d of valid) {
        for (const h of d.history) {
          if (!dateMap.has(h.date)) dateMap.set(h.date, new Array(valid.length).fill(null));
          const idx = valid.indexOf(d);
          dateMap.get(h.date)![idx] = h.close;
        }
      }

      const rows = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        .filter(([, prices]) => prices.every(p => p !== null));

      const closes = rows.map(([, p]) => p as number[]);
      const returns: number[][] = closes.slice(1).map((row, i) =>
        row.map((p, j) => (p - closes[i][j]) / closes[i][j])
      );

      const n = valid.length;
      const T = returns.length;

      // Compute mean returns and covariance
      const means = Array(n).fill(0).map((_, j) => returns.reduce((s, r) => s + r[j], 0) / T * 252);
      const cov = Array(n).fill(null).map((_, i) =>
        Array(n).fill(0).map((_, j) => {
          const mi = means[i] / 252, mj = means[j] / 252;
          return returns.reduce((s, r) => s + (r[i] - mi) * (r[j] - mj), 0) / T * 252;
        })
      );

      // Risk Parity (equal risk contribution — simple version)
      const vols = cov.map((row, i) => Math.sqrt(row[i]));
      const totalInvVol = vols.reduce((s, v) => s + (v > 0 ? 1 / v : 0), 0);
      const rpWeights = vols.map(v => v > 0 ? (1 / v) / totalInvVol : 1 / n);

      // Minimum Variance (simplified gradient descent)
      let mvWeights = Array(n).fill(1 / n);
      for (let iter = 0; iter < 200; iter++) {
        const portVar = mvWeights.reduce((s, wi, i) =>
          s + mvWeights.reduce((ss, wj, j) => ss + wi * wj * cov[i][j], 0), 0);
        const grads = mvWeights.map((_, i) => 2 * mvWeights.reduce((s, wj, j) => s + wj * cov[i][j], 0));
        const lr = 0.01 / (1 + iter * 0.01);
        mvWeights = mvWeights.map((w, i) => Math.max(0, w - lr * grads[i]));
        const sum = mvWeights.reduce((a, b) => a + b, 0);
        mvWeights = mvWeights.map(w => w / sum);
      }

      // Max Sharpe (simplified)
      let msWeights = Array(n).fill(1 / n);
      for (let iter = 0; iter < 200; iter++) {
        const portRet = msWeights.reduce((s, w, i) => s + w * means[i], 0);
        const portVar = msWeights.reduce((s, wi, i) =>
          s + msWeights.reduce((ss, wj, j) => ss + wi * wj * cov[i][j], 0), 0);
        const portVol = Math.sqrt(Math.max(portVar, 1e-10));
        const sharpe = portRet / portVol;
        const dSharpe = msWeights.map((_, i) => {
          const dRet = means[i];
          const dVar = 2 * msWeights.reduce((s, wj, j) => s + wj * cov[i][j], 0);
          return (dRet * portVol - portRet * dVar / (2 * portVol)) / (portVar || 1e-10);
        });
        const lr = 0.05 / (1 + iter * 0.02);
        msWeights = msWeights.map((w, i) => Math.max(0, w + lr * dSharpe[i]));
        const sum = msWeights.reduce((a, b) => a + b, 0);
        msWeights = msWeights.map(w => w / sum);
      }

      // Compute portfolio stats for each set of weights
      const portStats = (weights: number[]) => {
        const ret = weights.reduce((s, w, i) => s + w * means[i], 0);
        const variance = weights.reduce((s, wi, i) =>
          s + weights.reduce((ss, wj, j) => ss + wi * wj * cov[i][j], 0), 0);
        const vol = Math.sqrt(Math.max(variance, 0));
        return { return: +ret.toFixed(4), volatility: +vol.toFixed(4), sharpe: +(ret / (vol || 1e-10)).toFixed(3) };
      };

      res.json({
        tickers: valid.map((d: any) => d.ticker),
        methods: {
          riskParity: { weights: rpWeights.map(w => +w.toFixed(4)), stats: portStats(rpWeights) },
          minVariance: { weights: mvWeights.map(w => +w.toFixed(4)), stats: portStats(mvWeights) },
          maxSharpe: { weights: msWeights.map(w => +w.toFixed(4)), stats: portStats(msWeights) },
          equalWeight: { weights: Array(n).fill(+(1 / n).toFixed(4)), stats: portStats(Array(n).fill(1 / n)) },
        },
        assetStats: valid.map((d: any, i: number) => ({
          ticker: d.ticker,
          annualReturn: +means[i].toFixed(4),
          volatility: +Math.sqrt(cov[i][i]).toFixed(4),
          sharpe: +(means[i] / Math.sqrt(cov[i][i] || 1e-10)).toFixed(3),
        })),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Risk Metrics ───────────────────────────────────────────────
  app.post("/api/risk/metrics", async (req: any, res: any) => {
    try {
      const { ticker, confidence } = req.body;
      const c = confidence || 0.95;
      const data = await fetchPrice(ticker?.toUpperCase() || "SPY");
      if (!data || !data.history?.length) return res.status(404).json({ error: "No data" });

      const prices = data.history.map((h: any) => h.close);
      const returns = prices.slice(1).map((p: number, i: number) => (p - prices[i]) / prices[i]).filter((r: number) => !isNaN(r));

      const sorted = [...returns].sort((a, b) => a - b);
      const varIdx = Math.floor((1 - c) * sorted.length);
      const historicalVaR = -sorted[varIdx];
      const cvar = -sorted.slice(0, varIdx + 1).reduce((a, b) => a + b, 0) / Math.max(varIdx + 1, 1);

      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length);
      const parametricVaR = -(mean - 1.645 * std); // 95% normal

      let peak = -Infinity, maxDD = 0;
      let peakPrice = prices[0];
      for (const p of prices) { if (p > peakPrice) peakPrice = p; const dd = (p - peakPrice) / peakPrice; if (dd < maxDD) maxDD = dd; }

      const annVol = std * Math.sqrt(252);
      const annReturn = mean * 252;
      const sharpe = annVol > 0 ? annReturn / annVol : 0;

      const skew = returns.reduce((a, r) => a + ((r - mean) / std) ** 3, 0) / returns.length;
      const kurt = returns.reduce((a, r) => a + ((r - mean) / std) ** 4, 0) / returns.length - 3;

      res.json({
        ticker: ticker?.toUpperCase(),
        confidence: c,
        historicalVaR: +historicalVaR.toFixed(4),
        cvar: +cvar.toFixed(4),
        parametricVaR: +parametricVaR.toFixed(4),
        maxDrawdown: +maxDD.toFixed(4),
        annualizedReturn: +annReturn.toFixed(4),
        annualizedVolatility: +annVol.toFixed(4),
        sharpe: +sharpe.toFixed(3),
        skewness: +skew.toFixed(3),
        kurtosis: +kurt.toFixed(3),
        observations: returns.length,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── AI Analyst ─────────────────────────────────────────────────
  app.get("/api/ai/chats", (_req: any, res: any) => { res.json(storage.getAiChats()); });
  app.delete("/api/ai/chats", (_req: any, res: any) => { storage.clearAiChats(); res.json({ success: true }); });

  app.post("/api/ai/ask", async (req: any, res: any) => {
    try {
      const { question, context } = req.body;
      if (!question) return res.status(400).json({ error: "No question provided" });

      storage.addAiChat({ role: "user", content: question, context: context || null, createdAt: new Date().toISOString() });

      const systemPrompt = `You are the Chief Quantitative Strategist at QuantVault — an elite institutional quantitative research platform. You combine deep expertise in quantitative finance (momentum, mean reversion, factor models, risk management, portfolio theory) with clear, actionable communication. Speak with authority and precision. ${context ? `Current context: ${context}` : ""} Answer in 3-5 sentences. Be direct, data-focused, and professionally confident. No markdown formatting.`;
      const fullPrompt = `${systemPrompt}\n\nAnalyst question: ${question}`;
      const answer = await askGemini(fullPrompt);

      storage.addAiChat({ role: "assistant", content: answer, context: context || null, createdAt: new Date().toISOString() });
      res.json({ answer });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ai/analyze-portfolio", async (req: any, res: any) => {
    try {
      const { tickers, metrics } = req.body;
      const prompt = `You are the Chief Quantitative Strategist at QuantVault — an elite institutional quant platform.

Portfolio: ${JSON.stringify(tickers)}
Metrics: ${JSON.stringify(metrics)}

Write a 5-6 sentence institutional-grade portfolio analysis. Lead with the most important quantitative finding (Sharpe, drawdown, CAGR). Comment on diversification and risk. End with a clear strategic recommendation. Plain text only. Under 150 words.`;
      const analysis = await askGemini(prompt);
      res.json({ analysis });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ai/analyze-signal", async (req: any, res: any) => {
    try {
      const { ticker, signals } = req.body;
      const prompt = `You are the Chief Quantitative Strategist at QuantVault.

Ticker: ${ticker}
Signals: ${JSON.stringify(signals)}

Write a 3-4 sentence signal interpretation: the composite alpha score, momentum trend, mean reversion, and regime. Give a clear directional recommendation (LONG / SHORT / NEUTRAL). Plain text. Under 80 words.`;
      const commentary = await askGemini(prompt);
      res.json({ commentary });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Watchlist ──────────────────────────────────────────────────
  app.get("/api/watchlist", (_req: any, res: any) => { res.json(storage.getWatchlist()); });
  app.post("/api/watchlist", (req: any, res: any) => {
    try { res.json(storage.addToWatchlist(insertWatchlistItemSchema.parse(req.body))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.patch("/api/watchlist/:id", (req: any, res: any) => {
    res.json(storage.updateWatchlistItem(Number(req.params.id), req.body));
  });
  app.delete("/api/watchlist/:id", (req: any, res: any) => {
    storage.removeFromWatchlist(Number(req.params.id)); res.json({ success: true });
  });

  // ── Theses ─────────────────────────────────────────────────────
  app.get("/api/theses", (_req: any, res: any) => { res.json(storage.getTheses()); });
  app.post("/api/theses", (req: any, res: any) => {
    try { res.json(storage.createThesis(insertThesisSchema.parse(req.body))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.patch("/api/theses/:id", (req: any, res: any) => {
    res.json(storage.updateThesis(Number(req.params.id), req.body));
  });
  app.delete("/api/theses/:id", (req: any, res: any) => {
    storage.deleteThesis(Number(req.params.id)); res.json({ success: true });
  });

  // ── News Annotations ───────────────────────────────────────────
  app.get("/api/annotations", (_req: any, res: any) => { res.json(storage.getNewsAnnotations()); });
  app.post("/api/annotations", (req: any, res: any) => {
    try { res.json(storage.createNewsAnnotation(insertNewsAnnotationSchema.parse(req.body))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/annotations/:id", (req: any, res: any) => {
    storage.deleteNewsAnnotation(Number(req.params.id)); res.json({ success: true });
  });

  // ── Alerts ─────────────────────────────────────────────────────
  app.get("/api/alerts", (_req: any, res: any) => { res.json(storage.getAlerts()); });
  app.post("/api/alerts", (req: any, res: any) => {
    try { res.json(storage.createAlert(insertAlertSchema.parse(req.body))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.patch("/api/alerts/:id/toggle", (req: any, res: any) => {
    res.json(storage.toggleAlert(Number(req.params.id)));
  });
  app.delete("/api/alerts/:id", (req: any, res: any) => {
    storage.deleteAlert(Number(req.params.id)); res.json({ success: true });
  });

  return httpServer;
}
