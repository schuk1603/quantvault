import type * as schema from "@shared/schema";

// ── Pure in-memory storage (works on Vercel serverless) ──────────────────────
// Data persists for the lifetime of the serverless instance.
// For a portfolio demo this is ideal — no native dependencies needed.

export interface IStorage {
  // Watchlist
  getWatchlist(): schema.WatchlistItem[];
  addToWatchlist(data: schema.InsertWatchlistItem): schema.WatchlistItem;
  updateWatchlistItem(id: number, data: Partial<schema.InsertWatchlistItem>): schema.WatchlistItem | undefined;
  removeFromWatchlist(id: number): void;

  // Theses
  getTheses(): schema.Thesis[];
  createThesis(data: schema.InsertThesis): schema.Thesis;
  updateThesis(id: number, data: Partial<schema.InsertThesis>): schema.Thesis | undefined;
  deleteThesis(id: number): void;

  // News annotations
  getNewsAnnotations(): schema.NewsAnnotation[];
  createNewsAnnotation(data: schema.InsertNewsAnnotation): schema.NewsAnnotation;
  deleteNewsAnnotation(id: number): void;

  // Alerts
  getAlerts(): schema.Alert[];
  createAlert(data: schema.InsertAlert): schema.Alert;
  toggleAlert(id: number): schema.Alert | undefined;
  deleteAlert(id: number): void;

  // Backtests
  getSavedBacktests(): schema.SavedBacktest[];
  saveBacktest(data: schema.InsertSavedBacktest): schema.SavedBacktest;
  deleteBacktest(id: number): void;

  // AI Chat
  getAiChats(): schema.AiChat[];
  addAiChat(data: schema.InsertAiChat): schema.AiChat;
  clearAiChats(): void;
}

class MemoryStorage implements IStorage {
  private watchlist: schema.WatchlistItem[] = [];
  private theses: schema.Thesis[] = [];
  private newsAnnotations: schema.NewsAnnotation[] = [];
  private alerts: schema.Alert[] = [];
  private savedBacktests: schema.SavedBacktest[] = [];
  private aiChats: schema.AiChat[] = [];
  private nextId = { watchlist: 1, theses: 1, news: 1, alerts: 1, backtests: 1, chats: 1 };

  // ── Watchlist ──────────────────────────────────────────────────────
  getWatchlist() { return [...this.watchlist]; }
  addToWatchlist(data: schema.InsertWatchlistItem): schema.WatchlistItem {
    const item: schema.WatchlistItem = { ...data, id: this.nextId.watchlist++, addedAt: data.addedAt || new Date().toISOString(), sector: data.sector ?? null, notes: data.notes ?? null, targetPrice: data.targetPrice ?? null, alertPrice: data.alertPrice ?? null };
    this.watchlist.push(item);
    return item;
  }
  updateWatchlistItem(id: number, data: Partial<schema.InsertWatchlistItem>) {
    const idx = this.watchlist.findIndex(w => w.id === id);
    if (idx === -1) return undefined;
    this.watchlist[idx] = { ...this.watchlist[idx], ...data };
    return this.watchlist[idx];
  }
  removeFromWatchlist(id: number) {
    this.watchlist = this.watchlist.filter(w => w.id !== id);
  }

  // ── Theses ────────────────────────────────────────────────────────
  getTheses() { return [...this.theses]; }
  createThesis(data: schema.InsertThesis): schema.Thesis {
    const now = new Date().toISOString();
    const item: schema.Thesis = { ...data, id: this.nextId.theses++, createdAt: data.createdAt || now, updatedAt: data.updatedAt || now, targetPrice: data.targetPrice ?? null, timeHorizon: data.timeHorizon ?? null };
    this.theses.push(item);
    return item;
  }
  updateThesis(id: number, data: Partial<schema.InsertThesis>) {
    const idx = this.theses.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    this.theses[idx] = { ...this.theses[idx], ...data, updatedAt: new Date().toISOString() };
    return this.theses[idx];
  }
  deleteThesis(id: number) { this.theses = this.theses.filter(t => t.id !== id); }

  // ── News Annotations ──────────────────────────────────────────────
  getNewsAnnotations() { return [...this.newsAnnotations]; }
  createNewsAnnotation(data: schema.InsertNewsAnnotation): schema.NewsAnnotation {
    const item: schema.NewsAnnotation = { ...data, id: this.nextId.news++, createdAt: data.createdAt || new Date().toISOString(), ticker: data.ticker ?? null, notes: data.notes ?? null };
    this.newsAnnotations.push(item);
    return item;
  }
  deleteNewsAnnotation(id: number) { this.newsAnnotations = this.newsAnnotations.filter(n => n.id !== id); }

  // ── Alerts ────────────────────────────────────────────────────────
  getAlerts() { return [...this.alerts]; }
  createAlert(data: schema.InsertAlert): schema.Alert {
    const item: schema.Alert = { ...data, id: this.nextId.alerts++, createdAt: data.createdAt || new Date().toISOString(), threshold: data.threshold ?? null, isActive: data.isActive ?? 1 };
    this.alerts.push(item);
    return item;
  }
  toggleAlert(id: number) {
    const idx = this.alerts.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    this.alerts[idx] = { ...this.alerts[idx], isActive: this.alerts[idx].isActive ? 0 : 1 };
    return this.alerts[idx];
  }
  deleteAlert(id: number) { this.alerts = this.alerts.filter(a => a.id !== id); }

  // ── Backtests ─────────────────────────────────────────────────────
  getSavedBacktests() { return [...this.savedBacktests]; }
  saveBacktest(data: schema.InsertSavedBacktest): schema.SavedBacktest {
    const item: schema.SavedBacktest = { ...data, id: this.nextId.backtests++, createdAt: data.createdAt || new Date().toISOString(), resultsJson: data.resultsJson ?? null, sharpe: data.sharpe ?? null, cagr: data.cagr ?? null, maxDrawdown: data.maxDrawdown ?? null };
    this.savedBacktests.push(item);
    return item;
  }
  deleteBacktest(id: number) { this.savedBacktests = this.savedBacktests.filter(b => b.id !== id); }

  // ── AI Chat ───────────────────────────────────────────────────────
  getAiChats() { return [...this.aiChats]; }
  addAiChat(data: schema.InsertAiChat): schema.AiChat {
    const item: schema.AiChat = { ...data, id: this.nextId.chats++, createdAt: data.createdAt || new Date().toISOString(), context: data.context ?? null };
    this.aiChats.push(item);
    return item;
  }
  clearAiChats() { this.aiChats = []; }
}

export const storage = new MemoryStorage();
