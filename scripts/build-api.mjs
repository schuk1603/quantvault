import { build } from "esbuild";
import { mkdirSync } from "fs";

mkdirSync("api", { recursive: true });

await build({
  entryPoints: ["api-src/handler.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "api/index.cjs",
  external: [
    "better-sqlite3",
    "dotenv",
    // vite/server stuff not needed in serverless
    "./vite",
    "../server/vite",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  minify: false,
  logLevel: "info",
});

console.log("✓ API bundle written to api/index.js");
