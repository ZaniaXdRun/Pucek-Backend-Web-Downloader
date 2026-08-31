const PROVIDERS = {
  youtube: "youtube",
  tiktok: "ttdl",
  instagram: "igdl",
  facebook: "fbdown",
  spotify: "spotify"
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function reply(res, code, data) {
  cors(res);
  return res.status(code).json(data);
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

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function usable(data) {
  if (data == null) return false;
  if (data.status === false || data.success === false) return false;

  // Do not accept a useless bare { status: true } response.
  if (
    data.status === true &&
    Object.keys(data).length <= 2 &&
    !data.url &&
    !data.data &&
    !data.result &&
    !data.results &&
    !data.download
  ) {
    return false;
  }

  return true;
}

async function loadProvider() {
  const mod = await import("btch-downloader");

  // Handles both CommonJS and ESM package export shapes.
  if (mod.default && typeof mod.default === "object") {
    return { ...mod.default, ...mod };
  }

  return mod;
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return reply(res, 405, {
      status: false,
      error: "Method not allowed"
    });
  }

  try {
    const body = getBody(req);
    const url = String(body.url || "").trim();

    if (!url) {
      return reply(res, 400, {
        status: false,
        error: "url is required"
      });
    }

    const detected = detect(url);
    const requested = String(body.platform || "auto").toLowerCase();
    const platform = requested === "auto" ? detected : requested;

    if (!platform || !PROVIDERS[platform]) {
      return reply(res, 400, {
        status: false,
        error: "Unsupported URL or platform",
        supported: Object.keys(PROVIDERS)
      });
    }

    if (requested !== "auto" && detected && detected !== platform) {
      return reply(res, 400, {
        status: false,
        error: `URL belongs to ${detected}, not ${platform}`
      });
    }

    let provider;

    try {
      provider = await loadProvider();
    } catch (err) {
      console.error("[provider-load]", err);
      return reply(res, 500, {
        status: false,
        error: "Downloader package failed to load",
        detail: err?.message || String(err)
      });
    }

    const fnName = PROVIDERS[platform];
    const fn = provider[fnName];

    if (typeof fn !== "function") {
      return reply(res, 500, {
        status: false,
        platform,
        error: `Provider function '${fnName}' is unavailable`
      });
    }

    let result;

    try {
      result = await fn(url);
    } catch (err) {
      console.error(`[provider:${platform}]`, err);
      return reply(res, 502, {
        status: false,
        platform,
        error: err?.message || "Provider request failed"
      });
    }

    if (!usable(result)) {
      return reply(res, 502, {
        status: false,
        platform,
        error: "Provider returned no usable result",
        provider: result
      });
    }

    return reply(res, 200, {
      status: true,
      platform,
      data: result
    });
  } catch (err) {
    console.error("[handler]", err);

    return reply(res, 500, {
      status: false,
      error: err?.message || "Internal server error"
    });
  }
};
