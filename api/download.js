import {
  igdl,
  ttdl,
  fbdown,
  youtube,
  spotify
} from "btch-downloader";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function send(res, status, payload) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(status).json(payload);
}

function detectPlatform(url) {
  const u = String(url).toLowerCase();

  if (/instagram\.com\/(p|reel|tv)\//.test(u)) return "instagram";
  if (/facebook\.com\/|fb\.watch\//.test(u)) return "facebook";
  if (/tiktok\.com\/|vm\.tiktok\.com|vt\.tiktok\.com/.test(u)) return "tiktok";
  if (/youtube\.com\/|youtu\.be\//.test(u)) return "youtube";
  if (/open\.spotify\.com\/|spotify\.link\//.test(u)) return "spotify";

  return null;
}

function normalizeResult(platform, result) {
  return {
    status: true,
    platform,
    data: result
  };
}

const handlers = {
  instagram: igdl,
  tiktok: ttdl,
  facebook: fbdown,
  youtube,
  spotify
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!["GET", "POST"].includes(req.method)) {
    return send(res, 405, {
      status: false,
      error: "Method not allowed"
    });
  }

  try {
    let body = {};

    if (req.method === "GET") {
      body = req.query || {};
    } else {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};
    }

    const url = String(body.url || "").trim();
    const requestedPlatform = String(body.platform || "auto").toLowerCase();

    if (!url) {
      return send(res, 400, {
        status: false,
        error: "url is required"
      });
    }

    let platform =
      requestedPlatform === "auto"
        ? detectPlatform(url)
        : requestedPlatform;

    if (!platform || !handlers[platform]) {
      return send(res, 400, {
        status: false,
        error: "Unsupported platform",
        supported: Object.keys(handlers)
      });
    }

    if (requestedPlatform !== "auto") {
      const detected = detectPlatform(url);
      if (detected && detected !== platform) {
        return send(res, 400, {
          status: false,
          error: `URL belongs to ${detected}, not ${platform}`
        });
      }
    }

    const result = await handlers[platform](url);

    if (!result) {
      return send(res, 502, {
        status: false,
        platform,
        error: "Downloader returned an empty response"
      });
    }

    return send(res, 200, normalizeResult(platform, result));
  } catch (error) {
    console.error("[download]", error);

    return send(res, 500, {
      status: false,
      error: error?.message || "Downloader failed"
    });
  }
}
