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

            const handles = url.searchParams.get("handles") || "";
            const creatorList = handles.split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);

            if (creatorList.length === 0) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "No creator handles provided" }));
              return;
            }

            try {
              const channels = await Promise.all(
                creatorList.map(async (handle) => {
                  const r = await fetch(
                    `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
                  );
                  const raw = await r.text();
                  let data;
                  try { data = JSON.parse(raw); } catch { data = null; }
                  if (!r.ok || !data?.items?.length) return null;
                  const ch = data.items[0];
                    return {
                      handle: `@${handle}`,
                      channelId: ch.id,
                      name: ch.snippet?.title || handle,
                      subscriberCount: parseInt(ch.statistics?.subscriberCount || "0", 10),
                      totalViews: parseInt(ch.statistics?.viewCount || "0", 10),
                      totalVideos: parseInt(ch.statistics?.videoCount || "1", 10),
                      avgViews: Math.round(
                        parseInt(ch.statistics?.viewCount || "0", 10) /
                        Math.max(parseInt(ch.statistics?.videoCount || "1", 10), 1)
                      ),
                    };
                })
              );

              const validChannels = channels.filter(Boolean);
              if (validChannels.length === 0) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ results: [], errors: ["No channels found"] }));
                return;
              }

              const rssResults = await Promise.all(
                validChannels.map(async (ch) => {
                  try {
                    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`);
                    const xml = await r.text();
                    const entries = [];
                    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
                    let match;
                    while ((match = entryRegex.exec(xml)) !== null) {
                      const block = match[1];
                      const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
                      const title = block.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
                      const thumbnailMatch = block.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1];
                      if (videoId) {
                        entries.push({
                          videoId,
                          title: title || "Untitled",
                          thumbnailUrl: thumbnailMatch || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        });
                      }
                    }
                    return { channel: ch, videos: entries };
                  } catch {
                    return { channel: ch, videos: [] };
                  }
                })
              );

              const allVideos = [];
              const videoIdToCreator = {};
              for (const { channel, videos } of rssResults) {
                for (const v of videos) {
                  allVideos.push(v.videoId);
                  videoIdToCreator[v.videoId] = { ...channel };
                }
              }

              if (allVideos.length === 0) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ results: [], errors: ["No videos in RSS feeds"] }));
                return;
              }

              const videoRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${allVideos.join(",")}&key=${apiKey}`
              );
              const videoRaw = await videoRes.text();
              let videoData;
              try { videoData = JSON.parse(videoRaw); } catch { videoData = { items: [] }; }

              function parseDuration(iso) {
                const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
                return (parseInt(m?.[1] || "0", 10) * 60) + parseInt(m?.[2] || "0", 10);
              }

              const results = [];
              const seen = new Set();
              for (const v of videoData.items || []) {
                const vid = v.id;
                if (seen.has(vid)) continue;
                seen.add(vid);
                const dur = parseDuration(v.contentDetails?.duration || "PT0S");
                if (dur < 60) continue;
                const creator = videoIdToCreator[vid];
                if (!creator) continue;
                const viewCount = parseInt(v.statistics?.viewCount || "0", 10);
                const avgViews = creator.avgViews || 1;
                const viralRatio = avgViews > 0 ? +(viewCount / avgViews).toFixed(2) : 0;
                results.push({
                  videoId: vid,
                  title: v.snippet?.title || "Untitled",
                  channelTitle: creator.name,
                  channelId: creator.channelId,
                  creatorHandle: creator.handle,
                  subscriberCount: creator.subscriberCount,
                  thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                  viewCount,
                  channelAvgViews: avgViews,
                  viralRatio,
                });
              }

              results.sort((a, b) => b.viralRatio - a.viralRatio);

              const perCreatorCount = {};
              const diverseResults = [];
              for (const r of results) {
                const key = r.creatorHandle;
                const count = perCreatorCount[key] || 0;
                if (count >= 3) continue;
                perCreatorCount[key] = count + 1;
                diverseResults.push(r);
                if (diverseResults.length === 15) break;
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ results: diverseResults }));
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
