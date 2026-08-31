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

function usable(x) {
  if (x == null || x.status === false || x.success === false) return false;
  if (x.status === true && Object.keys(x).length <= 2 &&
      !x.url && !x.data && !x.result && !x.results && !x.download) return false;
  return true;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method))
    return send(res, 405, { status: false, error: "Method not allowed" });

  try {
    const body = getBody(req);
    const url = String(body.url || "").trim();
    if (!url) return send(res, 400, { status: false, error: "url is required" });

    const detected = detect(url);
    const requested = String(body.platform || "auto").toLowerCase();
    const platform = requested === "auto" ? detected : requested;

    if (!platform || !PROVIDERS[platform]) {
      return send(res, 400, {
        status: false,
        error: "Unsupported URL or platform",
        supported: Object.keys(PROVIDERS)
      });
    }

    if (requested !== "auto" && detected && requested !== detected) {
      return send(res, 400, {
        status: false,
        error: `URL belongs to ${detected}, not ${requested}`
      });
    }

    let provider;
    try {
      provider = await import("btch-downloader");
    } catch (e) {
      console.error("[provider-load]", e);
      return send(res, 500, {
        status: false,
        error: "Downloader package failed to load",
        detail: e?.message || String(e)
      });
    }

    const fnName = PROVIDERS[platform];
    const fn = provider[fnName] || provider.default?.[fnName];

    if (typeof fn !== "function") {
      return send(res, 500, {
        status: false,
        platform,
        error: `Provider function '${fnName}' is unavailable`
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
        error: e?.message || "Provider request failed"
      });
    }

    if (!usable(result)) {
      return send(res, 502, {
        status: false,
        platform,
        error: "Provider returned no usable result",
        provider: result
      });
    }

    return send(res, 200, { status: true, platform, data: result });
  } catch (e) {
    console.error("[handler]", e);
    return send(res, 500, {
      status: false,
      error: e?.message || "Internal server error"
    });
  }
}
