/**
 * EpiTrack — medications.js
 * Medications view: list all medications + add-medication form.
 * Reads and writes through storage.js only.
 */

import { getAll, getById, insert, update, softDelete } from "./storage.js";

const mount = document.getElementById("view-medications");

// Most medications are dosed 1–4 times daily; cap generously to catch runaway input.
const MAX_TIMES = 6;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderMedications() {
  const meds = getAll("medications");

  mount.innerHTML = `
    <div class="view-toolbar">
      <button type="button" class="btn btn-primary" id="add-med-btn">
        Add medication
      </button>
    </div>

    <div id="med-form-slot"></div>

    <ul class="med-list" id="med-list">
      ${meds.map(medCard).join("")}
    </ul>

    ${meds.length === 0 ? `
      <p class="empty-state">
        No medications yet. Select <strong>Add medication</strong> to add the first one.
      </p>` : ""}
  `;

  document.getElementById("add-med-btn")
    .addEventListener("click", () => openMedForm());

    // One listener on the list handles every card's Edit/Delete buttons
  document.getElementById("med-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "edit") openMedForm(id);
    if (action === "delete") deleteMedication(id);
  });

}

function medCard(med) {
  const r = currentRegimen(med);
  const doseText = r ? `${r.doseAmount} ${r.doseUnit}` : "No dose set";
  const timesText = r && r.schedule.length
    ? r.schedule.map((s) => s.time).join(", ")
    : "No times set";
 
  return `
    <li class="card med-card">
      <h2>${escapeHTML(med.name)}</h2>
      <dl class="med-details">
        <div><dt>Dose</dt><dd>${escapeHTML(doseText)}</dd></div>
        <div><dt>Times</dt><dd>${escapeHTML(timesText)}</dd></div>
        <div><dt>Form</dt><dd>${escapeHTML(med.form || "—")}</dd></div>
      </dl>
      <div class="card-actions">
        <button type="button" class="btn btn-small"
                data-action="edit" data-id="${med.id}">
          Edit
        </button>
        <button type="button" class="btn btn-small btn-danger"
                data-action="delete" data-id="${med.id}"
                aria-label="Delete ${escapeHTML(med.name)}">
          Delete
        </button>
      </div>
    </li>
  `;
}

function timeRow(value = "") {
  return `
    <div class="time-row">
      <input type="time" name="times" aria-label="Dose time"
             value="${escapeHTML(value)}" />
      <button type="button" class="btn btn-small btn-danger"
              data-remove-time aria-label="Remove this time">
        Remove
      </button>
    </div>
  `;
}


function currentRegimen(med) {
  return (med.regimens ?? []).find((r) => !r.endDate) ?? null;
}

// ---------------------------------------------------------------------------
// Add form
// ---------------------------------------------------------------------------

function openMedForm(medId) {

  if (medId !== undefined && typeof medId !== "string") {
    throw new Error(`openMedForm expected a string id, got ${typeof medId}`);
  }

  const slot = document.getElementById("med-form-slot");
  const med = medId ? getById("medications", medId) : null;
  const regimen = med ? currentRegimen(med) : null;
 
  const times = regimen?.schedule.length
    ? regimen.schedule.map((s) => s.time)
    : ["08:00"];
 
  slot.innerHTML = `
    <form class="card med-form" id="med-form" novalidate>
      <h2>${med ? `Edit ${escapeHTML(med.name)}` : "Add medication"}</h2>
 
      <div class="field">
        <label for="med-name">Medication name</label>
        <input id="med-name" name="name" type="text" required
               autocomplete="off" placeholder="e.g. Keppra"
               value="${med ? escapeHTML(med.name) : ""}" />
      </div>
 
      <div class="field-row">
        <div class="field">
          <label for="med-dose">Dose amount</label>
          <input id="med-dose" name="doseAmount" type="number"
                 min="0" step="any" required placeholder="250"
                 value="${regimen ? regimen.doseAmount : ""}" />
        </div>
        <div class="field">
          <label for="med-unit">Unit</label>
          <select id="med-unit" name="doseUnit">
            ${["mg", "ml", "tablet"].map((u) => `
              <option value="${u}" ${regimen?.doseUnit === u ? "selected" : u === "mg" && !regimen ? "selected" : ""}>
                ${u === "tablet" ? "tablet(s)" : u}
              </option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="med-formfactor">Form</label>
          <select id="med-formfactor" name="form">
            ${["liquid", "tablet", "capsule", "other"].map((f) => `
              <option value="${f}" ${med?.form === f ? "selected" : f === "liquid" && !med ? "selected" : ""}>
                ${f[0].toUpperCase() + f.slice(1)}
              </option>`).join("")}
          </select>
        </div>
      </div>
 
      <fieldset class="field">
        <legend>Times given each day</legend>
        <div id="time-inputs">
          ${times.map((t) => timeRow(t)).join("")}
        </div>
        <button type="button" class="btn btn-small" id="add-time-btn">
          Add another time
        </button>
      </fieldset>
 
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">
          ${med ? "Save changes" : "Save medication"}
        </button>
        <button type="button" class="btn" id="cancel-med-btn">Cancel</button>
      </div>
 
      <p class="form-error" id="med-form-error" role="alert" hidden></p>
    </form>
  `;
 
  const form = document.getElementById("med-form");
  form.querySelector("#med-name").focus();
 
  const addTimeBtn = form.querySelector("#add-time-btn");
  const timeWrap = form.querySelector("#time-inputs");

  // Enable/disable "Add another time" based on how many rows exist.
  function refreshTimeControls() {
    const count = timeWrap.querySelectorAll(".time-row").length;
    addTimeBtn.disabled = count >= MAX_TIMES;
    addTimeBtn.textContent = count >= MAX_TIMES
      ? `Maximum ${MAX_TIMES} times`
      : "Add another time";
  }
  refreshTimeControls();

  addTimeBtn.addEventListener("click", () => {
    if (timeWrap.querySelectorAll(".time-row").length >= MAX_TIMES) return;
    timeWrap.insertAdjacentHTML("beforeend", timeRow());
    timeWrap.querySelector(".time-row:last-child input").focus();
    refreshTimeControls();
  });

  // One listener handles Remove for every row, including rows added later.
  timeWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-time]");
    if (!btn) return;
    btn.closest(".time-row").remove();
    refreshTimeControls();
    addTimeBtn.focus();
  });
 
  form.querySelector("#cancel-med-btn").addEventListener("click", () => {
    slot.innerHTML = "";
    document.getElementById("add-med-btn").focus();
  });
 
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveMedication(form, medId);
  });
}


function saveMedication(form, medId) {
  const data = new FormData(form);
  const name = (data.get("name") || "").trim();
  const doseAmount = Number(data.get("doseAmount"));
  const times = data.getAll("times").filter(Boolean);
 
  const error = document.getElementById("med-form-error");
  if (!name) return showError(error, "Enter a medication name.");
  if (!doseAmount || doseAmount <= 0) return showError(error, "Enter a dose amount greater than zero.");
  if (times.length === 0) return showError(error, "Add at least one time of day.");
 
  const regimen = {
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    doseAmount,
    doseUnit: data.get("doseUnit"),
    schedule: times.map((t) => ({ time: t, label: "" })),
  };
 
  if (medId) {
    // Edit: keep the medication's identity, replace current regimen values
    const med = getById("medications", medId);
    const regimens = [...(med.regimens ?? [])];
    const idx = regimens.findIndex((r) => !r.endDate);
    if (idx >= 0) {
      regimen.startDate = regimens[idx].startDate; // preserve original start
      regimens[idx] = regimen;
    } else {
      regimens.push(regimen);
    }
    update("medications", medId, {
      name,
      form: data.get("form"),
      regimens,
    });
    announce(`${name} updated.`);
  } else {
    insert("medications", {
      name,
      form: data.get("form"),
      active: true,
      regimens: [regimen],
    });
    announce(`${name} saved.`);
  }
 
  renderMedications();
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
 
function deleteMedication(medId) {
  const med = getById("medications", medId);
  if (!med) return;
 
  const ok = window.confirm(
    `Delete ${med.name}? Its past dose history will be kept.`
  );
  if (!ok) return;
 
  softDelete("medications", medId);
  announce(`${med.name} deleted.`);
  renderMedications();
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
