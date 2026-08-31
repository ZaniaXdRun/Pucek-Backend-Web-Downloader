module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: true,
    service: "universal-downloader",
    runtime: process.version,
    time: new Date().toISOString()
  });
};
