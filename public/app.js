const main = document.getElementById("main");
const pageTitle = document.getElementById("pageTitle");
const breadcrumb = document.getElementById("breadcrumb");
const backBtn = document.getElementById("backBtn");
const searchInput = document.getElementById("search");

let appsIndex = null; // [{appSlug, appName, flowCount, screenshotCount}]
let currentApp = null; // full app detail, cached by slug
const appCache = new Map();

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
  searchInput.hidden = false;

  const apps = await getAppsIndex();
  const q = filterText.trim().toLowerCase();
  const filtered = q ? apps.filter((a) => a.appName.toLowerCase().includes(q)) : apps;

  const totalFlows = apps.reduce((s, a) => s + a.flowCount, 0);
  const totalShots = apps.reduce((s, a) => s + a.screenshotCount, 0);

  main.innerHTML = "";
  main.appendChild(
    el("div", {
      class: "stats",
      text: `${apps.length} apps · ${totalFlows} flows · ${totalShots.toLocaleString()} screenshots`,
    })
  );

  if (filtered.length === 0) {
    main.appendChild(el("div", { class: "empty", text: "No apps match your search." }));
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
  searchInput.hidden = true;
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
          el("div", { class: "card-meta", text: `${f.screenshotCount} screenshots` }),
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
  searchInput.hidden = true;
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
