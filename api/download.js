const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function headers(res) {
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
}

function send(res, code, data) {
  headers(res);
  return res.status(code).json(data);
}

function detect(url) {
  const u = String(url).toLowerCase();

  if (/open\.spotify\.com\/|spotify\.link\//.test(u)) return "spotify";
  if (/instagram\.com\/(p|reel|reels|tv)\//.test(u)) return "instagram";
  if (/facebook\.com\/|fb\.watch\//.test(u)) return "facebook";
  if (/tiktok\.com\/|vm\.tiktok\.com|vt\.tiktok\.com/.test(u)) return "tiktok";
  if (/youtube\.com\/|youtu\.be\//.test(u)) return "youtube";

  return null;
}

function validResult(value) {
  if (value == null) return false;
  if (value.status === false || value.success === false) return false;

  // Provider responses such as { status: true } are not useful by themselves.
  if (
    value.status === true &&
    Object.keys(value).length <= 2 &&
    !value.url &&
    !value.data &&
    !value.result &&
    !value.results
  ) {
    return false;
  }

  return true;
}

async function loadAb() {
  // Lazy loading prevents an unused provider from crashing the function
  // during cold start.
  return await import("ab-downloader");
}

async function youtube(url) {
  try {
    const ab = await loadAb();
    if (typeof ab.youtube === "function") {
      const result = await ab.youtube(url);
      if (validResult(result)) return result;
    }
  } catch (e) {
    console.error("[youtube/ab]", e.message);
  }

  const ytdl = require("@distube/ytdl-core");
  const info = await ytdl.getInfo(url);
  const d = info.videoDetails;

  const formats = ytdl
    .filterFormats(info.formats, "videoandaudio")
    .filter(f => f.container === "mp4" && f.url)
    .map(f => ({
      itag: f.itag,
      quality: f.qualityLabel || null,
      mimeType: f.mimeType || null,
      container: f.container || null,
      hasAudio: !!f.hasAudio,
      hasVideo: !!f.hasVideo,
      url: f.url
    }));

  const audio = ytdl
    .filterFormats(info.formats, "audioonly")
    .filter(f => f.url)
    .map(f => ({
      itag: f.itag,
      quality: f.audioQuality || null,
      bitrate: f.bitrate || null,
      mimeType: f.mimeType || null,
      container: f.container || null,
      url: f.url
    }));

  return {
    id: d.videoId,
    title: d.title,
    author: d.author?.name || null,
    duration: d.lengthSeconds,
    thumbnail: d.thumbnails?.at(-1)?.url ||
      `https://i.ytimg.com/vi/${d.videoId}/hqdefault.jpg`,
    formats,
    audio
  };
}

async function universal(platform, url) {
  const ab = await loadAb();

  const map = {
    tiktok: "ttdl",
    instagram: "igdl",
    facebook: "fbdown",
    spotify: "spotify"
  };

  const fnName = map[platform];
  const fn = ab[fnName];

  if (typeof fn !== "function") {
    throw new Error(`Provider function ${fnName} is unavailable.`);
  }

  const result = await fn(url);

  if (!validResult(result)) {
    throw new Error(
      `${platform} provider returned an unusable response.`
    );
  }

  return result;
}

async function facebookFallback(url) {
  const Facebook = require("facebook-dl");
  const api = new Facebook();
  const result = await api.fbdl(url);

  if (!result || result.code !== 200 || !result.results) {
    throw new Error(
      result?.results?.message ||
      result?.message ||
      "Facebook provider returned no result."
    );
  }

  return result.results;
}

module.exports = async function handler(req, res) {
  headers(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET" && req.method !== "POST") {
    return send(res, 405, {
      status: false,
      error: "Method not allowed"
    });
  }

  try {
    let body;

    if (req.method === "GET") {
      body = req.query || {};
    } else {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};
    }

    const url = String(body.url || "").trim();

    if (!url) {
      return send(res, 400, {
        status: false,
        error: "url is required"
      });
    }

    const requested = String(body.platform || "auto").toLowerCase();
    const detected = detect(url);
    const platform = requested === "auto" ? detected : requested;

    const supported = [
      "youtube",
      "tiktok",
      "instagram",
      "facebook",
      "spotify"
    ];

    if (!platform || !supported.includes(platform)) {
      return send(res, 400, {
        status: false,
        error: "Unsupported URL or platform",
        supported
      });
    }

    if (detected && requested !== "auto" && detected !== platform) {
      return send(res, 400, {
        status: false,
        error: `URL belongs to ${detected}, not ${platform}`
      });
    }

    let data;

    if (platform === "youtube") {
      data = await youtube(url);
    } else {
      try {
        data = await universal(platform, url);
      } catch (e) {
        if (platform === "facebook") {
          data = await facebookFallback(url);
        } else {
          throw e;
        }
      }
    }

    if (!validResult(data)) {
      return send(res, 502, {
        status: false,
        platform,
        error: "Provider returned no usable result."
      });
    }

    return send(res, 200, {
      status: true,
      platform,
      data
    });
  } catch (e) {
    console.error("[download]", e);

    return send(res, 502, {
      status: false,
      error: e?.message || "Downloader provider failed"
    });
  }
};
