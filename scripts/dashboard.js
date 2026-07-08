/**
 * EpiTrack — scripts/dashboard.js
 * Fills the three dashboard cards and provides one-tap dose logging.
 */

import { getAll, getById } from "./storage.js";
import { logDose, dosesToday, recentMissedDoses } from "./doses.js";
import { recentSeizures } from "./seizures.js";

export function renderDashboard() {
  renderTodayMeds();
  renderMissedDoses();
  renderRecentSeizures();
}

// ---------------------------------------------------------------------------
// Today's medications: each active med + one-tap Taken / Missed buttons
// ---------------------------------------------------------------------------

function renderTodayMeds() {
  const list = document.getElementById("today-meds-list");
  const meds = getAll("medications").filter((m) => m.active);
  const today = dosesToday();

  list.innerHTML = meds.map((med) => {
    const logged = today.filter((d) => d.medId === med.id);
    const summary = logged.length
      ? logged.map((d) => d.status === "taken" ? "✓" : "✗").join(" ")
      : "Not logged yet";

    return `
      <li>
        <div class="today-med-row">
          <span>
            <strong>${escapeHTML(med.name)}</strong>
            <span class="record-when">${escapeHTML(summary)}</span>
          </span>
          <span class="today-med-actions">
            <button type="button" class="btn btn-small"
                    data-log="taken" data-id="${med.id}">
              Taken
            </button>
            <button type="button" class="btn btn-small"
                    data-log="missed" data-id="${med.id}">
              Missed
            </button>
          </span>
        </div>
      </li>
    `;
  }).join("");

  // Delegated quick-log handler (bind once per render)
  list.onclick = (e) => {
    const btn = e.target.closest("button[data-log]");
    if (!btn) return;
    const med = getById("medications", btn.dataset.id);
    logDose({ medId: btn.dataset.id, status: btn.dataset.log });
    announce(`${med.name} logged as ${btn.dataset.log}.`);
    renderDashboard();
  };
}

// ---------------------------------------------------------------------------
// Missed doses (last 7 days)
// ---------------------------------------------------------------------------

function renderMissedDoses() {
  const list = document.getElementById("missed-doses-list");
  const missed = recentMissedDoses(7).slice(0, 5);

  list.innerHTML = missed.map((d) => {
    const med = getById("medications", d.medId);
    const when = new Date(d.scheduledFor ?? d.createdAt);
    return `
      <li>
        <span class="is-missed">Missed</span>
        — ${escapeHTML(med ? med.name : "Unknown medication")}
        <span class="record-when">${formatWhen(when)}</span>
      </li>
    `;
  }).join("");
}

// ---------------------------------------------------------------------------
// Recent seizures (placeholder until the seizures feature is built)
// ---------------------------------------------------------------------------

function renderRecentSeizures() {
  const list = document.getElementById("recent-seizures-list");
  const seizures = getAll("seizures")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 5);

  list.innerHTML = seizures.map((s) => `
    <li>
      ${escapeHTML(s.type || "Seizure")}
      <span class="record-when">${formatWhen(new Date(s.startedAt))}</span>
    </li>
  `).join("");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWhen(date) {
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function announce(message) {
  const region = document.getElementById("status-announcer");
  if (region) region.textContent = message;
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
