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
              const { prompt, reference_images } = parsed;

              if (!prompt) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Missing prompt" }));
                return;
              }

              let messageContent;
              if (reference_images && reference_images.length > 0) {
                messageContent = [
                  { type: "text", text: prompt },
                  ...reference_images.map((url) => ({ type: "image_url", image_url: { url } })),
                ];
              } else {
                messageContent = prompt;
              }

              const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "HTTP-Referer": process.env.VERCEL_URL || "http://localhost:5173",
                  "X-Title": "ThumbCraft",
                },
                body: JSON.stringify({
                  model: "google/gemini-3.1-flash-lite",
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

          if (url.pathname === "/api/inspiration") {
            if (req.method !== "GET") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }

            const apiKey = process.env.YOUTUBE_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }));
              return;
            }

            const niche = url.searchParams.get("niche") || "";
            const subcategory = url.searchParams.get("subcategory") || "";

            try {
              const query = encodeURIComponent(`best thumbnails ${niche} ${subcategory} channel`);
              const searchRes = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${query}&key=${apiKey}`
              );
              if (!searchRes.ok) {
                const err = await searchRes.json();
                res.statusCode = searchRes.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.error?.message || "YouTube search failed" }));
                return;
              }
              const searchData = await searchRes.json();

              const items = searchData.items || [];
              if (items.length === 0) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ results: [] }));
                return;
              }

              // Collect channel IDs and video IDs
              const channelIds = [...new Set(items.map((i) => i.snippet.channelId))];
              const videoIds = items.map((i) => i.id.videoId);

              // Fetch channel statistics
              const channelRes = await fetch(
                `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}&key=${apiKey}`
              );
              const channelData = await channelRes.json();
              const channelStats = {};
              for (const ch of channelData.items || []) {
                const subs = parseInt(ch.statistics.subscriberCount || "0", 10);
                const views = parseInt(ch.statistics.viewCount || "0", 10);
                channelStats[ch.id] = { subscriberCount: subs, totalViewCount: views };
              }

              // Fetch video statistics
              const videoRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&key=${apiKey}`
              );
              const videoData = await videoRes.json();
              const videoStats = {};
              for (const v of videoData.items || []) {
                videoStats[v.id] = parseInt(v.statistics.viewCount || "0", 10);
              }

              // Compute average views per channel
              const channelVideoCounts = {};
              const channelTotalViews = {};
              for (const v of videoData.items || []) {
                const cid = items.find((i) => i.id.videoId === v.id)?.snippet.channelId;
                if (cid) {
                  channelVideoCounts[cid] = (channelVideoCounts[cid] || 0) + 1;
                  channelTotalViews[cid] = (channelTotalViews[cid] || 0) + parseInt(v.statistics.viewCount || "0", 10);
                }
              }

              const results = items.map((item) => {
                const vid = item.id.videoId;
                const cid = item.snippet.channelId;
                const viewCount = videoStats[vid] || 0;
                const totalViews = channelTotalViews[cid] || 0;
                const videoCount = channelVideoCounts[cid] || 1;
                const channelAvgViews = Math.round(totalViews / videoCount);
                const viralRatio = channelAvgViews > 0 ? +(viewCount / channelAvgViews).toFixed(2) : 0;

                return {
                  videoId: vid,
                  title: item.snippet.title,
                  channelTitle: item.snippet.channelTitle,
                  channelId: cid,
                  thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                  viewCount,
                  channelAvgViews,
                  viralRatio,
                };
              });

              // Sort by viral ratio descending
              results.sort((a, b) => b.viralRatio - a.viralRatio);

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ results }));
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
