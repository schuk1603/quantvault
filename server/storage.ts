import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";

const sqlite = new Database("quantvault.db");
const db = drizzle(sqlite);

// ── Create tables ─────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS watchlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    company_name TEXT NOT NULL,
    sector TEXT,
    added_at TEXT NOT NULL,
    notes TEXT,
    target_price REAL,
    alert_price REAL
  );

  CREATE TABLE IF NOT EXISTS theses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    company_name TEXT NOT NULL,
    direction TEXT NOT NULL,
    conviction INTEGER NOT NULL,
    thesis TEXT NOT NULL,
    catalysts TEXT NOT NULL,
    risks TEXT NOT NULL,
    target_price REAL,
    time_horizon TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS news_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id TEXT NOT NULL,
    headline TEXT NOT NULL,
    ticker TEXT,
    signal TEXT NOT NULL,
    importance INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    threshold REAL,
    message TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_backtests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tickers TEXT NOT NULL,
    strategy TEXT NOT NULL,
    params TEXT NOT NULL,
    results_json TEXT,
    sharpe REAL,
    cagr REAL,
    max_drawdown REAL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL
  );
`);

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

class SqliteStorage implements IStorage {
  // Watchlist
  getWatchlist() { return db.select().from(schema.watchlistItems).all(); }
  addToWatchlist(data: schema.InsertWatchlistItem) {
    return db.insert(schema.watchlistItems).values({ ...data, addedAt: new Date().toISOString() }).returning().get();
  }
  updateWatchlistItem(id: number, data: Partial<schema.InsertWatchlistItem>) {
    return db.update(schema.watchlistItems).set(data).where(eq(schema.watchlistItems.id, id)).returning().get();
  }
  removeFromWatchlist(id: number) {
    db.delete(schema.watchlistItems).where(eq(schema.watchlistItems.id, id)).run();
  }

  // Theses
  getTheses() { return db.select().from(schema.theses).all(); }
  createThesis(data: schema.InsertThesis) {
    const now = new Date().toISOString();
    return db.insert(schema.theses).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }
  updateThesis(id: number, data: Partial<schema.InsertThesis>) {
    return db.update(schema.theses).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(schema.theses.id, id)).returning().get();
  }
  deleteThesis(id: number) { db.delete(schema.theses).where(eq(schema.theses.id, id)).run(); }

  // News annotations
  getNewsAnnotations() { return db.select().from(schema.newsAnnotations).all(); }
  createNewsAnnotation(data: schema.InsertNewsAnnotation) {
    return db.insert(schema.newsAnnotations).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }
  deleteNewsAnnotation(id: number) { db.delete(schema.newsAnnotations).where(eq(schema.newsAnnotations.id, id)).run(); }

  // Alerts
  getAlerts() { return db.select().from(schema.alerts).all(); }
  createAlert(data: schema.InsertAlert) {
    return db.insert(schema.alerts).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }
  toggleAlert(id: number) {
    const existing = db.select().from(schema.alerts).where(eq(schema.alerts.id, id)).get();
    if (!existing) return undefined;
    return db.update(schema.alerts).set({ isActive: existing.isActive ? 0 : 1 }).where(eq(schema.alerts.id, id)).returning().get();
  }
  deleteAlert(id: number) { db.delete(schema.alerts).where(eq(schema.alerts.id, id)).run(); }

  // Backtests
  getSavedBacktests() { return db.select().from(schema.savedBacktests).all(); }
  saveBacktest(data: schema.InsertSavedBacktest) {
    return db.insert(schema.savedBacktests).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }
  deleteBacktest(id: number) { db.delete(schema.savedBacktests).where(eq(schema.savedBacktests.id, id)).run(); }

  // AI Chat
  getAiChats() { return db.select().from(schema.aiChats).all(); }
  addAiChat(data: schema.InsertAiChat) {
    return db.insert(schema.aiChats).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }
  clearAiChats() { db.delete(schema.aiChats).run(); }
}

export const storage = new SqliteStorage();
