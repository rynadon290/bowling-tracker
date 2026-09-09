// ── Signup codes ────────────────────────────────────────────────────────
//
// A captain at the lanes has four teammates and two email addresses.
// Requiring an email closed a real security hole, but it left that
// captain stuck -- so the alternative is a code they can text.
//
// The teammate signs up, enters the code, and lands on that exact roster
// spot with everything already logged under their name. Consent is
// intact: the code holder chooses to enter it, so nobody is added to a
// roster without acting.

// No 0/O/1/I/L. A code read off a text message and typed by hand gets
// mistyped, and an ambiguous character is a support problem forever.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateSignupCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  // Hyphenated in the middle: easier to read aloud and to retype.
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

// Accept what someone actually types: lowercase, spaces, missing hyphen.
export function normalizeSignupCode(raw) {
  const cleaned = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}` : cleaned;
}

export function isValidSignupCode(raw) {
  // Checked against the RAW input, not the normalized form.
  //
  // normalizeSignupCode truncates to eight characters so a stray
  // character doesn't break the display -- which means a nine-character
  // mistype would normalize to something valid-looking and be sent to
  // the server as a different code entirely. A wrong length is a
  // mistype, and saying so locally beats a confusing rejection later.
  const c = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 8) return false;
  return [...c].every(ch => CODE_ALPHABET.includes(ch));
}
