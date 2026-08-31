const PROVIDERS = {
  youtube: "youtube",
  tiktok: "ttdl",
  instagram: "igdl",
  facebook: "fbdown",
  spotify: "spotify"
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, code, body) {
  cors(res);
  return res.status(code).json(body);
}

function detect(url) {
  const u = String(url).toLowerCase();
  if (/youtube\.com\/|youtu\.be\//.test(u)) return "youtube";
  if (/tiktok\.com\/|vm\.tiktok\.com|vt\.tiktok\.com/.test(u)) return "tiktok";
  if (/instagram\.com\/(p|reel|reels|tv)\//.test(u)) return "instagram";
  if (/facebook\.com\/|fb\.watch\//.test(u)) return "facebook";
  if (/open\.spotify\.com\/|spotify\.link\//.test(u)) return "spotify";
  return null;
}

function getBody(req) {
  if (req.method === "GET") return req.query || {};
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

/*
 * Important fix:
 * Some providers return objects containing extra properties whose values
 * are undefined. Object.keys() therefore cannot be used to decide whether
 * media exists. We explicitly search for real HTTP media URLs instead.
 */
function findMedia(value, depth = 0) {
  if (depth > 8 || value == null) return false;

  if (typeof value === "string") {
    return /^https?:\/\/\S+/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(v => findMedia(v, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value).some(([key, val]) => {
      if (typeof val === "string" && /^https?:\/\/\S+/i.test(val)) {
        const k = key.toLowerCase();
        return /url|download|link|source|video|audio|media/.test(k) || true;
      }
      return findMedia(val, depth + 1);
    });
  }

  return false;
}

function providerSucceeded(result) {
  if (!result || result.status === false || result.success === false) {
    return false;
  }

  return findMedia(result);
}

async function loadProvider() {
  const mod = await import("btch-downloader");
  return mod;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!["GET", "POST"].includes(req.method)) {
    return send(res, 405, {
      status: false,
      error: "Method not allowed",
      version: "8.0.0"
    });
  }

  try {
    const body = getBody(req);
    const url = String(body.url || "").trim();

    if (!url) {
      return send(res, 400, {
        status: false,
        error: "url is required",
        version: "8.0.0"
      });
    }

    const detected = detect(url);
    const requested = String(body.platform || "auto").toLowerCase();
    const platform = requested === "auto" ? detected : requested;

    if (!platform || !PROVIDERS[platform]) {
      return send(res, 400, {
        status: false,
        error: "Unsupported URL or platform",
        supported: Object.keys(PROVIDERS),
        version: "8.0.0"
      });
    }

    let provider;
    try {
      provider = await loadProvider();
    } catch (e) {
      console.error("[provider-load]", e);
      return send(res, 500, {
        status: false,
        error: "Downloader package failed to load",
        detail: e?.message || String(e),
        version: "8.0.0"
      });
    }

    const fnName = PROVIDERS[platform];
    const fn = provider[fnName] || provider.default?.[fnName];

    if (typeof fn !== "function") {
      return send(res, 500, {
        status: false,
        platform,
        error: `Provider function '${fnName}' is unavailable`,
        version: "8.0.0"
      });
    }

    let result;
    try {
      result = await fn(url);
    } catch (e) {
      console.error(`[provider:${platform}]`, e);
      return send(res, 502, {
        status: false,
        platform,
        error: e?.message || "Provider request failed",
        version: "8.0.0"
      });
    }

    if (!providerSucceeded(result)) {
      return send(res, 502, {
        status: false,
        platform,
        error: "Provider returned no media URL",
        provider: result,
        version: "8.0.0"
      });
    }

    return send(res, 200, {
      status: true,
      platform,
      data: result,
      version: "8.0.0"
    });
  } catch (e) {
    console.error("[handler]", e);
    return send(res, 500, {
      status: false,
      error: e?.message || "Internal server error",
      version: "8.0.0"
    });
  }
}
