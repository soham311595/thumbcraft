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
              const { prompt, image_config, reference_image } = parsed;

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
                  model: "google/gemini-3.1-flash-image-preview",
                  messages: [{ role: "user", content: messageContent }],
                  modalities: ["image", "text"],
                  image_config: image_config || {
                    aspect_ratio: "16:9",
                    image_size: "2K",
                  },
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
                res.end(JSON.stringify({ error: "No image in Gemini response" }));
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

          if (url.pathname === "/api/youtube-search") {
            const query = url.searchParams.get("q") || url.searchParams.get("query");
            if (!query) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing search query" }));
              return;
            }
            const ytKey = process.env.YOUTUBE_API_KEY;
            if (!ytKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }));
              return;
            }
            try {
              const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
              ytUrl.searchParams.set("part", "snippet");
              ytUrl.searchParams.set("q", query);
              ytUrl.searchParams.set("type", "video");
              ytUrl.searchParams.set("order", "viewCount");
              ytUrl.searchParams.set("maxResults", "8");
              ytUrl.searchParams.set("key", ytKey);
              const resp = await fetch(ytUrl.toString());
              const data = await resp.json();
              if (!resp.ok || data.error) {
                res.statusCode = resp.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: data.error?.message || "YouTube API error" }));
                return;
              }
              const videos = (data.items || []).map((item) => ({
                videoId: item.id?.videoId,
                title: item.snippet?.title,
                channelTitle: item.snippet?.channelTitle,
                thumbnail: `https://img.youtube.com/vi/${item.id?.videoId}/maxresdefault.jpg`,
              })).filter((v) => v.videoId);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ videos }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error.message }));
            }
            return;
          }

          if (url.pathname === "/api/channel-videos") {
            const channelInput = url.searchParams.get("url") || url.searchParams.get("channel");
            if (!channelInput) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing channel URL or ID" }));
              return;
            }
            try {
              const mod = await import("./api/channel-videos.js");
              const channelId = mod.extractChannelId?.(channelInput) || channelInput;
              const resolvedId = channelId?.startsWith?.("@")
                ? await mod.resolveHandleToChannelId(channelId)
                : channelId;
              const videos = await mod.fetchChannelVideos(resolvedId);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ channelId: resolvedId, videos }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error.message }));
            }
            return;
          }

          if (url.pathname === "/api/sprite") {
            const spriteUrl = url.searchParams.get("url");
            if (!spriteUrl) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing url param" }));
              return;
            }
            try {
              const resp = await fetch(spriteUrl);
              if (!resp.ok) {
                res.statusCode = resp.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Sprite fetch failed" }));
                return;
              }
              const buffer = await resp.arrayBuffer();
              res.statusCode = 200;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Content-Type", resp.headers.get("Content-Type") || "image/webp");
              res.setHeader("Cache-Control", "public, max-age=3600");
              res.end(Buffer.from(buffer));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error.message }));
            }
            return;
          }

          if (url.pathname === "/api/player") {
            const videoId = url.searchParams.get("vid") || url.searchParams.get("videoId");
            if (!videoId) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing videoId" }));
              return;
            }
            try {
              const { fetchPlayerData } = await import("./api/player.js");
              const data = await fetchPlayerData(videoId);
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
