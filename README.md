# Universal Downloader V8

V8 fixes the response validation bug from V7.

Some provider objects can contain extra properties with `undefined` values.
`Object.keys()` counts those properties even though JSON.stringify() omits
them. That made a provider response like:

{ developer: "BOTCAHX", status: true }

look successful to the old validator.

V8 instead recursively checks for a real HTTP media URL before returning
status:true.

It also sends Cache-Control: no-store so API responses are not reused as
cached data during testing.

First test:
GET /api/health

Expected version:
8.0.0

Then:
GET /api/download?url=https%3A%2F%2Fyoutu.be%2FPDU31zRp7Ng

If the upstream YouTube provider returns only metadata/status and no media
URL, V8 returns HTTP 502 instead of falsely reporting success.
