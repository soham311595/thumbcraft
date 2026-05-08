import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function apiProxyPlugin() {
  return {
    name: "api-proxy",
    configureServer(server) {
      server.middlewares.use("/api/proxy", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }));
          return;
        }

        try {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", async () => {
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
          });
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiProxyPlugin()],
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
