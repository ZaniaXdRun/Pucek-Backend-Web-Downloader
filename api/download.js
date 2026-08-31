const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function cors(res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
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

function providerOk(data) {
  if (data == null) return false;
  if (data.status === false || data.success === false) return false;

  // A bare {status:true} is not an extracted result.
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

function getBody(req) {
  if (req.method === "GET") return req.query || {};

  if (!req.body) return {};

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

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

    const supported = [
      "youtube",
      "tiktok",
      "instagram",
      "facebook",
      "spotify"
    ];

    if (!platform || !supported.includes(platform)) {
      return reply(res, 400, {
        status: false,
        error: "Unsupported URL or platform",
        supported
      });
    }

    if (requested !== "auto" && detected && detected !== platform) {
      return reply(res, 400, {
        status: false,
        error: `URL belongs to ${detected}, not ${platform}`
      });
    }

    // Load the provider only when this endpoint is actually invoked.
    const btch = require("btch-downloader");

    const fnMap = {
      youtube: "youtube",
      tiktok: "ttdl",
      instagram: "igdl",
      facebook: "fbdown",
      spotify: "spotify"
    };

    const fn = btch[fnMap[platform]];

    if (typeof fn !== "function") {
      return reply(res, 500, {
        status: false,
        platform,
        error: `Provider function ${fnMap[platform]} is unavailable`
      });
    }

    const result = await fn(url);

    if (!providerOk(result)) {
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
    console.error("[download]", err);

    return reply(res, 502, {
      status: false,
      error: err?.message || "Downloader provider failed"
    });
  }
};
