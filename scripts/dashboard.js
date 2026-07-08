/**
 * EpiTrack — scripts/dashboard.js
 * Fills the three dashboard cards and provides one-tap dose logging.
 */

import { getAll, getById, softDelete } from "./storage.js";
import { logDose, dosesToday, recentMissedDoses } from "./doses.js";
import { recentSeizures } from "./seizures.js";

export function renderDashboard() {
  renderTodayMeds();
  renderMissedDoses();
  renderRecentSeizures();
}

// ---------------------------------------------------------------------------
// Today's medications: one row per scheduled slot, logged once each
// ---------------------------------------------------------------------------

function renderTodayMeds() {
  const list = document.getElementById("today-meds-list");
  const meds = getAll("medications").filter((m) => m.active);
  const today = dosesToday();

  list.innerHTML = meds.map((med) => {
    const regimen = (med.regimens ?? []).find((r) => !r.endDate);
    const slots = regimen?.schedule?.length
      ? [...regimen.schedule].sort((a, b) => a.time.localeCompare(b.time))
      : [];

    const slotRows = slots.map((slot) => {
      const key = slotKey(slot.time);                       // "YYYY-MM-DDTHH:MM"
      const dose = today.find(
        (d) => d.medId === med.id &&
               (d.scheduledFor ?? "").slice(0, 16) === key
      );
      return slotRow(med, slot, dose);
    }).join("");

    return `
      <li class="today-med">
        <strong class="today-med-name">${escapeHTML(med.name)}</strong>
        <ul class="slot-list">
          ${slotRows || `<li class="record-when">No times set for this medication.</li>`}
        </ul>
      </li>
    `;
  }).join("");

  // Delegated handler: log a slot, or undo a logged slot
  list.onclick = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id: medId, slot, dose: doseId } = btn.dataset;

    if (action === "undo") {
      softDelete("doseLog", doseId);
      announce("Entry undone.");
    } else {
      const med = getById("medications", medId);
      logDose({
        medId,
        status: action,                       // "taken" | "missed"
        scheduledFor: slotDateTime(slot),     // the slot this satisfies
      });
      announce(`${med.name} ${slot} dose logged as ${action}.`);
    }
    renderDashboard();
  };
}

/** One slot row: buttons if unlogged, status + undo if logged. */
function slotRow(med, slot, dose) {
  const label = formatTime(slotDateTime(slot.time));

  if (dose) {
    const statusText = dose.status === "taken"
      ? `Taken${dose.takenAt ? " at " + formatTime(new Date(dose.takenAt)) : ""}`
      : "Missed";
    const statusClass = dose.status === "taken" ? "is-taken" : "is-missed";
    return `
      <li class="slot-row">
        <span class="slot-time">${label}</span>
        <span class="slot-status ${statusClass}">${statusText}</span>
        <button type="button" class="btn btn-small"
                data-action="undo" data-dose="${dose.id}"
                aria-label="Undo ${med.name} ${label} dose">Undo</button>
      </li>
    `;
  }

  return `
    <li class="slot-row">
      <span class="slot-time">${label}</span>
      <span class="slot-actions">
        <button type="button" class="btn btn-small"
                data-action="taken" data-id="${med.id}" data-slot="${slot.time}"
                aria-label="Mark ${med.name} ${label} dose taken">Taken</button>
        <button type="button" class="btn btn-small"
                data-action="missed" data-id="${med.id}" data-slot="${slot.time}"
                aria-label="Mark ${med.name} ${label} dose missed">Missed</button>
      </span>
    </li>
  `;
}

/** Today at HH:MM as a Date. */
function slotDateTime(hhmm, date = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0);
}

/** The 16-char local key ("YYYY-MM-DDTHH:MM") used to match a dose to a slot. */
function slotKey(hhmm, date = new Date()) {
  const d = slotDateTime(hhmm, date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  // Last 30 days, capped at 30 entries
  const seizures = recentSeizures(30, 30);

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
