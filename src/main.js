import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { discoverAppLinks, expandWithOtherFlows } from "./discover.js";
import { parseAppFlowPage } from "./parse.js";
import { downloadScreenshot, slugify } from "./download.js";
import { fetchText } from "./http.js";

function parseArgs(argv) {
  const args = {
    platform: "ios",
    outDir: path.resolve("output"),
    concurrency: 5,
    imageConcurrency: 10,
    limit: Infinity,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platform") args.platform = argv[++i];
    else if (a === "--out") args.outDir = path.resolve(argv[++i]);
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (a === "--image-concurrency") args.imageConcurrency = Number(argv[++i]);
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node src/main.js [options]

  --platform <name>          Platform section to scrape (default: ios)
  --out <dir>                Output directory (default: ./output)
  --concurrency <n>          Concurrent page fetches (default: 5)
  --image-concurrency <n>    Concurrent image downloads (default: 10)
  --limit <n>                Only process the first n apps (for testing)
  --dry-run                  Discover and parse only, skip downloading images
`);
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (...m) => console.log(...m);

  log(`Discovering ${args.platform} app-flow pages on pageflows.com ...`);
  const seedLinks = await discoverAppLinks(args.platform, {
    concurrency: args.concurrency,
    log,
  });
  log(`Discovered ${seedLinks.length} app-flow pages from category listings.`);

  log(`Expanding each app to find its full set of flows ...`);
  const links = await expandWithOtherFlows(seedLinks, {
    concurrency: args.concurrency,
    log,
  });
  log(`Total after expansion: ${links.length} app-flow pages.`);

  const targets = links.slice(0, args.limit);
  await fs.mkdir(args.outDir, { recursive: true });

  const pageLimit = pLimit(args.concurrency);
  const imageLimit = pLimit(args.imageConcurrency);

  const manifest = [];
  const errors = [];
  let appsDone = 0;

  await Promise.all(
    targets.map((link) =>
      pageLimit(async () => {
        try {
          const html = await fetchText(link.url);
          const data = parseAppFlowPage(html, {
            flowSlug: link.flowSlug,
            appSlug: link.appSlug,
            pageUrl: link.url,
          });

          const appDir = path.join(
            args.outDir,
            slugify(data.appSlug),
            slugify(data.flowSlug)
          );
          await fs.mkdir(appDir, { recursive: true });

          let downloaded = 0;
          let skipped = 0;
          const shots = [];

          if (!args.dryRun) {
            await Promise.all(
              data.screenshots.map((shot) =>
                imageLimit(async () => {
                  const ext = path.extname(new URL(shot.url).pathname) || ".jpg";
                  const fileName = `${String(shot.order).padStart(2, "0")}-${slugify(
                    shot.title
                  )}${ext}`;
                  const destPath = path.join(appDir, fileName);
                  try {
                    const result = await downloadScreenshot(shot.url, destPath);
                    if (result.skipped) skipped++;
                    else downloaded++;
                    shots.push({ ...shot, file: fileName });
                  } catch (err) {
                    errors.push({
                      app: data.appSlug,
                      flow: data.flowSlug,
                      screenshot: shot.url,
                      error: err.message,
                    });
                  }
                })
              )
            );
          } else {
            shots.push(...data.screenshots);
          }

          manifest.push({
            appSlug: data.appSlug,
            appName: data.appName,
            flowSlug: data.flowSlug,
            flowTitle: data.flowTitle,
            pageUrl: data.pageUrl,
            screenshotCount: data.screenshots.length,
            outputDir: path.relative(args.outDir, appDir),
            screenshots: shots.map(({ order, title, seconds, file }) => ({
              order,
              title,
              seconds,
              file,
            })),
          });
        } catch (err) {
          errors.push({ app: link.appSlug, flow: link.flowSlug, page: link.url, error: err.message });
        } finally {
          appsDone++;
          log(
            `[${appsDone}/${targets.length}] ${link.flowSlug}/${link.appSlug}` +
              (args.dryRun ? "" : " done")
          );
        }
      })
    )
  );

  manifest.sort((a, b) => a.appSlug.localeCompare(b.appSlug) || a.flowSlug.localeCompare(b.flowSlug));

  await fs.writeFile(
    path.join(args.outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  if (errors.length) {
    await fs.writeFile(
      path.join(args.outDir, "errors.json"),
      JSON.stringify(errors, null, 2)
    );
  }

  const totalScreenshots = manifest.reduce((sum, m) => sum + m.screenshotCount, 0);
  log(`\nDone. ${manifest.length} app-flows processed, ${totalScreenshots} screenshots total.`);
  if (errors.length) log(`${errors.length} errors — see ${path.join(args.outDir, "errors.json")}`);
  log(`Manifest written to ${path.join(args.outDir, "manifest.json")}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
