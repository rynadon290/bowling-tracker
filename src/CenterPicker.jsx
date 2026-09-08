import { useState, useRef, useEffect } from "react";
import { C, S, Chip } from "./ui.jsx";
import { centerLabel, distanceMiles } from "./domain/centers.js";

// Picks the bowling center a league plays at.
//
// Debounced deliberately: HERE bills per API call rather than per session,
// so firing on every keystroke would burn the free allowance for no benefit.
//
// Manual entry is always available, not a fallback for errors only. Small
// houses are genuinely missing from HERE's data, and a league at one must
// still be recordable.
export default function CenterPicker({ leagueName, currentCenter, onSelect, onSearch }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [manualName, setManualName] = useState("");
  const [showManual, setShowManual] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleQueryChange(value) {
    setQuery(value);
    setError(null);
    clearTimeout(timer.current);
    if (value.trim().length < 3) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("searching");
    // 600ms after typing stops, not per keystroke.
    timer.current = setTimeout(async () => {
      const out = await onSearch(value.trim());
      if (out.error) {
        setError(out.error);
        setResults([]);
        setStatus("idle");
        return;
      }
      setResults(out.centers || []);
      setStatus(out.centers?.length ? "done" : "empty");
    }, 600);
  }

  return (
    <div>
      <div style={S.label}>Bowling Center</div>

      {currentCenter ? (
        <div style={{ padding: "8px 10px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.accent}44`, marginBottom: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>{currentCenter.name}</div>
          {currentCenter.address && (
            <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>{currentCenter.address}</div>
          )}
          <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px", marginTop: "6px" }}
            onClick={() => onSelect(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          {/* Practice and Casual are container "leagues", not real ones, so
              the league phrasing reads as if Practice were a person --
              "Where does Practice bowl?". Same question, asked the way it
              makes sense for each. */}
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
            {leagueName === "Practice"
              ? "Where do you usually practice? Setting it lets you compare how you score house to house."
              : leagueName === "Casual"
                ? "Where do you usually bowl for fun? Setting it lets you compare how you score house to house."
                : `Where does ${leagueName || "this league"} bowl? Set once per season — it lets you compare how you score house to house.`}
          </div>

          <input style={S.input} placeholder="Search by name, e.g. Arsenal Bowl"
            value={query} onChange={e => handleQueryChange(e.target.value)} />

          {status === "searching" && (
            <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>Searching…</div>
          )}

          {error && (
            <div style={{ fontSize: "11px", color: C.miss, marginTop: "6px" }}>{error}</div>
          )}

          {status === "empty" && !error && (
            <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>
              No centers found nearby. You can add it by name below.
            </div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop: "8px", border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" }}>
              {results.map(center => {
                const miles = distanceMiles(center.distance);
                return (
                  <button key={center.hereId || center.name}
                    style={{
                      display: "block", width: "100%", textAlign: "left", background: "none",
                      border: "none", borderBottom: `1px solid ${C.border}`, padding: "8px 10px",
                      cursor: "pointer", color: C.text,
                    }}
                    onClick={() => onSelect(center)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>{center.name}</span>
                      {miles !== null && (
                        <span style={{ fontSize: "10px", color: C.textMuted }}>{miles} mi</span>
                      )}
                    </div>
                    {center.address && (
                      <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>{center.address}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Always available, not just on failure -- small houses are
              genuinely missing from HERE's data. */}
          {!showManual ? (
            <button style={{ ...S.btn(), width: "100%", marginTop: "8px", fontSize: "12px" }}
              onClick={() => setShowManual(true)}>
              Can't find it? Add by name
            </button>
          ) : (
            <div style={{ marginTop: "8px" }}>
              <div style={S.row}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Center name"
                  value={manualName} onChange={e => setManualName(e.target.value)} />
                <button style={S.btn("sm")} disabled={!manualName.trim()}
                  onClick={() => { onSelect({ name: manualName.trim() }); setManualName(""); setShowManual(false); }}>
                  +
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
