/**
 * EpiTrack — scripts/seizures.js
 * Seizures view: add, edit, delete, and view seizure events.
 * Each seizure can have suspected triggers (from the triggers collection)
 * and journal notes (stored in the notes collection, linked by seizure id).
 */

import { getAll, getById, insert, update, softDelete, nowISO } from "./storage.js";

const mount = document.getElementById("view-seizures");

const SEIZURE_TYPES = [
  "Tonic-clonic",
  "Absence",
  "Focal aware",
  "Focal impaired awareness",
  "Myoclonic",
  "Atonic (drop)",
  "Unknown / not sure",
];

// null = add mode; an id = edit mode
let editingId = null;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderSeizures() {
  const seizures = getAll("seizures")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const triggers = getAll("triggers");
  const editing = editingId ? getById("seizures", editingId) : null;
  const when = editing ? new Date(editing.startedAt) : new Date();

  mount.innerHTML = `
    <form class="card med-form" id="seizure-form" novalidate>
      <h2>${editing ? "Edit seizure" : "Log a seizure"}</h2>

      <div class="field-row">
        <div class="field">
          <label for="sz-when">When it started</label>
          <input id="sz-when" name="startedAt" type="datetime-local"
                 value="${localDatetimeValue(when)}" required />
        </div>

        <div class="field">
          <label for="sz-duration">How long <span class="label-hint">(seconds, if known)</span></label>
          <input id="sz-duration" name="durationSeconds" type="number"
                 min="0" step="1" placeholder="e.g. 90"
                 value="${editing?.durationSeconds ?? ""}" />
        </div>

        <div class="field">
          <label for="sz-type">Type</label>
          <select id="sz-type" name="type">
            ${SEIZURE_TYPES.map((t) => `
              <option value="${t}" ${editing?.type === t ? "selected" : ""}>${t}</option>
            `).join("")}
          </select>
        </div>
      </div>

      <fieldset class="field">
        <legend>Suspected triggers <span class="label-hint">(check any that apply)</span></legend>
        <div class="check-grid">
          ${triggers.map((t) => `
            <label class="radio-row">
              <input type="checkbox" name="triggers" value="${t.id}"
                     ${editing?.triggersSuspected?.includes(t.id) ? "checked" : ""} />
              ${escapeHTML(t.label)}
            </label>
          `).join("")}
        </div>
        ${triggers.length === 0 ? `
          <p class="label-hint">No triggers defined yet — add them on the
            <a href="#triggers" data-view="triggers">Triggers</a> page.</p>
        ` : ""}
      </fieldset>

      <div class="field">
        <label for="sz-note">Journal note <span class="label-hint">(optional — what you observed, before/after)</span></label>
        <textarea id="sz-note" name="note" rows="3" maxlength="2000"
                  placeholder="e.g. Happened while falling asleep. Eyes fluttered, left arm stiff. Sleepy afterward."></textarea>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">
          ${editing ? "Save changes" : "Save seizure"}
        </button>
        ${editing ? `
          <button type="button" class="btn" id="cancel-sz-edit">Cancel edit</button>
        ` : ""}
      </div>

      <p class="form-error" id="sz-form-error" role="alert" hidden></p>
    </form>

    <h2 class="section-heading">Seizure history</h2>
    <ul class="record-list" id="seizure-history">
      ${seizures.map((s) => seizureItem(s, triggers)).join("")}
    </ul>
    ${seizures.length === 0 ? `
      <p class="empty-state">No seizures logged. When one happens, log it here or
      with the <strong>Log a seizure</strong> button in the sidebar.</p>
    ` : ""}
  `;

  const form = document.getElementById("seizure-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSeizure(form);
  });

  document.getElementById("cancel-sz-edit")?.addEventListener("click", () => {
    editingId = null;
    renderSeizures();
  });

  document.getElementById("seizure-history").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "edit") startEdit(id);
    if (action === "delete") deleteSeizure(id);
  });

  // When editing, show existing journal notes under the form's textarea
  if (editing) {
    const existingNotes = notesForSeizure(editing.id);
    if (existingNotes.length) {
      const noteField = form.querySelector("#sz-note");
      noteField.placeholder = "Add another note — earlier notes are kept.";
    }
  }
}

function startEdit(id) {
  editingId = id;
  renderSeizures();
  const form = document.getElementById("seizure-form");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.querySelector("#sz-when").focus();
}

function deleteSeizure(id) {
  const sz = getById("seizures", id);
  if (!sz) return;

  const ok = window.confirm("Delete this seizure entry? Its journal notes will be kept.");
  if (!ok) return;

  if (editingId === id) editingId = null;
  softDelete("seizures", id);
  announce("Seizure entry deleted.");
  renderSeizures();
}

function saveSeizure(form) {
  const data = new FormData(form);
  const startedValue = data.get("startedAt");
  const durationRaw = data.get("durationSeconds");
  const note = (data.get("note") || "").trim();

  const error = document.getElementById("sz-form-error");
  if (!startedValue) return showError(error, "Enter when the seizure started.");
  const startedAt = new Date(startedValue);
  if (startedAt > new Date()) return showError(error, "That time is in the future.");

  // Duration is optional, but if given it must be a sane number of seconds.
  let durationSeconds = null;
  if (durationRaw !== "" && durationRaw != null) {
    durationSeconds = Number(durationRaw);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return showError(error, "Enter the duration as a number of seconds.");
    }
    if (durationSeconds > 3600) {
      return showError(error, "That's over an hour — please double-check the seconds. If it's correct, this may be a medical emergency; call your doctor or emergency services.");
    }
  }

  const fields = {
    startedAt: nowISO(startedAt),
    durationSeconds,
    type: data.get("type"),
    triggersSuspected: data.getAll("triggers"),
  };

  let seizureId;
  if (editingId) {
    update("seizures", editingId, fields);
    seizureId = editingId;
    announce("Seizure updated.");
    editingId = null;
  } else {
    const record = insert("seizures", {
      ...fields,
      rescueMedGiven: false,
      emergencyCare: false,
      loggedAt: nowISO(),
    });
    seizureId = record.id;
    announce("Seizure saved.");
  }

  // Journal note becomes a linked record in the notes collection
  if (note) {
    insert("notes", {
      text: note,
      linkedTo: { type: "seizure", id: seizureId },
    });
  }

  renderSeizures();
}

// ---------------------------------------------------------------------------
// History item
// ---------------------------------------------------------------------------

function seizureItem(sz, triggers) {
  const when = new Date(sz.startedAt);
  const triggerLabels = (sz.triggersSuspected ?? [])
    .map((id) => triggers.find((t) => t.id === id)?.label)
    .filter(Boolean);
  const notes = notesForSeizure(sz.id);

  return `
    <li class="card seizure-card">
      <div class="dose-row">
        <span class="dose-row-main">
          <strong>${escapeHTML(sz.type || "Seizure")}</strong>
          <span class="record-when">${formatWhen(when)}</span>
          ${sz.durationSeconds ? `
            <span class="record-when">· ${formatDuration(sz.durationSeconds)}</span>
          ` : ""}
        </span>
        <span class="dose-row-actions">
          <button type="button" class="btn btn-small"
                  data-action="edit" data-id="${sz.id}"
                  aria-label="Edit seizure, ${formatWhen(when)}">Edit</button>
          <button type="button" class="btn btn-small btn-danger"
                  data-action="delete" data-id="${sz.id}"
                  aria-label="Delete seizure, ${formatWhen(when)}">Delete</button>
        </span>
      </div>

      ${triggerLabels.length ? `
        <p class="seizure-meta">
          <span class="meta-label">Triggers:</span>
          ${triggerLabels.map(escapeHTML).join(", ")}
        </p>
      ` : ""}

      ${notes.length ? `
        <div class="seizure-notes">
          ${notes.map((n) => `
            <p class="record-note">${escapeHTML(n.text)}
              <span class="record-when">${formatWhen(new Date(n.createdAt))}</span>
            </p>
          `).join("")}
        </div>
      ` : ""}
    </li>
  `;
}

// ---------------------------------------------------------------------------
// Shared with dashboard
// ---------------------------------------------------------------------------

/** Seizures from the last `days` days, capped at `max` entries, newest first. */
export function recentSeizures(days = 30, max = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return getAll("seizures")
    .filter((s) => new Date(s.startedAt) >= cutoff)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, max);
}

export function notesForSeizure(seizureId) {
  return getAll("notes")
    .filter((n) => n.linkedTo?.type === "seizure" && n.linkedTo.id === seizureId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Open the seizures view ready to log — used by the sidebar emergency button. */
export function openSeizureLog() {
  editingId = null;
  location.hash = "#seizures";
  // If we're already on #seizures the hashchange won't fire — render directly.
  renderSeizures();
  document.getElementById("sz-when")?.focus();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

function localDatetimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
