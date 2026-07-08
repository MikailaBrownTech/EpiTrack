/**
 * EpiTrack — scripts/triggers.js
 * Triggers view: add/delete triggers, see how often each appears in
 * seizure logs, and open a modal listing every seizure that cited it.
 *
 * Uses the native <dialog> element for the modal: showModal() gives us
 * focus trapping, Esc-to-close, and a backdrop for free.
 */

import { getAll, getById, insert, softDelete } from "./storage.js";
import { notesForSeizure } from "./seizures.js";

const mount = document.getElementById("view-triggers");

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderTriggers() {
  const triggers = getAll("triggers");
  const seizures = getAll("seizures");

  // Count how many seizures cite each trigger
  const counts = new Map();
  for (const sz of seizures) {
    for (const id of sz.triggersSuspected ?? []) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  mount.innerHTML = `
    <form class="card med-form" id="trigger-form" novalidate>
      <h2>Add a trigger</h2>
      <div class="field-row trigger-form-row">
        <div class="field">
          <label for="trigger-label">Trigger name</label>
          <input id="trigger-label" name="label" type="text" required
                 autocomplete="off" placeholder="e.g. Loud noise, skipped nap" />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Add trigger</button>
        </div>
      </div>
      <p class="form-error" id="trigger-form-error" role="alert" hidden></p>
    </form>

    <h2 class="section-heading">Your triggers</h2>
    <ul class="record-list card" id="trigger-list">
      ${triggers.map((t) => triggerItem(t, counts.get(t.id) ?? 0)).join("")}
    </ul>
    ${triggers.length === 0 ? `
      <p class="empty-state">No triggers yet. Add the things you suspect —
      they'll appear as checkboxes when you log a seizure.</p>
    ` : ""}

    <dialog id="trigger-modal" class="trigger-modal" aria-labelledby="trigger-modal-title">
      <div class="trigger-modal-head">
        <h2 id="trigger-modal-title">Seizure activity</h2>
        <button type="button" class="btn btn-small" id="trigger-modal-close">Close</button>
      </div>
      <div id="trigger-modal-body"></div>
    </dialog>
  `;

  document.getElementById("trigger-form").addEventListener("submit", (e) => {
    e.preventDefault();
    saveTrigger(e.target);
  });

  document.getElementById("trigger-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "activity") openActivityModal(id);
    if (action === "delete") deleteTrigger(id);
  });

  const modal = document.getElementById("trigger-modal");
  document.getElementById("trigger-modal-close")
    .addEventListener("click", () => modal.close());
  // Click on the backdrop closes too
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.close();
  });
}

function triggerItem(trigger, count) {
  return `
    <li class="dose-row">
      <span class="dose-row-main">
        <strong>${escapeHTML(trigger.label)}</strong>
        <span class="record-when">
          ${count === 0 ? "not cited yet"
            : count === 1 ? "cited in 1 seizure"
            : `cited in ${count} seizures`}
        </span>
      </span>
      <span class="dose-row-actions">
        ${count > 0 ? `
          <button type="button" class="btn btn-small"
                  data-action="activity" data-id="${trigger.id}"
                  aria-label="View seizure activity for ${escapeHTML(trigger.label)}">
            View seizure activity
          </button>
        ` : ""}
        <button type="button" class="btn btn-small btn-danger"
                data-action="delete" data-id="${trigger.id}"
                aria-label="Delete trigger ${escapeHTML(trigger.label)}">
          Delete
        </button>
      </span>
    </li>
  `;
}

// ---------------------------------------------------------------------------
// Add / delete
// ---------------------------------------------------------------------------

function saveTrigger(form) {
  const data = new FormData(form);
  const label = (data.get("label") || "").trim();
  const error = document.getElementById("trigger-form-error");

  if (!label) return showError(error, "Enter a trigger name.");

  const exists = getAll("triggers")
    .some((t) => t.label.toLowerCase() === label.toLowerCase());
  if (exists) return showError(error, `"${label}" is already in your triggers.`);

  insert("triggers", { label, builtin: false });
  announce(`Trigger "${label}" added.`);
  renderTriggers();
}

function deleteTrigger(id) {
  const trigger = getById("triggers", id);
  if (!trigger) return;

  const citedCount = getAll("seizures")
    .filter((s) => (s.triggersSuspected ?? []).includes(id)).length;

  const message = citedCount > 0
    ? `Delete "${trigger.label}"? It's cited in ${citedCount} seizure ${citedCount === 1 ? "entry" : "entries"} — those records keep the link, but it won't appear as an option going forward.`
    : `Delete "${trigger.label}"?`;

  if (!window.confirm(message)) return;

  softDelete("triggers", id);
  announce(`Trigger "${trigger.label}" deleted.`);
  renderTriggers();
}

// ---------------------------------------------------------------------------
// Activity modal
// ---------------------------------------------------------------------------

function openActivityModal(triggerId) {
  const trigger = getById("triggers", triggerId);
  if (!trigger) return;

  const seizures = getAll("seizures")
    .filter((s) => (s.triggersSuspected ?? []).includes(triggerId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  document.getElementById("trigger-modal-title").textContent =
    `Seizures citing "${trigger.label}" (${seizures.length})`;

  document.getElementById("trigger-modal-body").innerHTML = `
    <ul class="record-list">
      ${seizures.map((sz) => {
        const when = new Date(sz.startedAt);
        const notes = notesForSeizure(sz.id);
        return `
          <li>
            <strong>${escapeHTML(sz.type || "Seizure")}</strong>
            <span class="record-when">${formatWhen(when)}</span>
            ${sz.durationSeconds ? `
              <span class="record-when">· ${formatDuration(sz.durationSeconds)}</span>
            ` : ""}
            ${notes.length ? `
              <span class="record-note">${escapeHTML(notes[notes.length - 1].text)}</span>
            ` : ""}
          </li>
        `;
      }).join("")}
    </ul>
  `;

  document.getElementById("trigger-modal").showModal();
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

function formatWhen(date) {
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
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
