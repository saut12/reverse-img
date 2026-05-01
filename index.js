const express = require("express");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { Readable } = require("stream");

const streamPipeline = promisify(pipeline);

const app = express();

// 🔥 whitelist domain
const ALLOWED_HOSTS = [
  "sv1.imgkc1.my.id",
  "sv2.imgkc2.my.id",
  "sv3.imgkc3.my.id"
];

app.use("/img", async (req, res) => {
  try {
    const raw = req.originalUrl.replace("/img/", "");

    if (!raw) {
      return res.status(400).send("Missing URL");
    }

    const decoded = decodeURIComponent(raw);
    const imageUrl = decoded.startsWith("http")
      ? decoded
      : "https://" + decoded;

    const urlObj = new URL(imageUrl);

    // 🔥 VALIDASI HOST
if (!ALLOWED_HOSTS.some(h => urlObj.hostname === h)) {
  return res.status(403).send("Forbidden host");
}

if (!["http:", "https:"].includes(urlObj.protocol)) {
  return res.status(400).send("Invalid protocol");
}
    // console.log("Proxy:", imageUrl);

    const response = await fetch(imageUrl, {
      headers: {
        Referer: "https://komikcast.fit/",
        Origin: "https://komikcast.fit",
        "User-Agent": "Mozilla/5.0",
        Accept: "image/webp,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send("Fetch failed");
    }

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "image/jpeg"
    );

    res.setHeader("Cache-Control", "public, max-age=31536000");

    if (!response.body) {
      return res.status(500).send("No body");
    }

    await streamPipeline(
      Readable.fromWeb(response.body),
      res
    );

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).send("Server error");
  }
});

app.listen(3000, () => {
  console.log("http://localhost:3000");
});