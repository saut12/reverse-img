const express = require("express");
const { pipeline } = require("stream");
const { Readable, PassThrough } = require("stream");
const { promisify } = require("util");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const streamPipeline = promisify(pipeline);
const app = express();

// =========================
// CONFIG
// =========================
const ALLOWED_HOSTS = [
  "sv1.imgkc1.my.id",
  "sv2.imgkc2.my.id",
  "sv3.imgkc3.my.id"
];

const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_TTL = 5 * 60 * 1000; // 🔥 5 menit

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// =========================
// UTIL
// =========================
function makeKey(url) {
  return crypto.createHash("md5").update(url).digest("hex");
}

function getFilePath(key) {
  return path.join(CACHE_DIR, key);
}

// cek expired pakai mtime
function isExpired(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs > CACHE_TTL;
  } catch {
    return true;
  }
}

// =========================
// ROUTE
// =========================
app.use("/img", async (req, res) => {
  try {
    const raw = req.originalUrl.replace("/img/", "");

    if (!raw) return res.status(400).send("Missing URL");

    const decoded = decodeURIComponent(raw);
    const imageUrl = decoded.startsWith("http")
      ? decoded
      : "https://" + decoded;

    const urlObj = new URL(imageUrl);

    if (!ALLOWED_HOSTS.includes(urlObj.hostname)) {
      return res.status(403).send("Forbidden host");
    }

    const key = makeKey(imageUrl);
    const filePath = getFilePath(key);

    // =========================
    // CACHE HIT (valid + not expired)
    // =========================
    if (fs.existsSync(filePath) && !isExpired(filePath)) {
      res.setHeader("X-Cache", "HIT-VPS");
      res.setHeader("Cache-Control", "public, max-age=300"); // 5 menit

      return fs.createReadStream(filePath).pipe(res);
    }

    // kalau expired → hapus
    if (fs.existsSync(filePath) && isExpired(filePath)) {
      fs.unlinkSync(filePath);
    }

    // =========================
    // MISS → FETCH ORIGIN
    // =========================
    res.setHeader("X-Cache", "MISS-VPS");
    res.setHeader("Cache-Control", "public, max-age=300");

    const upstream = await fetch(imageUrl, {
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

    const nodeStream = Readable.fromWeb(upstream.body);

    // =========================
    // STREAM + SAVE TO DISK
    // =========================
    const fileStream = fs.createWriteStream(filePath);
    const passThrough = new PassThrough();

    nodeStream.pipe(passThrough);
    nodeStream.pipe(fileStream);

    await streamPipeline(passThrough, res);

  } catch (err) {
    console.error("ERROR:", err);
    if (!res.headersSent) {
      res.status(500).send("Server error");
    }
  }
});

// =========================
app.listen(3000, () => {
  console.log("Mini CDN (5 min cache) running on http://localhost:3000");
});