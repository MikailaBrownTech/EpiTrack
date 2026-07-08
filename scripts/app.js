/**
 * EpiTrack — app.js
 * View switching + app startup.
 */

import { initStorage } from "./storage.js";
import { renderMedications } from "./medications.js";
import { renderDoses } from "./doses.js";
import { renderDashboard } from "./dashboard.js";
import { renderSeizures, openSeizureLog } from "./seizures.js";
import { renderTriggers } from "./triggers.js";
import { renderNotes } from "./notes.js";

// Views that need a render function when shown
const RENDERERS = {
  dashboard: renderDashboard,
  medications: renderMedications,
  doses: renderDoses,
  seizures: renderSeizures,
  triggers: renderTriggers,
  notes: renderNotes,
};


const VIEWS = {
  dashboard:   { title: "Dashboard",   subtitle: "Today at a glance" },
  medications: { title: "Medications", subtitle: "Manage your child's medications" },
  doses:       { title: "Dose log",    subtitle: "Taken and missed doses" },
  seizures:    { title: "Seizures",    subtitle: "Seizure event history" },
  triggers:    { title: "Triggers",    subtitle: "Suspected seizure triggers" },
  notes:       { title: "Notes",       subtitle: "Observations and reminders" },
};

const DEFAULT_VIEW = "dashboard";

function showView(name) {
  if (!VIEWS[name]) name = DEFAULT_VIEW;

  // Show the matching section, hide the rest
  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== `view-${name}`;
  });

  // Move the active state on the nav
  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.view === name) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  // Update the page heading
  document.getElementById("view-title").textContent = VIEWS[name].title;
  document.getElementById("view-subtitle").textContent = VIEWS[name].subtitle;

    // Render the view's content if it has a renderer
  RENDERERS[name]?.();

}

function currentViewFromHash() {
  return location.hash.replace("#", "") || DEFAULT_VIEW;
}

// Clicks: links already set location.hash via href="#...",
// so we just listen for hash changes — this also makes
// back/forward buttons and page refresh work for free.
window.addEventListener("hashchange", () => showView(currentViewFromHash()));

// ---- Startup ----
initStorage();
showView(currentViewFromHash());
