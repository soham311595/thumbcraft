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

              const raw = await response.text();
              let data;
              try { data = JSON.parse(raw); } catch { data = raw; }
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

              const raw = await response.text();
              let data;
              try { data = JSON.parse(raw); } catch { data = { error: raw }; }

              if (!response.ok) {
                const detail = data.error?.metadata?.provider_name
                  ? ` (${data.error.metadata.provider_name})`
                  : "";
                res.statusCode = response.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  error: `${data.error?.message || data.error || "Image generation failed"}${detail}`,
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
              const query = encodeURIComponent(`${niche} ${subcategory} viral trending`);
              const searchRes = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${query}&key=${apiKey}`
              );
              const searchRaw = await searchRes.text();
              let searchData;
              try { searchData = JSON.parse(searchRaw); } catch { searchData = null; }
              if (!searchRes.ok || !searchData) {
                const msg = searchData?.error?.message || searchRaw?.slice(0, 200) || "YouTube search failed";
                res.statusCode = searchRes.status;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: msg }));
                return;
              }

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
              const channelRaw = await channelRes.text();
              let channelData;
              try { channelData = JSON.parse(channelRaw); } catch { channelData = { items: [] }; }

              // Fetch video statistics + contentDetails (for duration)
              const videoRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds.join(",")}&key=${apiKey}`
              );
              const videoRaw = await videoRes.text();
              let videoData;
              try { videoData = JSON.parse(videoRaw); } catch { videoData = { items: [] }; }

              // Parse ISO 8601 duration (e.g. PT15S, PT5M30S) to seconds
              function parseDuration(iso) {
                const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
                return (parseInt(m?.[1] || "0", 10) * 60) + parseInt(m?.[2] || "0", 10);
              }

              // Filter out Shorts (< 60s) and build stats
              const longVideos = (videoData.items || []).filter(
                (v) => parseDuration(v.contentDetails.duration) >= 60
              );
              const longVideoIds = new Set(longVideos.map((v) => v.id));
              const filteredItems = items.filter((i) => longVideoIds.has(i.id.videoId));
              if (filteredItems.length === 0) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ results: [] }));
                return;
              }

              // Build channel stats map from real channel data (total views / total videos)
              const channelStatsMap = {};
              for (const ch of channelData.items || []) {
                const totalViews = parseInt(ch.statistics.viewCount || "0", 10);
                const videoCount = parseInt(ch.statistics.videoCount || "1", 10);
                channelStatsMap[ch.id] = Math.round(totalViews / videoCount);
              }

              const videoStats = {};
              for (const v of longVideos) {
                videoStats[v.id] = parseInt(v.statistics.viewCount || "0", 10);
              }

              const results = filteredItems.map((item) => {
                const vid = item.id.videoId;
                const cid = item.snippet.channelId;
                const viewCount = videoStats[vid] || 0;
                const channelAvgViews = channelStatsMap[cid] || 1;
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
