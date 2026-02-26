const DASHBOARD_URL = "./data/dashboard.json";
const REFRESH_INTERVAL_MS = 60_000;

let revealObserver;
let hasRenderedStats = false;

function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function animateNumber(el, end, { duration = 1400, decimals = 0 } = {}) {
  const start = 0;
  const startTime = performance.now();

  function format(value) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    el.textContent = format(current);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function setNumber(el, value, decimals = 0) {
  if (!el) return;

  if (!hasRenderedStats) {
    animateNumber(el, value, { decimals });
    return;
  }

  el.textContent = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function setupRevealObserver() {
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.15 },
  );

  document.querySelectorAll(".card, .step, .stamp-card, .timeline__item").forEach((el) => {
    prepareReveal(el);
  });

  const style = document.createElement("style");
  style.textContent = ".visible { opacity: 1 !important; transform: translateY(0) !important; }";
  document.head.appendChild(style);
}

function prepareReveal(el) {
  el.style.opacity = "0";
  el.style.transform = "translateY(20px)";
  el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
  revealObserver.observe(el);
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function setTextById(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function applyStats(data) {
  const raised = document.getElementById("stat-raised");
  const holders = document.getElementById("stat-holders");
  const parcels = document.getElementById("stat-parcels");
  const stamps = document.getElementById("stat-stamps");

  setNumber(raised, data.stats.solRaised, 2);
  setNumber(holders, data.stats.clanMembers, 0);
  setNumber(parcels, data.stats.parcelsAcquired, 0);
  setNumber(stamps, data.stats.stampsMinted, 0);
}

function renderCampaigns(data) {
  const container = document.getElementById("campaign-list");
  if (!container) return;

  container.innerHTML = "";
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.active);

  if (activeCampaigns.length === 0) {
    const card = document.createElement("div");
    card.className = "campaign-card";
    const title = document.createElement("h4");
    title.textContent = "No active campaigns yet";
    const text = document.createElement("p");
    text.textContent = "Create the first campaign via /landstamp or let the autonomous driver launch one.";
    card.appendChild(title);
    card.appendChild(text);
    container.appendChild(card);
    prepareReveal(card);
    return;
  }

  activeCampaigns.forEach((campaign) => {
    const card = document.createElement("article");
    card.className = "campaign-card";
    const title = document.createElement("h4");
    title.textContent = campaign.name;
    const sub = document.createElement("p");
    sub.textContent = `${campaign.tier.toUpperCase()} tier campaign`;

    const mintedText = campaign.maxSupply > 0
      ? `${campaign.minted.toLocaleString()} / ${campaign.maxSupply.toLocaleString()} minted`
      : `${campaign.minted.toLocaleString()} minted (open supply)`;

    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    const progressFill = document.createElement("div");
    progressFill.className = "progress-bar__fill";
    progressFill.style.width = `${campaign.percentFunded}%`;
    progressBar.appendChild(progressFill);

    const stats = document.createElement("div");
    stats.className = "progress-stats";
    const minted = document.createElement("span");
    minted.textContent = mintedText;
    const raised = document.createElement("span");
    raised.textContent = `${campaign.raisedSOL.toFixed(2)} / ${campaign.goalSOL.toFixed(2)} SOL`;
    const funded = document.createElement("span");
    funded.textContent = `${campaign.percentFunded}% funded`;

    stats.appendChild(minted);
    stats.appendChild(raised);
    stats.appendChild(funded);

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(progressBar);
    card.appendChild(stats);

    container.appendChild(card);
    prepareReveal(card);
  });
}

function renderPortfolio(data) {
  const grid = document.getElementById("portfolio-grid");
  const emptyState = document.getElementById("portfolio-empty");
  const map = document.getElementById("portfolio-map");
  if (!grid || !emptyState || !map) return;

  grid.innerHTML = "";

  if (data.portfolio.total === 0) {
    emptyState.hidden = false;
    map.innerHTML = '<div class="portfolio-map__placeholder">🗺️ Interactive map coming soon — showing all freeland parcels worldwide</div>';
    return;
  }

  emptyState.hidden = true;
  map.innerHTML = `<div class="portfolio-map__placeholder">🗺️ ${data.portfolio.total} parcel(s) tracked. Map integration is the next frontend milestone.</div>`;

  data.portfolio.parcels.forEach((parcel) => {
    const card = document.createElement("article");
    card.className = "portfolio-card";

    const activities = parcel.activities.length > 0
      ? parcel.activities.join(", ")
      : "Planning phase";
    const lines = [
      { label: "Location", value: parcel.location },
      { label: "Size", value: `${parcel.sizeAcres} acres` },
      { label: "Status", value: parcel.status },
      { label: "Acquisition", value: `${parcel.purchasePriceSOL.toFixed(2)} SOL` },
      { label: "Activities", value: activities },
    ];

    const title = document.createElement("h4");
    title.textContent = parcel.name;
    card.appendChild(title);

    lines.forEach((line) => {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${line.label}: `;
      p.appendChild(strong);
      p.appendChild(document.createTextNode(line.value));
      card.appendChild(p);
    });

    grid.appendChild(card);
    prepareReveal(card);
  });
}

function applyTransparency(data) {
  setTextById("token-address", data.transparency.rhcMintAddress ?? "Not configured");
  setTextById("treasury-address", data.transparency.treasuryMultisigAddress ?? "Not configured");
  setTextById("nft-address", data.transparency.nftCollectionAddress ?? "Not configured");

  const reportStatus = document.getElementById("report-status");
  const reportGenerated = document.getElementById("report-generated");
  const reportLink = document.getElementById("latest-report-link");

  if (reportStatus) {
    reportStatus.textContent = data.reports.latestPeriod
      ? `Latest report period: ${data.reports.latestPeriod}`
      : "No monthly report generated yet. Run /report or the autonomy daemon to publish one.";
  }

  if (reportGenerated) {
    reportGenerated.textContent = data.reports.latestGeneratedAt
      ? `Generated: ${formatDate(data.reports.latestGeneratedAt)}`
      : "";
  }

  if (reportLink instanceof HTMLAnchorElement) {
    if (data.reports.latestReportUrl) {
      reportLink.href = data.reports.latestReportUrl;
      reportLink.hidden = false;
    } else {
      reportLink.hidden = true;
    }
  }
}

function applySecurity(data) {
  const list = document.getElementById("security-status-list");
  if (!list) return;

  const mintLabel = data.security.mintAuthorityStatus === "multisig"
    ? "Mint authority is aligned to treasury multisig"
    : data.security.mintAuthorityStatus === "external"
      ? "Mint authority is external (review and transfer to multisig)"
      : "Mint authority status unknown (set RHC_MINT_AUTHORITY)";

  const items = [
    data.security.multisigConfigured
      ? "Treasury multisig address is configured"
      : "Treasury multisig address missing",
    mintLabel,
    data.security.daemonEnabled
      ? "Headless autonomy daemon is enabled"
      : "Headless autonomy daemon is disabled",
    data.security.gitignoreProtectsEnv
      ? ".env protection detected in .gitignore"
      : ".env is not protected in .gitignore",
    data.security.gitignoreProtectsKeys
      ? "keys/ protection detected in .gitignore"
      : "keys/ is not protected in .gitignore",
  ];

  list.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function applyDashboard(data) {
  applyStats(data);
  renderCampaigns(data);
  renderPortfolio(data);
  applyTransparency(data);
  applySecurity(data);
  hasRenderedStats = true;
}

async function fetchDashboard() {
  const response = await fetch(`${DASHBOARD_URL}?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`dashboard fetch failed (${response.status})`);
  }
  return response.json();
}

async function refreshDashboard() {
  try {
    const dashboard = await fetchDashboard();
    applyDashboard(dashboard);
  } catch (err) {
    console.error("Could not load dashboard data:", err);
    setTextById("report-status", "Dashboard data unavailable. Run `npm run sync:web-data` to generate frontend data.");
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  setupSmoothScroll();
  setupRevealObserver();
  await refreshDashboard();

  window.setInterval(() => {
    void refreshDashboard();
  }, REFRESH_INTERVAL_MS);
});
