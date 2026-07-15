const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const compression = require("compression");
const sharp = require("sharp");

const PORT = process.env.PORT || 4173;
const SCRAPER_OUTPUT = process.env.SCRAPER_OUTPUT || path.join(__dirname, "..", "output");
const MANIFEST_PATH = path.join(SCRAPER_OUTPUT, "manifest.json");
const THEME_CACHE_PATH = path.join(__dirname, "theme-cache.json");

// Below this perceptual luminance (0-255) a thumbnail counts as "dark".
const DARK_LUMINANCE_THRESHOLD = 128;

let themeCache = {};
try {
  themeCache = JSON.parse(fs.readFileSync(THEME_CACHE_PATH, "utf-8"));
} catch {
  themeCache = {};
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Classifies a screenshot as light/dark UI by its average perceptual
// luminance. Cached to disk by relative path since screenshots never change
// once scraped, so repeat server starts don't re-decode every image.
async function classifyTheme(relPath) {
  if (themeCache[relPath]) return themeCache[relPath];
  try {
    const stats = await sharp(path.join(SCRAPER_OUTPUT, relPath)).stats();
    const [r, g, b] = stats.channels;
    const luminance = 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
    const theme = luminance < DARK_LUMINANCE_THRESHOLD ? "dark" : "light";
    themeCache[relPath] = theme;
    return theme;
  } catch {
    return null;
  }
}

// Prefer a screenshot titled exactly "Home", then anything home-ish, then just
// fall back to the first screenshot of the app's richest flow. Also used as
// the basis for that app's dark/light theme classification.
function pickThumbnail(app) {
  const allShots = app.flows.flatMap((f) => f.screenshots);
  if (allShots.length === 0) return null;

  const toThumb = (s) => ({ url: s.url, relPath: s.url.replace(/^\/screenshots\//, "") });

  const exact = allShots.find((s) => /^home$/i.test(s.title.trim()));
  if (exact) return toThumb(exact);

  const homeish = allShots.find((s) => /home/i.test(s.title));
  if (homeish) return toThumb(homeish);

  const richestFlow = app.flows.slice().sort((a, b) => b.screenshotCount - a.screenshotCount)[0];
  return toThumb(richestFlow.screenshots[0]);
}

async function loadApps() {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const byApp = new Map();

  for (const entry of raw) {
    if (!byApp.has(entry.appSlug)) {
      byApp.set(entry.appSlug, {
        appSlug: entry.appSlug,
        appName: entry.appName,
        flowCount: 0,
        screenshotCount: 0,
        flows: [],
      });
    }
    const app = byApp.get(entry.appSlug);
    app.flowCount += 1;
    app.screenshotCount += entry.screenshotCount;
    app.flows.push({
      flowSlug: entry.flowSlug,
      flowTitle: entry.flowTitle,
      pageUrl: entry.pageUrl,
      screenshotCount: entry.screenshotCount,
      screenshots: entry.screenshots
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          order: s.order,
          title: s.title,
          url: `/screenshots/${entry.appSlug}/${entry.flowSlug}/${s.file}`,
        })),
    });
  }

  const appList = [...byApp.values()];

  await mapWithConcurrency(appList, 16, async (app) => {
    const thumb = pickThumbnail(app);
    app.thumbnailUrl = thumb ? thumb.url : null;
    app.theme = thumb ? await classifyTheme(thumb.relPath) : null;
  });

  fs.writeFileSync(THEME_CACHE_PATH, JSON.stringify(themeCache));

  return appList.sort((a, b) => a.appName.localeCompare(b.appName));
}

let apps = [];

const app = express();
app.use(compression());

app.get("/api/apps", (req, res) => {
  res.json(
    apps.map(({ appSlug, appName, flowCount, screenshotCount, thumbnailUrl, theme }) => ({
      appSlug,
      appName,
      flowCount,
      screenshotCount,
      thumbnailUrl,
      theme,
    }))
  );
});

app.get("/api/apps/:appSlug", (req, res) => {
  const found = apps.find((a) => a.appSlug === req.params.appSlug);
  if (!found) return res.status(404).json({ error: "not found" });
  res.json(found);
});

app.get("/api/reload", async (req, res) => {
  apps = await loadApps();
  res.json({ ok: true, apps: apps.length });
});

app.use(
  "/screenshots",
  express.static(SCRAPER_OUTPUT, {
    maxAge: "7d",
    setHeaders: (res) => res.set("Cross-Origin-Resource-Policy", "cross-origin"),
  })
);

app.use(express.static(path.join(__dirname, "public")));

async function start() {
  const t0 = Date.now();
  apps = await loadApps();
  const dark = apps.filter((a) => a.theme === "dark").length;
  const light = apps.filter((a) => a.theme === "light").length;
  console.log(
    `Loaded ${apps.length} apps, ${apps.reduce((s, a) => s + a.flowCount, 0)} flows, ${apps.reduce(
      (s, a) => s + a.screenshotCount,
      0
    )} screenshots from ${SCRAPER_OUTPUT} (${light} light, ${dark} dark, in ${Date.now() - t0}ms)`
  );
  app.listen(PORT, () => {
    console.log(`Pageflows gallery running at http://localhost:${PORT}`);
  });
}

start();
