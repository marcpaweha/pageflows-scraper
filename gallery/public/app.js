const main = document.getElementById("main");
const pageTitle = document.getElementById("pageTitle");
const breadcrumb = document.getElementById("breadcrumb");
const backBtn = document.getElementById("backBtn");
const searchInput = document.getElementById("search");
const searchWrap = document.querySelector(".search-wrap");

let appsIndex = null; // [{appSlug, appName, flowCount, screenshotCount, thumbnailUrl, theme}]
let currentApp = null; // full app detail, cached by slug
const appCache = new Map();
let themeFilter = "all"; // "all" | "light" | "dark"

const THEME_ICON = {
  light: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6 3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  dark: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.7A5.6 5.6 0 1 1 6.3 2.5a4.6 4.6 0 0 0 7.2 7.2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

async function getAppsIndex() {
  if (!appsIndex) {
    const res = await fetch("/api/apps");
    appsIndex = await res.json();
  }
  return appsIndex;
}

async function getApp(slug) {
  if (!appCache.has(slug)) {
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}`);
    appCache.set(slug, await res.json());
  }
  return appCache.get(slug);
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean).map(decodeURIComponent);
  return { appSlug: parts[0] || null, flowSlug: parts[1] || null };
}

function setHash(appSlug, flowSlug) {
  const parts = [appSlug, flowSlug].filter(Boolean).map(encodeURIComponent);
  location.hash = parts.length ? "/" + parts.join("/") : "";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

async function renderHome(filterText = "") {
  backBtn.hidden = true;
  pageTitle.textContent = "Page Flows Gallery";
  breadcrumb.innerHTML = "";
  searchWrap.hidden = false;

  const apps = await getAppsIndex();
  const q = filterText.trim().toLowerCase();
  const searched = q ? apps.filter((a) => a.appName.toLowerCase().includes(q)) : apps;
  const filtered =
    themeFilter === "all" ? searched : searched.filter((a) => a.theme === themeFilter);

  const totalFlows = apps.reduce((s, a) => s + a.flowCount, 0);
  const totalShots = apps.reduce((s, a) => s + a.screenshotCount, 0);

  main.innerHTML = "";
  main.appendChild(
    el("div", {
      class: "stats",
      text: `${apps.length} apps · ${totalFlows} flows · ${totalShots.toLocaleString()} screenshots`,
    })
  );

  const counts = {
    all: searched.length,
    light: searched.filter((a) => a.theme === "light").length,
    dark: searched.filter((a) => a.theme === "dark").length,
  };
  const filterBar = el("div", { class: "theme-filter" });
  for (const key of ["all", "light", "dark"]) {
    const label = key === "all" ? "All" : key === "light" ? "Light" : "Dark";
    filterBar.appendChild(
      el(
        "button",
        {
          class: `theme-filter-btn${themeFilter === key ? " active" : ""}`,
          onclick: () => {
            themeFilter = key;
            renderHome(searchInput.value);
          },
        },
        [
          key !== "all" ? el("span", { html: THEME_ICON[key] }) : null,
          el("span", { text: `${label} (${counts[key]})` }),
        ]
      )
    );
  }
  main.appendChild(filterBar);

  if (filtered.length === 0) {
    main.appendChild(el("div", { class: "empty", text: "No apps match." }));
    return;
  }

  const grid = el("div", { class: "app-grid" });
  for (const a of filtered) {
    grid.appendChild(
      el("div", { class: "card app-card", onclick: () => setHash(a.appSlug) }, [
        el("div", { class: "card-thumb" }, [
          a.thumbnailUrl
            ? el("img", { src: a.thumbnailUrl, alt: a.appName, loading: "lazy" })
            : el("div", { class: "card-thumb-placeholder", text: a.appName[0] || "?" }),
          a.theme
            ? el("div", { class: `theme-badge theme-badge-${a.theme}`, html: THEME_ICON[a.theme] })
            : null,
        ]),
        el("div", { class: "card-body" }, [
          el("div", { class: "card-name", text: a.appName }),
          el("div", {
            class: "card-meta",
            text: `${a.flowCount} flow${a.flowCount === 1 ? "" : "s"} · ${a.screenshotCount} screenshots`,
          }),
        ]),
      ])
    );
  }
  main.appendChild(grid);
}

async function renderApp(appSlug) {
  backBtn.hidden = false;
  searchWrap.hidden = true;
  const app = await getApp(appSlug);
  if (!app) {
    main.innerHTML = "";
    main.appendChild(el("div", { class: "empty", text: "App not found." }));
    return;
  }
  currentApp = app;
  pageTitle.textContent = app.appName;
  breadcrumb.innerHTML = "";
  breadcrumb.appendChild(el("a", { text: "All apps", onclick: () => setHash(null) }));

  main.innerHTML = "";
  main.appendChild(
    el("div", {
      class: "stats",
      text: `${app.flowCount} flow${app.flowCount === 1 ? "" : "s"} · ${app.screenshotCount} screenshots`,
    })
  );

  const grid = el("div", { class: "flow-grid" });
  for (const f of app.flows) {
    grid.appendChild(
      el(
        "div",
        { class: "card", onclick: () => setHash(appSlug, f.flowSlug) },
        [
          el("div", { class: "card-name", text: f.flowTitle }),
          el("div", {
            class: "card-meta",
            text: `${f.screenshotCount} screenshots${f.videoUrl ? " · video" : ""}`,
          }),
        ]
      )
    );
  }
  main.appendChild(grid);
}

let lightboxShots = [];
let lightboxIndex = 0;

async function renderFlow(appSlug, flowSlug) {
  backBtn.hidden = false;
  searchWrap.hidden = true;
  const app = await getApp(appSlug);
  const flow = app && app.flows.find((f) => f.flowSlug === flowSlug);
  if (!app || !flow) {
    main.innerHTML = "";
    main.appendChild(el("div", { class: "empty", text: "Flow not found." }));
    return;
  }
  pageTitle.textContent = `${app.appName} — ${flow.flowTitle}`;
  breadcrumb.innerHTML = "";
  breadcrumb.appendChild(el("a", { text: "All apps", onclick: () => setHash(null) }));
  breadcrumb.appendChild(document.createTextNode(" / "));
  breadcrumb.appendChild(el("a", { text: app.appName, onclick: () => setHash(appSlug) }));
  breadcrumb.appendChild(document.createTextNode(` / ${flow.flowTitle}`));

  main.innerHTML = "";
  main.appendChild(el("div", { class: "stats", text: `${flow.screenshotCount} screenshots` }));

  if (flow.videoUrl) {
    main.appendChild(
      el("video", {
        class: "flow-video",
        src: flow.videoUrl,
        controls: "",
        preload: "metadata",
      })
    );
  }

  lightboxShots = flow.screenshots;
  const grid = el("div", { class: "shot-grid" });
  flow.screenshots.forEach((s, i) => {
    grid.appendChild(
      el("div", { class: "shot", onclick: () => openLightbox(i) }, [
        el("img", { src: s.url, alt: s.title, loading: "lazy" }),
        el("div", { class: "shot-caption", html: `<b>${i + 1}.</b> ${s.title}` }),
      ])
    );
  });
  main.appendChild(grid);
}

async function route() {
  const { appSlug, flowSlug } = parseHash();
  if (!appSlug) return renderHome(searchInput.value);
  if (!flowSlug) return renderApp(appSlug);
  return renderFlow(appSlug, flowSlug);
}

backBtn.addEventListener("click", () => {
  const { appSlug, flowSlug } = parseHash();
  if (flowSlug) setHash(appSlug);
  else setHash(null);
});

let searchDebounce;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => renderHome(searchInput.value), 120);
});

window.addEventListener("hashchange", route);
route();

// Lightbox
const lightbox = document.getElementById("lightbox");
const lbImage = document.getElementById("lbImage");
const lbCaption = document.getElementById("lbCaption");

function openLightbox(index) {
  lightboxIndex = index;
  showLightboxImage();
  lightbox.hidden = false;
}
function closeLightbox() {
  lightbox.hidden = true;
}
function showLightboxImage() {
  const s = lightboxShots[lightboxIndex];
  lbImage.src = s.url;
  lbImage.alt = s.title;
  lbCaption.textContent = `${lightboxIndex + 1} / ${lightboxShots.length} — ${s.title}`;
}
function lbNext() {
  lightboxIndex = (lightboxIndex + 1) % lightboxShots.length;
  showLightboxImage();
}
function lbPrev() {
  lightboxIndex = (lightboxIndex - 1 + lightboxShots.length) % lightboxShots.length;
  showLightboxImage();
}

document.getElementById("lbClose").addEventListener("click", closeLightbox);
document.getElementById("lbNext").addEventListener("click", lbNext);
document.getElementById("lbPrev").addEventListener("click", lbPrev);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (lightbox.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") lbNext();
  if (e.key === "ArrowLeft") lbPrev();
});
