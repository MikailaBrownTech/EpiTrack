/**
 * EpiTrack — medications.js
 * Medications view: list all medications + add-medication form.
 * Reads and writes through storage.js only.
 */

import { getAll, insert } from "./storage.js";

const mount = document.getElementById("view-medications");

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
    .addEventListener("click", openAddForm);
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
    </li>
  `;
}

function currentRegimen(med) {
  return (med.regimens ?? []).find((r) => !r.endDate) ?? null;
}

// ---------------------------------------------------------------------------
// Add form
// ---------------------------------------------------------------------------

function openAddForm() {
  const slot = document.getElementById("med-form-slot");
  if (slot.querySelector("form")) return; // already open

  slot.innerHTML = `
    <form class="card med-form" id="med-form" novalidate>
      <h2>Add medication</h2>

      <div class="field">
        <label for="med-name">Medication name</label>
        <input id="med-name" name="name" type="text" required
               autocomplete="off" placeholder="e.g. Keppra" />
      </div>

      <div class="field-row">
        <div class="field">
          <label for="med-dose">Dose amount</label>
          <input id="med-dose" name="doseAmount" type="number"
                 min="0" step="any" required placeholder="250" />
        </div>
        <div class="field">
          <label for="med-unit">Unit</label>
          <select id="med-unit" name="doseUnit">
            <option value="mg" selected>mg</option>
            <option value="ml">ml</option>
            <option value="tablet">tablet(s)</option>
          </select>
        </div>
        <div class="field">
          <label for="med-formfactor">Form</label>
          <select id="med-formfactor" name="form">
            <option value="liquid" selected>Liquid</option>
            <option value="tablet">Tablet</option>
            <option value="capsule">Capsule</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <fieldset class="field">
        <legend>Times given each day</legend>
        <div id="time-inputs">
          <input type="time" name="times" aria-label="Dose time 1" value="08:00" />
        </div>
        <button type="button" class="btn btn-small" id="add-time-btn">
          Add another time
        </button>
      </fieldset>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save medication</button>
        <button type="button" class="btn" id="cancel-med-btn">Cancel</button>
      </div>

      <p class="form-error" id="med-form-error" role="alert" hidden></p>
    </form>
  `;

  const form = document.getElementById("med-form");
  form.querySelector("#med-name").focus();

  form.querySelector("#add-time-btn").addEventListener("click", () => {
    const wrap = form.querySelector("#time-inputs");
    const count = wrap.querySelectorAll("input").length + 1;
    const input = document.createElement("input");
    input.type = "time";
    input.name = "times";
    input.setAttribute("aria-label", `Dose time ${count}`);
    wrap.appendChild(input);
    input.focus();
  });

  form.querySelector("#cancel-med-btn").addEventListener("click", () => {
    slot.innerHTML = "";
    document.getElementById("add-med-btn").focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveMedication(form);
  });
}

function saveMedication(form) {
  const data = new FormData(form);
  const name = (data.get("name") || "").trim();
  const doseAmount = Number(data.get("doseAmount"));
  const times = data.getAll("times").filter(Boolean);

  const error = document.getElementById("med-form-error");
  if (!name) return showError(error, "Enter a medication name.");
  if (!doseAmount || doseAmount <= 0) return showError(error, "Enter a dose amount greater than zero.");
  if (times.length === 0) return showError(error, "Add at least one time of day.");

  insert("medications", {
    name,
    form: data.get("form"),
    active: true,
    regimens: [
      {
        startDate: new Date().toISOString().slice(0, 10),
        endDate: null,
        doseAmount,
        doseUnit: data.get("doseUnit"),
        schedule: times.map((t) => ({ time: t, label: "" })),
      },
    ],
  });

  announce(`${name} saved.`);
  renderMedications(); // re-render list; also clears the form
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
