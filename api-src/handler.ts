import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize routes once at cold start
const ready = (async () => {
  await registerRoutes(httpServer, app);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("API error:", err);
    if (!res.headersSent) res.status(status).json({ message });
  });
})();

// Vercel serverless handler — CJS module.exports
export default async function handler(req: Request, res: Response) {
  await ready;
  return app(req, res);
};
