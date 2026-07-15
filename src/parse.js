import * as cheerio from "cheerio";

const BASE = "https://pageflows.com";

/**
 * Parse an app-flow page (e.g. /post/ios/onboarding/revolut/) into
 * { appName, flowTitle, screenshots: [{ order, title, seconds, url }] }.
 *
 * Screenshots come from the "In this video" annotation list, which pageflows
 * renders twice in the DOM (desktop + mobile layout) — dedupe by image URL.
 */
export function parseAppFlowPage(html, { flowSlug, appSlug, pageUrl }) {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim();
  const h1 = $("h1").first().text().trim().replace(/\s+/g, " ");
  const appNameMatch = h1.match(/Flow in (.+?) for /i);
  const appName = appNameMatch ? appNameMatch[1].trim() : appSlug;

  const flowTitleMatch = h1.match(/^(.+?) Flow in /i);
  const flowTitle = flowTitleMatch ? flowTitleMatch[1].trim() : flowSlug;

  const seen = new Map(); // imageUrl -> screenshot
  $("li.annotation").each((_, el) => {
    const $el = $(el);
    const dataUrl = $el.attr("data-url");
    if (!dataUrl) return;
    if (seen.has(dataUrl)) return;
    seen.set(dataUrl, {
      order: Number($el.attr("data-count")) || seen.size + 1,
      title: ($el.attr("data-title") || "").trim(),
      seconds: Number($el.attr("data-seconds")) || 0,
      url: dataUrl.startsWith("http") ? dataUrl : `${BASE}${dataUrl}`,
    });
  });

  const screenshots = [...seen.values()].sort((a, b) => a.order - b.order);

  const videoSrc = $("video#productVideo source").first().attr("src");
  const videoUrl = videoSrc ? (videoSrc.startsWith("http") ? videoSrc : `${BASE}${videoSrc}`) : null;

  return {
    pageUrl,
    flowSlug,
    appSlug,
    appName,
    flowTitle,
    pageTitle: title,
    screenshots,
    videoUrl,
  };
}
