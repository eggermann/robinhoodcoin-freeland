/**
 * main.js — Minimal client-side logic for the RobinHoodCoin website.
 *
 * In production this would connect to Solana RPC to display live stats.
 * For now it shows placeholder animations and smooth-scroll navigation.
 */

// ── Smooth scroll for anchor links ────────────────────
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

// ── Animate stats on load ─────────────────────────────
function animateValue(el, end, duration = 1500) {
  let start = 0;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + (end - start) * eased);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// Placeholder stats — replace with live Solana RPC calls
window.addEventListener("DOMContentLoaded", () => {
  const raised = document.getElementById("stat-raised");
  const holders = document.getElementById("stat-holders");

  if (raised) animateValue(raised, 0);
  if (holders) animateValue(holders, 0);
});

// ── Intersection Observer for fade-in animations ──────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 },
);

document.querySelectorAll(".card, .step, .stamp-card, .timeline__item").forEach((el) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(20px)";
  el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
  observer.observe(el);
});

// CSS class to reveal
const style = document.createElement("style");
style.textContent = `.visible { opacity: 1 !important; transform: translateY(0) !important; }`;
document.head.appendChild(style);
