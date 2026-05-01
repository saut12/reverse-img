const express = require("express");
const { pipeline } = require("stream");
const { Readable, PassThrough } = require("stream");
const { promisify } = require("util");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const streamPipeline = promisify(pipeline);

// =========================
// CONFIG
// =========================
const ALLOWED_HOSTS = [
  "sv1.imgkc1.my.id",
  "sv2.imgkc2.my.id",
  "sv3.imgkc3.my.id"
];

const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

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

function isExpired(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs > CACHE_TTL;
  } catch {
    return true;
  }
}

// =========================
// CORE HANDLER
// =========================
async function handleRequest(imageUrl, req, res) {
  try {
    if (!imageUrl) {
      return res.status(400).send("Missing ?url=");
    }

    let urlObj;
    try {
      urlObj = new URL(imageUrl);
    } catch {
      return res.status(400).send("Invalid URL");
    }

    // whitelist host
    if (!ALLOWED_HOSTS.includes(urlObj.hostname)) {
      return res.status(403).send("Forbidden host");
    }

    const key = makeKey(imageUrl);
    const filePath = getFilePath(key);

    // =========================
    // CACHE HIT
    // =========================
    if (fs.existsSync(filePath) && !isExpired(filePath)) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=300, immutable");
      res.setHeader("X-Cache-Key", key);

      return fs.createReadStream(filePath).pipe(res);
    }

    // expired cleanup
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // =========================
    // FETCH ORIGIN
    // =========================
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=300, immutable");
    res.setHeader("X-Cache-Key", key);

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

    const fileStream = fs.createWriteStream(filePath);
    const passThrough = new PassThrough();

    // stream ke client + save ke disk sekaligus
    nodeStream.pipe(passThrough);
    nodeStream.pipe(fileStream);

    await streamPipeline(passThrough, res);

  } catch (err) {
    console.error("ERROR:", err);
    if (!res.headersSent) {
      res.status(500).send("Server error");
    }
  }
}

// =========================
// ROUTE CDN
// =========================
app.get("/img", async (req, res) => {
  return handleRequest(req.query.url, req, res);
});

// =========================
// START SERVER
// =========================
app.listen(3000, () => {
  console.log("🚀 Mini CDN running:");
});