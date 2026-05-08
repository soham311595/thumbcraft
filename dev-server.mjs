import http from "http";
import handler from "./api/proxy.js";

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/api/proxy" || req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    req.body = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const vercelRes = {
    status: (code) => ({
      json: (data) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      },
    }),
    json: (data) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    },
  };

  await handler(req, vercelRes);
}).listen(3001, () => console.log("API proxy on http://localhost:3001"));
