/**
 * EpiTrack — scripts/notes.js
 * Notes view: a read-only feed of every journal note attached to a seizure,
 * newest first, each labeled with its seizure. Individual notes can be
 * edited or deleted here (the seizure form only appends new ones).
 *
 * Notes are stored in the `notes` collection and linked to a seizure via
 * linkedTo: { type: "seizure", id }. This view surfaces them all in one place.
 */

import { getAll, getById, update, softDelete, nowISO } from "./storage.js";
import { notesForSeizure } from "./seizures.js";

const mount = document.getElementById("view-notes");

// null = not editing; a note id = that note's row is in edit mode
let editingId = null;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderNotes() {
  // Only seizure-linked notes, newest first
  const notes = getAll("notes")
    .filter((n) => n.linkedTo?.type === "seizure")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  mount.innerHTML = `
    <p class="view-intro">
      Every note you've added to a seizure, newest first.
      Add new notes from a seizure entry on the
      <a href="#seizures" data-view="seizures">Seizures</a> page.
    </p>

    <ul class="record-list card" id="notes-list">
      ${notes.map(noteRow).join("")}
    </ul>
    ${notes.length === 0 ? `
      <p class="empty-state">No notes yet. When you log a seizure, anything you
      write in its journal box will appear here.</p>
    ` : ""}

    <dialog id="note-seizure-modal" class="trigger-modal" aria-labelledby="note-modal-title">
      <div class="trigger-modal-head">
        <h2 id="note-modal-title">Seizure activity</h2>
        <button type="button" class="btn btn-small" id="note-modal-close">Close</button>
      </div>
      <div id="note-modal-body"></div>
    </dialog>
  `;

  document.getElementById("notes-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "edit") { editingId = id; renderNotes(); }
    if (action === "cancel") { editingId = null; renderNotes(); }
    if (action === "save") saveEdit(id);
    if (action === "delete") deleteNote(id);
    if (action === "activity") openSeizureModal(id);
  });

  const modal = document.getElementById("note-seizure-modal");
  document.getElementById("note-modal-close")
    .addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.close();
  });

  if (editingId) {
    const field = document.getElementById(`note-edit-${editingId}`);
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }
}

function noteRow(note) {
  const seizure = getById("seizures", note.linkedTo.id);
  const context = seizureContext(seizure);
  const created = new Date(note.createdAt);
  const edited = note.updatedAt && note.updatedAt !== note.createdAt;

  if (editingId === note.id) {
    return `
      <li class="note-row">
        <p class="note-context">${context}</p>
        <textarea class="note-edit-field" id="note-edit-${note.id}"
                  rows="3" aria-label="Edit note">${escapeHTML(note.text)}</textarea>
        <div class="note-actions">
          <button type="button" class="btn btn-small btn-primary"
                  data-action="save" data-id="${note.id}">Save</button>
          <button type="button" class="btn btn-small"
                  data-action="cancel" data-id="${note.id}">Cancel</button>
        </div>
      </li>
    `;
  }

  return `
    <li class="note-row">
      <p class="note-context">${context}</p>
      <p class="note-text">${escapeHTML(note.text)}</p>
      <p class="note-foot">
        <span class="record-when">${formatWhen(created)}${edited ? " · edited" : ""}</span>
        <span class="note-actions">
          ${seizure ? `
            <button type="button" class="btn btn-small"
                    data-action="activity" data-id="${note.id}"
                    aria-label="View seizure activity for this note">View seizure</button>
          ` : ""}
          <button type="button" class="btn btn-small"
                  data-action="edit" data-id="${note.id}"
                  aria-label="Edit note from ${formatWhen(created)}">Edit</button>
          <button type="button" class="btn btn-small btn-danger"
                  data-action="delete" data-id="${note.id}"
                  aria-label="Delete note from ${formatWhen(created)}">Delete</button>
        </span>
      </p>
    </li>
  `;
}

/** Label a note with the seizure it belongs to. */
function seizureContext(seizure) {
  if (!seizure) return `<span class="meta-label">Seizure:</span> (deleted seizure)`;
  const when = new Date(seizure.startedAt);
  return `<span class="meta-label">${escapeHTML(seizure.type || "Seizure")}</span>
          <span class="record-when">${formatWhen(when)}</span>`;
}

// ---------------------------------------------------------------------------
// Seizure activity modal
// ---------------------------------------------------------------------------

/** Open a modal showing the full seizure this note belongs to. */
function openSeizureModal(noteId) {
  const note = getById("notes", noteId);
  const seizure = note ? getById("seizures", note.linkedTo.id) : null;
  if (!seizure) return;

  const when = new Date(seizure.startedAt);
  const triggers = getAll("triggers");
  const triggerLabels = (seizure.triggersSuspected ?? [])
    .map((id) => triggers.find((t) => t.id === id)?.label)
    .filter(Boolean);
  const allNotes = notesForSeizure(seizure.id);

  document.getElementById("note-modal-title").textContent =
    `${seizure.type || "Seizure"} — ${formatWhen(when)}`;

  document.getElementById("note-modal-body").innerHTML = `
    <dl class="med-details modal-details">
      <div><dt>When</dt><dd>${formatWhen(when)}</dd></div>
      <div><dt>Duration</dt><dd>${
        seizure.durationSeconds ? formatDuration(seizure.durationSeconds) : "Not recorded"
      }</dd></div>
      <div><dt>Triggers</dt><dd>${
        triggerLabels.length ? triggerLabels.map(escapeHTML).join(", ") : "None recorded"
      }</dd></div>
    </dl>

    <h3 class="modal-subhead">Notes on this seizure (${allNotes.length})</h3>
    <ul class="record-list">
      ${allNotes.map((n) => {
        const isCurrent = n.id === noteId;
        return `
          <li class="${isCurrent ? "note-highlight" : ""}">
            <span class="note-text">${escapeHTML(n.text)}</span>
            <span class="record-when">${formatWhen(new Date(n.createdAt))}${
              isCurrent ? " · this note" : ""
            }</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;

  document.getElementById("note-seizure-modal").showModal();
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

// ---------------------------------------------------------------------------
// Edit / delete
// ---------------------------------------------------------------------------

function saveEdit(id) {
  const field = document.getElementById(`note-edit-${id}`);
  const text = (field?.value ?? "").trim();

  if (!text) {
    // Empty text: treat Save as a delete-intent guard, keep editing instead.
    field?.focus();
    return;
  }

  update("notes", id, { text, updatedAt: nowISO() });
  editingId = null;
  announce("Note updated.");
  renderNotes();
}

function deleteNote(id) {
  const ok = window.confirm("Delete this note? This can't be undone from the app.");
  if (!ok) return;

  if (editingId === id) editingId = null;
  softDelete("notes", id);
  announce("Note deleted.");
  renderNotes();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWhen(date) {
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
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
