export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: true,
    service: "universal-downloader",
    version: "7.0.0",
    runtime: process.version
  });
}
