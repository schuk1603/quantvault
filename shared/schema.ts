import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Watchlist ─────────────────────────────────────────────────────
export const watchlistItems = sqliteTable("watchlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  sector: text("sector"),
  addedAt: text("added_at").notNull(),
  notes: text("notes"),
  targetPrice: real("target_price"),
  alertPrice: real("alert_price"),
});
export const insertWatchlistItemSchema = createInsertSchema(watchlistItems).omit({ id: true });
export type InsertWatchlistItem = z.infer<typeof insertWatchlistItemSchema>;
export type WatchlistItem = typeof watchlistItems.$inferSelect;

// ── Investment Theses ─────────────────────────────────────────────
export const theses = sqliteTable("theses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  direction: text("direction").notNull(), // "long" | "short"
  conviction: integer("conviction").notNull(), // 1–5
  thesis: text("thesis").notNull(),
  catalysts: text("catalysts").notNull(), // JSON array
  risks: text("risks").notNull(),         // JSON array
  targetPrice: real("target_price"),
  timeHorizon: text("time_horizon"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  status: text("status").notNull(), // "active" | "closed" | "monitoring"
});
export const insertThesisSchema = createInsertSchema(theses).omit({ id: true });
export type InsertThesis = z.infer<typeof insertThesisSchema>;
export type Thesis = typeof theses.$inferSelect;

// ── News Annotations ──────────────────────────────────────────────
export const newsAnnotations = sqliteTable("news_annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  newsId: text("news_id").notNull(),
  headline: text("headline").notNull(),
  ticker: text("ticker"),
  signal: text("signal").notNull(), // "bullish" | "bearish" | "neutral"
  importance: integer("importance").notNull(), // 1–5
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});
export const insertNewsAnnotationSchema = createInsertSchema(newsAnnotations).omit({ id: true });
export type InsertNewsAnnotation = z.infer<typeof insertNewsAnnotationSchema>;
export type NewsAnnotation = typeof newsAnnotations.$inferSelect;

// ── Alerts ────────────────────────────────────────────────────────
export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  alertType: text("alert_type").notNull(), // "price_above" | "price_below" | "vol_spike" | "signal_change"
  threshold: real("threshold"),
  message: text("message").notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

// ── Saved Backtests ───────────────────────────────────────────────
export const savedBacktests = sqliteTable("saved_backtests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  tickers: text("tickers").notNull(),   // JSON array
  strategy: text("strategy").notNull(), // "momentum" | "mean_reversion" | "trend" | "factor"
  params: text("params").notNull(),     // JSON object
  resultsJson: text("results_json"),    // full tearsheet JSON
  sharpe: real("sharpe"),
  cagr: real("cagr"),
  maxDrawdown: real("max_drawdown"),
  createdAt: text("created_at").notNull(),
});
export const insertSavedBacktestSchema = createInsertSchema(savedBacktests).omit({ id: true });
export type InsertSavedBacktest = z.infer<typeof insertSavedBacktestSchema>;
export type SavedBacktest = typeof savedBacktests.$inferSelect;

// ── AI Chat History ───────────────────────────────────────────────
export const aiChats = sqliteTable("ai_chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  context: text("context"),    // optional ticker / page context
  createdAt: text("created_at").notNull(),
});
export const insertAiChatSchema = createInsertSchema(aiChats).omit({ id: true });
export type InsertAiChat = z.infer<typeof insertAiChatSchema>;
export type AiChat = typeof aiChats.$inferSelect;
