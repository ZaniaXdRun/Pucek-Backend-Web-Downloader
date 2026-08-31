# Universal Downloader Backend for Vercel

This backend uses the `btch-downloader` npm package instead of implementing
individual site scrapers in the project.

Supported adapters included here:
- YouTube
- TikTok
- Instagram
- Facebook
- Spotify

## Deploy

1. Upload this folder to GitHub.
2. Import the repository into Vercel.
3. Deploy with Node.js 20+.
4. Endpoint:

POST https://YOUR-DOMAIN.vercel.app/api/download

JSON body:

{
  "url": "https://www.youtube.com/watch?v=..."
}

Optional platform:

{
  "url": "https://...",
  "platform": "youtube"
}

`platform` can be:
youtube, tiktok, instagram, facebook, spotify

GET is also supported:

/api/download?url=https://...

The backend returns the package response under `data`.

## Frontend example

```js
const r = await fetch("https://YOUR-DOMAIN.vercel.app/api/download", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url })
});

const result = await r.json();
console.log(result);
```

Notes:
- The npm package currently documents Node.js v20+.
- Returned media URLs may expire and should not be treated as permanent storage URLs.
- The package itself handles the upstream provider logic; this API only dispatches and normalizes requests.
