# pageflows-scraper

Crawls [pageflows.com](https://pageflows.com) for a given platform section (default: `ios`),
finds every app flow (e.g. "Onboarding in Revolut"), and downloads that flow's
screenshots (the labeled screens shown in the "In this video" list on each app page).

## Usage

```
npm install
node src/main.js [options]
```

Options:

- `--platform <name>` — platform section to scrape, e.g. `ios`, `android`, `desktop-web` (default: `ios`)
- `--out <dir>` — output directory (default: `./output`)
- `--concurrency <n>` — concurrent page fetches (default: 5)
- `--image-concurrency <n>` — concurrent image downloads (default: 10)
- `--limit <n>` — only process the first n app-flows (useful for testing)
- `--dry-run` — discover and parse only, skip downloading images

## Output

```
output/
  <app-slug>/
    <flow-slug>/
      01-<screen-title>.jpg
      02-<screen-title>.jpg
      ...
  manifest.json   # every app-flow processed, with screenshot titles/order
  errors.json     # any pages/images that failed (only written if errors occurred)
```

Downloads are resumable — re-running skips screenshots that already exist on disk.
