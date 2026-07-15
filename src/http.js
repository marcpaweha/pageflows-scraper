import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch a URL as text, retrying on transient failures. */
export async function fetchText(url, { retries = 3, retryDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Fetch a URL as a Buffer, retrying on transient failures. */
export async function fetchBuffer(url, { retries = 3, retryDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const arrBuf = await res.arrayBuffer();
      return Buffer.from(arrBuf);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Stream a URL straight to disk, retrying on transient failures. Writes to a
 * `.part` sibling first and renames on success so a killed/failed run never
 * leaves a truncated file at destPath (which the resumable skip-check relies
 * on being complete).
 */
export async function fetchToFile(url, destPath, { retries = 3, retryDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const partPath = `${destPath}.part`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(partPath));
      const { size } = await fs.promises.stat(partPath);
      await fs.promises.rename(partPath, destPath);
      return { bytes: size };
    } catch (err) {
      lastErr = err;
      await fs.promises.unlink(partPath).catch(() => {});
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}
