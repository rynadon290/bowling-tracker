// Bowling ball drilling layouts.
//
// Three systems are supported. All three happen to use three numbers, but
// they measure genuinely DIFFERENT reference points -- so each needs its
// own labeled fields rather than a generic "three numbers" form, and a
// layout is only meaningful alongside the system it was recorded in.
//
//   Dual Angle (Mo Pinel / MoRich) -- the modern industry standard:
//     drilling angle (deg), pin-to-PAP (in), VAL angle (deg)
//     e.g. 60 x 4.5 x 35
//
//   VLS / Pin Buffer (Storm's Vector Layout System):
//     pin-to-PAP (in), PSA-to-PAP (in), pin buffer / pin-to-VAL (in)
//     e.g. 4 x 4 x 2
//
//   2LS (Two-Handed Layout System), built for two-handed/no-thumb players:
//     pin-to-PAP (in), pin-to-COG (in), PSA-to-PAP (in)
//     e.g. 5 x 4 x 3.5
//
// Stored per ball as { system, values: {…} }. An empty/absent layout is
// always valid -- recording a layout is optional, and a ball with no
// layout recorded should never look like an error.

export const LAYOUT_SYSTEMS = ["dual_angle", "vls", "2ls"];

export const LAYOUT_SYSTEM_LABELS = {
  dual_angle: "Dual Angle",
  vls: "VLS (Pin Buffer)",
  "2ls": "2LS (Two-Handed)",
};

// Each field carries its own unit and sane range so the UI can label and
// validate without duplicating this knowledge.
export const LAYOUT_FIELDS = {
  dual_angle: [
    { key: "drillingAngle", label: "Drilling Angle", unit: "°", min: 10, max: 90, step: 1 },
    { key: "pinToPap", label: "Pin-to-PAP", unit: '"', min: 0, max: 6.75, step: 0.25 },
    { key: "valAngle", label: "VAL Angle", unit: "°", min: 0, max: 90, step: 1 },
  ],
  vls: [
    { key: "pinToPap", label: "Pin-to-PAP", unit: '"', min: 0, max: 6.75, step: 0.25 },
    { key: "psaToPap", label: "PSA-to-PAP", unit: '"', min: 0, max: 6.75, step: 0.25 },
    { key: "pinBuffer", label: "Pin Buffer", unit: '"', min: 0, max: 6.75, step: 0.25 },
  ],
  "2ls": [
    { key: "pinToPap", label: "Pin-to-PAP", unit: '"', min: 0, max: 6.75, step: 0.25 },
    { key: "pinToCog", label: "Pin-to-COG", unit: '"', min: 0, max: 6.75, step: 0.25 },
    { key: "psaToPap", label: "PSA-to-PAP", unit: '"', min: 0, max: 6.75, step: 0.25 },
  ],
};

export function isValidSystem(system) {
  return LAYOUT_SYSTEMS.includes(system);
}

export function emptyLayout(system = "dual_angle") {
  const safeSystem = isValidSystem(system) ? system : "dual_angle";
  const values = {};
  for (const f of LAYOUT_FIELDS[safeSystem]) values[f.key] = "";
  return { system: safeSystem, values };
}

// Normalizes stored data (which may predate a system being added, or be
// malformed) into something safe to render. Never throws.
export function normalizeLayout(raw) {
  if (!raw || typeof raw !== "object" || !isValidSystem(raw.system)) return null;
  const base = emptyLayout(raw.system);
  const values = {};
  for (const f of LAYOUT_FIELDS[raw.system]) {
    const v = raw.values?.[f.key];
    values[f.key] = v === undefined || v === null ? "" : String(v);
  }
  return { system: raw.system, values };
}

// True only when every field of the layout's system has a value. A partial
// layout is allowed to exist (mid-entry), it just isn't "complete".
export function isLayoutComplete(layout) {
  const n = normalizeLayout(layout);
  if (!n) return false;
  return LAYOUT_FIELDS[n.system].every(f => n.values[f.key] !== "" && !Number.isNaN(Number(n.values[f.key])));
}

// Per-field validation errors, keyed by field. Blank is never an error
// here (that's what isLayoutComplete is for) -- this catches values that
// are present but nonsensical, like a 200-degree drilling angle.
export function layoutFieldErrors(layout) {
  const n = normalizeLayout(layout);
  if (!n) return {};
  const errors = {};
  for (const f of LAYOUT_FIELDS[n.system]) {
    const raw = n.values[f.key];
    if (raw === "") continue;
    const num = Number(raw);
    if (Number.isNaN(num)) errors[f.key] = "Not a number";
    else if (num < f.min) errors[f.key] = `Min ${f.min}${f.unit}`;
    else if (num > f.max) errors[f.key] = `Max ${f.max}${f.unit}`;
  }
  return errors;
}

// Short display form, e.g. "60° x 4.5\" x 35°". Returns "" for anything
// incomplete so callers can fall back to a placeholder.
export function formatLayout(layout) {
  const n = normalizeLayout(layout);
  if (!n || !isLayoutComplete(n)) return "";
  return LAYOUT_FIELDS[n.system]
    .map(f => `${n.values[f.key]}${f.unit}`)
    .join(" x ");
}

export function setLayoutSystem(layout, system) {
  // Switching systems starts fresh -- the numbers mean different things in
  // each system, so carrying them over would silently misrepresent the
  // drilling rather than help.
  return emptyLayout(system);
}

export function setLayoutValue(layout, field, value) {
  const n = normalizeLayout(layout) || emptyLayout();
  return { ...n, values: { ...n.values, [field]: value } };
}
