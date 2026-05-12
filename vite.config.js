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
              const { fetchTranscript } = await import("youtube-transcript");
              const segments = await fetchTranscript(videoId);
              const normalized = segments.map((seg) => ({
                text: seg.text,
                start: seg.offset / 1000,
                duration: seg.duration / 1000,
              }));
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(normalized));
            } catch (error) {
              const msg = error.message || "";
              const code = msg.includes("disabled") ? 403 : msg.includes("unavailable") || msg.includes("not found") ? 404 : 500;
              res.statusCode = code;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: msg || "Failed to fetch transcript" }));
            }
            return;
          }

          if (url.pathname === "/api/generate-image") {
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
              const { prompt, reference_image } = parsed;

              if (!prompt) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Missing prompt" }));
                return;
              }

              const messageContent = reference_image
                ? [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: reference_image } },
                  ]
                : prompt;

              const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "HTTP-Referer": process.env.VERCEL_URL || "http://localhost:5173",
                  "X-Title": "ThumbCraft",
                },
                body: JSON.stringify({
                  model: "sourceful/riverflow-v2-pro",
                  messages: [{ role: "user", content: messageContent }],
                  modalities: ["image"],
                }),
              });

              const data = await response.json();

              if (!response.ok) {
                const detail = data.error?.metadata?.provider_name
                  ? ` (${data.error.metadata.provider_name})`
                  : "";
                res.statusCode = response.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  error: `${data.error?.message || "Image generation failed"}${detail}`,
                }));
                return;
              }

              const images = data?.choices?.[0]?.message?.images;
              if (!images?.length) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "No image in model response" }));
                return;
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                dataUrl: images[0].image_url.url,
                prompt,
              }));
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
