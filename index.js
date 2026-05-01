const express = require("express");
const { Readable } = require("stream");

const app = express();

const ORIGINS = [
  "https://sv1.imgkc1.my.id",
  "https://sv2.imgkc2.my.id",
  "https://sv3.imgkc3.my.id"
];

let index = 0;
function getOrigin() {
  const origin = ORIGINS[index];
  index = (index + 1) % ORIGINS.length;
  return origin;
}

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// =========================
// NO ROUTE PARAMS (IMPORTANT)
// =========================
app.use("/img", async (req, res) => {
  try {
    // ambil full path setelah /img
    const path = req.originalUrl.replace("/img/", "");

    if (!path || path === "/img") {
      return res.status(400).send("Missing path");
    }

    const origin = getOrigin();
    const imageUrl = `${origin}/${path}`;

    const upstream = await fetch(imageUrl, {
      headers: {
        Referer: "https://komikcast.fit/",
        Origin: "https://komikcast.fit",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send("Fetch failed");
    }

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "image/jpeg"
    );

    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    const stream = Readable.fromWeb
      ? Readable.fromWeb(upstream.body)
      : Readable.from(upstream.body);

    stream.pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.listen(3000, () => {
  console.log("🚀 Stable Proxy (NO ROUTE PARAM) running on :3000");
});