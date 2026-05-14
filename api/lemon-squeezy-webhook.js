import { kv } from "@vercel/kv";
import crypto from "crypto";

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const digest = hmac.digest("hex");
  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(signature, "utf8"));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers["x-signature"];

  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const eventName = req.body?.meta?.event_name;
  const subscriptionData = req.body?.data;

  if (!eventName || !subscriptionData?.id) {
    return res.status(200).json({ received: true });
  }

  const subscriptionId = String(subscriptionData.id);
  const subAttrs = subscriptionData.attributes || {};

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated": {
        const existing = await kv.get(`sub:${subscriptionId}`);
        if (existing?.license_key) {
          await kv.set(`license:${existing.license_key}`, {
            ...existing,
            status: "active",
            expires_at: subAttrs.ends_at || subAttrs.renews_at || null,
          });
          await kv.set(`sub:${subscriptionId}`, {
            ...existing,
            status: "active",
          });
        }
        break;
      }

      case "subscription_cancelled": {
        const existing = await kv.get(`sub:${subscriptionId}`);
        if (existing?.license_key) {
          const lic = await kv.get(`license:${existing.license_key}`) || {};
          await kv.set(`license:${existing.license_key}`, {
            ...lic,
            ...existing,
            status: "cancelled",
            expires_at: subAttrs.ends_at || lic.expires_at,
          });
          await kv.set(`sub:${subscriptionId}`, {
            ...existing,
            status: "cancelled",
          });
        }
        break;
      }

      case "subscription_expired": {
        const existing = await kv.get(`sub:${subscriptionId}`);
        if (existing?.license_key) {
          await kv.del(`license:${existing.license_key}`);
          await kv.del(`sub:${subscriptionId}`);
        }
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(200).json({ received: true });
  }
}
