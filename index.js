const express = require("express");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { Readable } = require("stream");

const streamPipeline = promisify(pipeline);

const app = express();

app.use("/img", async (req, res) => {
  try {
    // 🔥 ambil full URL setelah /img/
    const raw = req.originalUrl.replace("/img/", "");

    if (!raw) {
      return res.status(400).send("Missing URL");
    }

    // 🔥 decode (penting kalau ada encode)
    const decoded = decodeURIComponent(raw);

    // 🔥 pastikan gak rusak
    const imageUrl = decoded.startsWith("http")
      ? decoded
      : "https://" + decoded;

    console.log("Proxy:", imageUrl);

    const response = await fetch(imageUrl, {
      headers: {
        Referer: "https://komikcast.fit/",
        Origin: "https://komikcast.fit",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    console.log("Status:", response.status);

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