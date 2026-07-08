/**
 * EpiTrack storage access layer
 * ------------------------------
 * All localStorage access goes through this module. Nothing else in the
 * app should touch localStorage directly.
 *
 * Design:
 *  - One localStorage key per collection (small writes, isolated corruption)
 *  - Append-mostly event logs; soft deletes only
 *  - Schema version + migration pipeline runs once on startup
 *  - In-memory cache so reads don't re-parse JSON on every call
 */

const NS = "epitrack";
const CURRENT_SCHEMA_VERSION = 1;

const COLLECTIONS = ["medications", "doseLog", "seizures", "notes", "triggers"];

// ---------------------------------------------------------------------------
// Low-level read/write with corruption guard
// ---------------------------------------------------------------------------

const cache = new Map();

function key(name) {
  return `${NS}.${name}`;
}

function rawRead(name, fallback) {
  const text = localStorage.getItem(key(name));
  if (text === null) return fallback;
  try {
    return JSON.parse(text);
  } catch (err) {
    // Corrupted JSON: preserve the bad blob for recovery, don't destroy it.
    console.error(`EpiTrack: corrupted data in ${name}, quarantining`, err);
    localStorage.setItem(`${key(name)}.corrupt.${Date.now()}`, text);
    return fallback;
  }
}

function rawWrite(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch (err) {
    // Most likely QuotaExceededError. Surface to the UI layer.
    throw new StorageError(
      "Could not save. Your browser storage may be full — export your data and contact support.",
      { cause: err }
    );
  }
}

export class StorageError extends Error {}

// ---------------------------------------------------------------------------
// Collection API
// ---------------------------------------------------------------------------

function load(name) {
  if (!cache.has(name)) {
    cache.set(name, rawRead(name, []));
  }
  return cache.get(name);
}

function persist(name) {
  rawWrite(name, cache.get(name));
}

export function getAll(name, { includeDeleted = false } = {}) {
  const items = load(name);
  return includeDeleted ? [...items] : items.filter((i) => !i.deletedAt);
}

export function getById(name, id) {
  return load(name).find((i) => i.id === id) ?? null;
}

export function insert(name, item) {
  const now = nowISO(); // single timestamp so createdAt === updatedAt on insert
  const record = {
    id: item.id ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...item,
  };
  load(name).push(record);
  persist(name);
  return record;
}

export function update(name, id, patch) {
  const items = load(name);
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new StorageError(`No ${name} record with id ${id}`);
  items[idx] = { ...items[idx], ...patch, id, updatedAt: nowISO() };
  persist(name);
  return items[idx];
}

export function softDelete(name, id) {
  return update(name, id, { deletedAt: nowISO() });
}

// Local time with UTC offset, e.g. "2026-07-07T08:12:00-04:00"
export function nowISO(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const abs = Math.abs(tz);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

// ---------------------------------------------------------------------------
// Meta / init / migrations
// ---------------------------------------------------------------------------

export function getMeta() {
  return rawRead("meta", null);
}

export function setMeta(patch) {
  const meta = { ...(getMeta() ?? {}), ...patch };
  rawWrite("meta", meta);
  return meta;
}

/**
 * Call once at app startup, before any other storage access.
 */
export function initStorage() {
  let meta = getMeta();

  if (!meta) {
    // First run
    meta = setMeta({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: nowISO(),
    });
    seedDefaults();
    return meta;
  }

  if (meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
    migrate(meta.schemaVersion);
    meta = setMeta({ schemaVersion: CURRENT_SCHEMA_VERSION });
  }

  return meta;
}

/**
 * Migration pipeline: each entry upgrades from version N to N+1.
 * When you change the schema, bump CURRENT_SCHEMA_VERSION and add a step.
 */
const MIGRATIONS = {
  // 1: () => { ...upgrade v1 data to v2 in place... },
};

function migrate(fromVersion) {
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new StorageError(`Missing migration from schema v${v}`);
    step();
  }
  cache.clear(); // force re-read of migrated data
}

function seedDefaults() {
  const defaults = [
    "Poor sleep",
    "Missed dose",
    "Fever / illness",
    "Stress",
    "Flashing lights",
    "Overheating",
  ];
  for (const label of defaults) {
    insert("triggers", { label, builtin: true });
  }
}

// ---------------------------------------------------------------------------
// Export / import (backup) - Used for debugging during development
// ---------------------------------------------------------------------------

export function exportAll() {
  const dump = { meta: getMeta() };
  for (const name of COLLECTIONS) {
    dump[name] = getAll(name, { includeDeleted: true });
  }
  return JSON.stringify(dump, null, 2);
}


export function importBackup(jsonText) {
  let dump;
  try {
    dump = JSON.parse(jsonText);
  } catch {
    throw new StorageError("That file isn't a valid EpiTrack backup.");
  }
  if (!dump.meta?.schemaVersion) {
    throw new StorageError("Backup file is missing metadata.");
  }
  rawWrite("meta", dump.meta);
  for (const name of COLLECTIONS) {
    rawWrite(name, dump[name] ?? []);
  }
  cache.clear();
  initStorage(); // run migrations if the backup is from an older version
}
