/**
 * EpiTrack — scripts/doses.js
 * Dose logging: full Doses view (add, edit, delete) + dashboard helpers.
 *   status "taken"  → takenAt set
 *   status "missed" → takenAt null
 */

import { getAll, getById, insert, update, softDelete, nowISO } from "./storage.js";

const mount = document.getElementById("view-doses");

// Which dose is being edited (null = form is in "add" mode)
let editingId = null;

// ---------------------------------------------------------------------------
// Doses view
// ---------------------------------------------------------------------------

export function renderDoses() {
  const meds = getAll("medications").filter((m) => m.active);
  const doses = getAll("doseLog")
    .sort((a, b) => (b.takenAt ?? b.createdAt).localeCompare(a.takenAt ?? a.createdAt));

  if (meds.length === 0 && doses.length === 0) {
    mount.innerHTML = `
      <p class="empty-state">
        Add a medication first, then you can log doses.
        <a href="#medications" data-view="medications">Go to medications</a>
      </p>
    `;
    return;
  }

  const editing = editingId ? getById("doseLog", editingId) : null;
  const when = editing
    ? new Date(editing.takenAt ?? editing.scheduledFor ?? editing.createdAt)
    : new Date();

  mount.innerHTML = `
    <form class="card med-form" id="dose-form" novalidate>
      <h2>${editing ? "Edit dose" : "Log a dose"}</h2>

      <div class="field-row">
        <div class="field">
          <label for="dose-med">Medication</label>
          <select id="dose-med" name="medId" required>
            ${meds.map((m) => `
              <option value="${m.id}"
                ${editing?.medId === m.id ? "selected" : ""}>
                ${escapeHTML(medLabel(m))}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="field">
          <label for="dose-when">Date and time</label>
          <input id="dose-when" name="when" type="datetime-local"
                 value="${localDatetimeValue(when)}" required />
        </div>
      </div>

      <fieldset class="field">
        <legend>What happened?</legend>
        <label class="radio-row">
          <input type="radio" name="status" value="taken"
                 ${!editing || editing.status === "taken" ? "checked" : ""} />
          Dose was given
        </label>
        <label class="radio-row">
          <input type="radio" name="status" value="missed"
                 ${editing?.status === "missed" ? "checked" : ""} />
          Dose was missed
        </label>
      </fieldset>

      <div class="field">
        <label for="dose-note">Note <span class="label-hint">(optional)</span></label>
        <input id="dose-note" name="note" type="text"
               placeholder="e.g. spit out half, gave with food"
               value="${editing ? escapeHTML(editing.note ?? "") : ""}" />
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">
          ${editing ? "Save changes" : "Save dose"}
        </button>
        ${editing ? `
          <button type="button" class="btn" id="cancel-dose-edit">
            Cancel edit
          </button>` : ""}
      </div>

      <p class="form-error" id="dose-form-error" role="alert" hidden></p>
    </form>

    <h2 class="section-heading">Dose history</h2>
    <ul class="record-list card" id="dose-history">
      ${doses.map(doseItem).join("")}
    </ul>
    ${doses.length === 0 ? `
      <p class="empty-state">No doses logged yet. The first one you save will appear here.</p>
    ` : ""}
  `;

  const form = document.getElementById("dose-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveDoseFromForm(form);
  });

  document.getElementById("cancel-dose-edit")?.addEventListener("click", () => {
    editingId = null;
    renderDoses();
  });

  // Delegated Edit/Delete for history rows
  document.getElementById("dose-history").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "edit") startEdit(id);
    if (action === "delete") deleteDose(id);
  });
}

function startEdit(id) {
  editingId = id;
  renderDoses();
  const form = document.getElementById("dose-form");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.querySelector("#dose-med").focus();
}

function deleteDose(id) {
  const dose = getById("doseLog", id);
  if (!dose) return;
  const med = getById("medications", dose.medId);

  const ok = window.confirm(
    `Delete this ${med ? med.name : ""} dose entry?`
  );
  if (!ok) return;

  if (editingId === id) editingId = null; // don't leave the form editing a deleted record
  softDelete("doseLog", id);
  announce("Dose entry deleted.");
  renderDoses();
}

function saveDoseFromForm(form) {
  const data = new FormData(form);
  const medId = data.get("medId");
  const whenValue = data.get("when");
  const status = data.get("status");
  const note = (data.get("note") || "").trim();

  const error = document.getElementById("dose-form-error");
  const med = getById("medications", medId);
  if (!med) return showError(error, "Choose a medication.");
  if (!whenValue) return showError(error, "Enter the date and time.");
  const when = new Date(whenValue);
  if (when > new Date()) return showError(error, "That time is in the future.");

  const regimen = (med.regimens ?? []).find((r) => !r.endDate);
  const fields = {
    medId,
    status,
    takenAt: status === "taken" ? nowISO(when) : null,
    scheduledFor: nowISO(when),
    amountGiven: status === "taken" && regimen ? regimen.doseAmount : null,
    note,
  };

  if (editingId) {
    update("doseLog", editingId, fields);
    announce(`${med.name} dose updated.`);
    editingId = null;
  } else {
    insert("doseLog", fields);
    announce(`${med.name} ${status === "taken" ? "dose saved" : "missed dose saved"}.`);
  }

  renderDoses();
}

/**
 * Shared writer used by the Dashboard quick-log.
 * `when`        = when the dose actually happened (defaults to now)
 * `scheduledFor`= the slot it satisfies (defaults to `when` when not given)
 */
export function logDose({ medId, status, when = new Date(), scheduledFor = null, note = "" }) {
  const med = getById("medications", medId);
  const regimen = med ? (med.regimens ?? []).find((r) => !r.endDate) : null;

  return insert("doseLog", {
    medId,
    status,
    takenAt: status === "taken" ? nowISO(when) : null,
    scheduledFor: nowISO(scheduledFor ?? when),
    amountGiven: status === "taken" && regimen ? regimen.doseAmount : null,
    note,
  });
}

function doseItem(dose) {
  const med = getById("medications", dose.medId);
  const name = med ? med.name : "Unknown medication";
  const when = new Date(dose.takenAt ?? dose.scheduledFor ?? dose.createdAt);
  const statusClass = dose.status === "missed" ? "is-missed" : "is-taken";
  const statusText = dose.status === "missed" ? "Missed" : "Taken";

  return `
    <li class="dose-row">
      <span class="dose-row-main">
        <span class="${statusClass}">${statusText}</span>
        — ${escapeHTML(name)}
        <span class="record-when">${formatWhen(when)}</span>
        ${dose.note ? `<span class="record-note">${escapeHTML(dose.note)}</span>` : ""}
      </span>
      <span class="dose-row-actions">
        <button type="button" class="btn btn-small"
                data-action="edit" data-id="${dose.id}"
                aria-label="Edit ${escapeHTML(name)} dose, ${formatWhen(when)}">
          Edit
        </button>
        <button type="button" class="btn btn-small btn-danger"
                data-action="delete" data-id="${dose.id}"
                aria-label="Delete ${escapeHTML(name)} dose, ${formatWhen(when)}">
          Delete
        </button>
      </span>
    </li>
  `;
}

// ---------------------------------------------------------------------------
// Dashboard pieces (called by dashboard.js)
// ---------------------------------------------------------------------------

/** Doses logged today, newest first. */
export function dosesToday() {
  const today = localDateString(new Date());
  return getAll("doseLog")
    .filter((d) => (d.takenAt ?? d.scheduledFor ?? d.createdAt).startsWith(today))
    .sort((a, b) => (b.takenAt ?? b.createdAt).localeCompare(a.takenAt ?? a.createdAt));
}

/** Missed doses from the last N days, newest first. */
export function recentMissedDoses(days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return getAll("doseLog")
    .filter((d) => d.status === "missed")
    .filter((d) => new Date(d.scheduledFor ?? d.createdAt) >= cutoff)
    .sort((a, b) => (b.scheduledFor ?? b.createdAt).localeCompare(a.scheduledFor ?? a.createdAt));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function medLabel(med) {
  const r = (med.regimens ?? []).find((x) => !x.endDate);
  return r ? `${med.name} (${r.doseAmount} ${r.doseUnit})` : med.name;
}

function localDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDatetimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${localDateString(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(date) {
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function announce(message) {
  const region = document.getElementById("status-announcer");
  if (region) region.textContent = message;
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
}
