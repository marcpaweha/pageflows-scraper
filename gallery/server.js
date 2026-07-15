const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const compression = require("compression");

const PORT = process.env.PORT || 4173;
const SCRAPER_OUTPUT = process.env.SCRAPER_OUTPUT || path.join(__dirname, "..", "output");
const MANIFEST_PATH = path.join(SCRAPER_OUTPUT, "manifest.json");

function loadApps() {
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

  for (const app of byApp.values()) {
    app.thumbnailUrl = pickThumbnail(app);
  }

  return [...byApp.values()].sort((a, b) => a.appName.localeCompare(b.appName));
}

// Prefer a screenshot titled exactly "Home", then anything home-ish, then just
// fall back to the first screenshot of the app's richest flow.
function pickThumbnail(app) {
  const allShots = app.flows.flatMap((f) => f.screenshots);
  if (allShots.length === 0) return null;

  const exact = allShots.find((s) => /^home$/i.test(s.title.trim()));
  if (exact) return exact.url;

  const homeish = allShots.find((s) => /home/i.test(s.title));
  if (homeish) return homeish.url;

  const richestFlow = app.flows.slice().sort((a, b) => b.screenshotCount - a.screenshotCount)[0];
  return richestFlow.screenshots[0].url;
}

let apps = loadApps();
console.log(
  `Loaded ${apps.length} apps, ${apps.reduce((s, a) => s + a.flowCount, 0)} flows, ${apps.reduce(
    (s, a) => s + a.screenshotCount,
    0
  )} screenshots from ${SCRAPER_OUTPUT}`
);

const app = express();
app.use(compression());

app.get("/api/apps", (req, res) => {
  res.json(
    apps.map(({ appSlug, appName, flowCount, screenshotCount, thumbnailUrl }) => ({
      appSlug,
      appName,
      flowCount,
      screenshotCount,
      thumbnailUrl,
    }))
  );
});

app.get("/api/apps/:appSlug", (req, res) => {
  const found = apps.find((a) => a.appSlug === req.params.appSlug);
  if (!found) return res.status(404).json({ error: "not found" });
  res.json(found);
});

app.get("/api/reload", (req, res) => {
  apps = loadApps();
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

app.listen(PORT, () => {
  console.log(`Pageflows gallery running at http://localhost:${PORT}`);
});
