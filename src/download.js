import fs from "node:fs/promises";
import path from "node:path";
import { fetchBuffer } from "./http.js";

/** Sanitize a string for safe use as a filename/directory segment. */
export function slugify(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

/** Download a screenshot to destPath unless it already exists (resumable). */
export async function downloadScreenshot(url, destPath) {
  try {
    await fs.access(destPath);
    return { skipped: true };
  } catch {
    // doesn't exist yet, proceed
  }
  const buf = await fetchBuffer(url);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
  return { skipped: false, bytes: buf.length };
}
