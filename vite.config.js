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
                  model: "google/gemini-3.1-flash-image-preview",
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
              async function searchVideos(q) {
                const r = await fetch(
                  `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${apiKey}`
                );
                const raw = await r.text();
                let data;
                try { data = JSON.parse(raw); } catch { data = null; }
                if (!r.ok || !data) return [];
                return data.items || [];
              }

              const [broadItems, specificItems] = await Promise.all([
                searchVideos(`${niche} channel`),
                subcategory ? searchVideos(`${niche} ${subcategory} viral trending`) : Promise.resolve([]),
              ]);

              // Merge and deduplicate by videoId
              const seen = new Set();
              const merged = [];
              for (const item of [...broadItems, ...specificItems]) {
                if (!seen.has(item.id.videoId)) {
                  seen.add(item.id.videoId);
                  merged.push(item);
                }
              }

              if (merged.length === 0) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ results: [] }));
                return;
              }

              const channelIds = [...new Set(merged.map((i) => i.snippet.channelId))];
              const videoIds = merged.map((i) => i.id.videoId);

              const [channelRaw, videoRaw] = await Promise.all([
                fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}&key=${apiKey}`)
                  .then((r) => r.text()),
                fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds.join(",")}&key=${apiKey}`)
                  .then((r) => r.text()),
              ]);

              let channelData, videoData;
              try { channelData = JSON.parse(channelRaw); } catch { channelData = { items: [] }; }
              try { videoData = JSON.parse(videoRaw); } catch { videoData = { items: [] }; }

              const channelStatsMap = {};
              for (const ch of channelData.items || []) {
                channelStatsMap[ch.id] = Math.round(
                  parseInt(ch.statistics.viewCount || "0", 10) /
                  Math.max(parseInt(ch.statistics.videoCount || "1", 10), 1)
                );
              }

              function parseDuration(iso) {
                const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
                return (parseInt(m?.[1] || "0", 10) * 60) + parseInt(m?.[2] || "0", 10);
              }

              const longVideos = (videoData.items || []).filter(
                (v) => parseDuration(v.contentDetails.duration) >= 60
              );
              const longVideoIds = new Set(longVideos.map((v) => v.id));
              const filteredItems = merged.filter((i) => longVideoIds.has(i.id.videoId));
              if (filteredItems.length === 0) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ results: [] }));
                return;
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

});
