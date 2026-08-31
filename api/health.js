export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.status(200).json({
    status: true,
    service: "universal-downloader",
    version: "8.0.0",
    runtime: process.version
  });
}
