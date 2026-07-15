import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { fetchText } from "./http.js";

const BASE = "https://pageflows.com";

/**
 * Discover every app-flow page (e.g. /post/ios/onboarding/revolut/) for a platform.
 * Strategy: crawl the platform's products index plus every product-category
 * sub-page, unioning the app links found on each — the category pages don't
 * reliably filter server-side, so unioning guards against any that do.
 */
export async function discoverAppLinks(platform, { concurrency = 5, log = () => {} } = {}) {
  const postPrefix = `/post/${platform}/`;
  const categoryPrefix = `/${platform}/products/`;

  const indexHtml = await fetchText(`${BASE}${categoryPrefix}`);
  const $index = cheerio.load(indexHtml);

  const categoryPaths = new Set();
  $index(`a[href^="${categoryPrefix}"]`).each((_, el) => {
    const href = $index(el).attr("href");
    if (href && href !== categoryPrefix) categoryPaths.add(href);
  });

  log(`Found ${categoryPaths.size} product categories to crawl`);

  const linkSet = new Map(); // path -> { href }
  collectPostLinks($index, postPrefix, linkSet);

  const limit = pLimit(concurrency);
  let done = 0;
  await Promise.all(
    [...categoryPaths].map((path) =>
      limit(async () => {
        try {
          const html = await fetchText(`${BASE}${path}`);
          const $ = cheerio.load(html);
          collectPostLinks($, postPrefix, linkSet);
        } catch (err) {
          log(`  ! failed category ${path}: ${err.message}`);
        } finally {
          done++;
          log(`  category ${done}/${categoryPaths.size} scanned (running total: ${linkSet.size} apps)`);
        }
      })
    )
  );

  return [...linkSet.values()].sort((a, b) => a.href.localeCompare(b.href));
}

function collectPostLinks($, postPrefix, linkSet) {
  $(`a[href^="${postPrefix}"]`).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const parts = href.split("/").filter(Boolean); // [post, platform, flowSlug, appSlug]
    if (parts.length !== 4) return;
    const [, , flowSlug, appSlug] = parts;
    if (!linkSet.has(href)) {
      linkSet.set(href, { href, flowSlug, appSlug, url: `${BASE}${href}` });
    }
  });
}

/**
 * Category listing pages only surface one or two flows per app. Every app-flow
 * page itself has a sidebar ("Showing N Flows") linking to *every* flow that
 * app has — e.g. Clay has 12 flows but category pages only ever surface 2 of
 * them. Visiting one page per app and reading that sidebar recovers the rest.
 */
export async function expandWithOtherFlows(seedLinks, { concurrency = 5, log = () => {} } = {}) {
  const linkSet = new Map(seedLinks.map((l) => [l.href, l]));

  // One representative page per app is enough — every flow page for an app
  // lists the same complete sidebar of that app's flows.
  const representativePerApp = new Map();
  for (const link of seedLinks) {
    if (!representativePerApp.has(link.appSlug)) representativePerApp.set(link.appSlug, link);
  }

  const apps = [...representativePerApp.values()];
  const limit = pLimit(concurrency);
  let done = 0;

  await Promise.all(
    apps.map((link) =>
      limit(async () => {
        try {
          const html = await fetchText(link.url);
          const $ = cheerio.load(html);
          $(".pageflows-product-sidebar-inner ul.tabs li.tab-link a").each((_, el) => {
            const href = $(el).attr("href");
            if (!href) return;
            const parts = href.split("/").filter(Boolean);
            if (parts.length !== 4) return;
            const [, , flowSlug, appSlug] = parts;
            if (appSlug !== link.appSlug) return; // safety: stay within this app
            if (!linkSet.has(href)) {
              linkSet.set(href, { href, flowSlug, appSlug, url: `${BASE}${href}` });
            }
          });
        } catch (err) {
          log(`  ! failed expanding ${link.appSlug}: ${err.message}`);
        } finally {
          done++;
          if (done % 20 === 0 || done === apps.length) {
            log(`  expanded ${done}/${apps.length} apps (running total: ${linkSet.size} flows)`);
          }
        }
      })
    )
  );

  return [...linkSet.values()].sort((a, b) => a.href.localeCompare(b.href));
}
