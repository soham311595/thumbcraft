import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "api-proxy",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, "http://localhost");

          if (url.pathname === "/api/proxy") {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }));
              return;
            }

            let body = "";
            for await (const chunk of req) body += chunk;

            try {
              const parsed = JSON.parse(body);
              const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "HTTP-Referer": process.env.VERCEL_URL || "http://localhost:5173",
                  "X-Title": "ThumbCraft",
                },
                body: JSON.stringify(parsed),
              });

              const data = await response.json();
              res.statusCode = response.status;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error.message }));
            }
            return;
          }

          if (url.pathname === "/api/transcript") {
            const videoId = url.searchParams.get("vid") || url.searchParams.get("videoId");
            if (!videoId) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing videoId" }));
              return;
            }

            try {
              const response = await fetch(
                `https://youtubetranscript.com/?vid=${videoId}&format=json`,
                {
                  headers: {
                    "User-Agent": "ThumbCraft/1.0",
                    Accept: "application/json",
                  },
                },
              );
              const text = await response.text();
              let data;
              try { data = JSON.parse(text); }
              catch {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Invalid response from transcript service", detail: text.slice(0, 500) }));
                return;
              }
              if (!response.ok || !Array.isArray(data)) {
                res.statusCode = response.ok ? 404 : response.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: typeof data?.error === "string" ? data.error : "No captions available" }));
                return;
              }
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error.message }));
            }
            return;
          }

          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      sharp$: false,
      "onnxruntime-node$": false,
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
});
