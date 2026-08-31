import {
  youtube as abYoutube,
  ttdl,
  tiktok,
  igdl,
  spotify as abSpotify
} from "ab-downloader";
import ytdl from "@distube/ytdl-core";
import Facebook from "facebook-dl";

const fb = new Facebook();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function setCors(res) {
  for (const [key, value] of Object.entries(CORS)) {
    res.setHeader(key, value);
  }
}

function send(res, status, payload) {
  setCors(res);
  return res.status(status).json(payload);
}

function detectPlatform(url) {
  const u = String(url).toLowerCase().trim();

  if (/open\.spotify\.com\/|spotify\.link\//.test(u)) return "spotify";
  if (/instagram\.com\/(p|reel|reels|tv)\//.test(u)) return "instagram";
  if (/facebook\.com\/|fb\.watch\//.test(u)) return "facebook";
  if (/tiktok\.com\/|vm\.tiktok\.com|vt\.tiktok\.com/.test(u)) return "tiktok";
  if (/youtube\.com\/|youtu\.be\//.test(u)) return "youtube";

  return null;
}

function looksSuccessful(value) {
  if (!value) return false;

  if (value.status === false) return false;
  if (value.success === false) return false;

  const stack = [value];
  let foundMedia = false;

  while (stack.length) {
    const current = stack.pop();

    if (!current) continue;

    if (typeof current === "string") {
      if (/^https?:\/\//i.test(current)) foundMedia = true;
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    if (typeof current === "object") {
      for (const [key, val] of Object.entries(current)) {
        const k = key.toLowerCase();

        if (
          typeof val === "string" &&
          /^https?:\/\//i.test(val) &&
          /(url|download|video|audio|link|source)/.test(k)
        ) {
          foundMedia = true;
        }

        if (val && typeof val === "object") stack.push(val);
      }
    }
  }

  return foundMedia || value.status === true;
}

async function youtubeFallback(url) {
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
    thumbnail:
      d.thumbnails?.at(-1)?.url ||
      `https://i.ytimg.com/vi/${d.videoId}/hqdefault.jpg`,
    formats,
    audio
  };
}

async function runPlatform(platform, url) {
  switch (platform) {
    case "youtube": {
      try {
        const result = await abYoutube(url);
        if (looksSuccessful(result)) return result;
      } catch (err) {
        console.warn("[youtube] ab-downloader failed:", err?.message);
      }

      // Fallback to direct format extraction when the universal package
      // returns only {status:true} or an upstream error.
      return await youtubeFallback(url);
    }

    case "tiktok": {
      try {
        const result = await ttdl(url);
        if (looksSuccessful(result)) return result;
      } catch (err) {
        console.warn("[tiktok] ttdl failed:", err?.message);
      }

      const result = await tiktok(url);
      if (!looksSuccessful(result)) {
        throw new Error("TikTok provider returned no media URL.");
      }
      return result;
    }

    case "instagram": {
      const result = await igdl(url);
      if (!looksSuccessful(result)) {
        throw new Error("Instagram provider returned no media URL.");
      }
      return result;
    }

    case "facebook": {
      const result = await fb.fbdl(url);
      if (!result || result.code !== 200 || !looksSuccessful(result.results)) {
        throw new Error(
          result?.results?.message ||
          result?.message ||
          "Facebook provider returned no media URL."
        );
      }
      return result.results;
    }

    case "spotify": {
      const result = await abSpotify(url);
      if (!looksSuccessful(result)) {
        throw new Error("Spotify provider returned no usable result.");
      }
      return result;
    }

    default:
      throw new Error("Unsupported platform");
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!["GET", "POST"].includes(req.method)) {
    return send(res, 405, {
      status: false,
      error: "Method not allowed"
    });
  }

  try {
    const body =
      req.method === "GET"
        ? req.query || {}
        : typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

    const url = String(body.url || "").trim();
    const requested = String(body.platform || "auto").toLowerCase();

    if (!url) {
      return send(res, 400, {
        status: false,
        error: "url is required"
      });
    }

    const detected = detectPlatform(url);
    const platform = requested === "auto" ? detected : requested;

    if (!platform) {
      return send(res, 400, {
        status: false,
        error: "Unsupported URL",
        supported: ["youtube", "tiktok", "instagram", "facebook", "spotify"]
      });
    }

    if (!["youtube", "tiktok", "instagram", "facebook", "spotify"].includes(platform)) {
      return send(res, 400, {
        status: false,
        error: "Unsupported platform"
      });
    }

    if (detected && requested !== "auto" && detected !== platform) {
      return send(res, 400, {
        status: false,
        error: `URL belongs to ${detected}, not ${platform}`
      });
    }

    const data = await runPlatform(platform, url);

    if (!looksSuccessful(data)) {
      return send(res, 502, {
        status: false,
        platform,
        error: "Provider returned an unusable response."
      });
    }

    return send(res, 200, {
      status: true,
      platform,
      data
    });
  } catch (err) {
    console.error("[download]", err);

    return send(res, 502, {
      status: false,
      error: err?.message || "Downloader provider failed"
    });
  }
}
