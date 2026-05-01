const express = require("express");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { Readable } = require("stream");

const streamPipeline = promisify(pipeline);
const app = express();

const ALLOWED_HOSTS = [
  "sv1.imgkc1.my.id",
  "sv2.imgkc2.my.id",
  "sv3.imgkc3.my.id"
];

app.use("/img", async (req, res) => {
  let upstream;

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

    if (!ALLOWED_HOSTS.includes(urlObj.hostname)) {
      return res.status(403).send("Forbidden host");
    }

    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return res.status(400).send("Invalid protocol");
    }

    upstream = await fetch(imageUrl, {
      headers: {
        Referer: "https://komikcast.fit/",
        Origin: "https://komikcast.fit",
        "User-Agent": "Mozilla/5.0",
        Accept: "image/webp,image/*,*/*;q=0.8"
      }
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send("Fetch failed");
    }

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "image/jpeg"
    );

    res.setHeader("Cache-Control", "public, max-age=31536000");

    // 🔥 handle client disconnect
    req.on("close", () => {
      try {
        upstream?.body?.cancel?.();
      } catch {}
    });

    await streamPipeline(
      Readable.fromWeb(upstream.body),
      res
    );

    // ❌ JANGAN ADA res.send / res.json di sini
  } catch (err) {
    console.error("ERROR:", err);

    if (!res.headersSent) {
      res.status(500).send("Server error");
    }

    try {
      upstream?.body?.cancel?.();
    } catch {}
  }
});

app.listen(3000, () => {
  console.log("http://localhost:3000");
});  