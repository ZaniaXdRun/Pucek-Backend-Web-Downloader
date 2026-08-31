# Universal Downloader V7

The API is consistently ESM. package.json uses type=module and both API
functions use export default.

Replace the repository contents and create a NEW Vercel deployment.

Test first:
GET /api/health

Expected:
{"status":true,"service":"universal-downloader","version":"7.0.0","runtime":"v20.x"}

Then:
GET /api/download?url=https%3A%2F%2Fyoutu.be%2FPDU31zRp7Ng

Supported: youtube, tiktok, instagram, facebook, spotify.

Vercel automatically installs package.json.
