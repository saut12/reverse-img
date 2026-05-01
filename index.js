const express = require("express");
const { Readable } = require("stream");

const app = express();

const ALLOWED_HOSTS = [
  "sv1.imgkc1.my.id",
  "sv2.imgkc2.my.id",
  "sv3.imgkc3.my.id"
];

// safety crash handler
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

app.get("/img", async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("Missing url");

    const urlObj = new URL(imageUrl);
    if (!ALLOWED_HOSTS.includes(urlObj.hostname)) {
      return res.status(403).send("Forbidden host");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        Referer: "https://komikcast.fit/",
        Origin: "https://komikcast.fit",
        "User-Agent": "Mozilla/5.0"
      }
    });

    clearTimeout(timeout);

    if (!upstream || !upstream.ok || !upstream.body) {
      return res.status(502).send("Fetch failed");
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    const nodeStream = Readable.fromWeb
      ? Readable.fromWeb(upstream.body)
      : Readable.from(upstream.body);

    nodeStream.pipe(res);

  } catch (err) {
    console.error("ERROR:", err);

    if (!res.headersSent) {
      res.status(500).send("Server error");
    }
  }
});

app.listen(3000, () => {
  console.log("🚀 Stable proxy running on :3000");
});