import { useState, useRef, useMemo, useCallback } from "react";
import axios from "axios";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// ─── Config ─────────────────────────────────────────────────
const API_URL = "https://ai-resume-analyzer-n2e3.onrender.com/api/resume/upload";
const MAX_FILE_SIZE_MB = 5;

// ─── Theme-aware Design Tokens ──────────────────────────────
const THEMES = {
  dark: {
    bg: "#08080C",
    surface: "rgba(20, 20, 28, 0.65)",
    surfaceSolid: "#14141C",
    inner: "rgba(255,255,255,0.02)",
    border: "rgba(255,255,255,0.08)",
    borderHover: "rgba(99,102,241,0.4)",
    text: "#F4F4F5",
    textSoft: "#D4D4D8",
    muted: "#A1A1AA",
    trail: "rgba(255,255,255,0.06)",
    glow: "rgba(99,102,241,0.16)",
    shadow: "0 8px 40px rgba(0,0,0,0.45)",
    headingGradient: "linear-gradient(135deg,#FFFFFF 25%,#A5B4FC)",
    headingFallback: "#FFFFFF",
  },
  light: {
    bg: "#F4F5FB",
    surface: "rgba(255, 255, 255, 0.75)",
    surfaceSolid: "#FFFFFF",
    inner: "rgba(0,0,0,0.02)",
    border: "rgba(15,23,42,0.08)",
    borderHover: "rgba(99,102,241,0.5)",
    text: "#0F172A",
    textSoft: "#334155",
    muted: "#64748B",
    trail: "rgba(15,23,42,0.07)",
    glow: "rgba(99,102,241,0.14)",
    shadow: "0 8px 40px rgba(99,102,241,0.10)",
    headingGradient: "linear-gradient(135deg,#0F172A 25%,#6366F1)",
    headingFallback: "#0F172A",
  },
};

// Shared accent colors (same in both themes)
const ACCENT = {
  primary: "#6366F1",
  primaryGlow: "#818CF8",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  font: "'Inter', system-ui, -apple-system, sans-serif",
};

// Expected shape of the analysis response (used for normalization)
const ANALYSIS_DEFAULTS = {
  atsScore: 0,
  summary: "",
  skillsFound: [],
  missingSkills: [],
  suggestions: [],
  strengths: [],
  weaknesses: [],
};

const GlobalStyles = ({ bg }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; background: ${bg}; transition: background .4s ease; }
    ::selection { background: rgba(99,102,241,0.35); }

    @keyframes fadeUp { from { opacity:0; transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
    @keyframes shimmer { 0%{background-position:-400px 0;} 100%{background-position:400px 0;} }
    @keyframes floatGlow { 0%,100%{opacity:.6;transform:translateX(-50%) scale(1);} 50%{opacity:1;transform:translateX(-50%) scale(1.1);} }
    @keyframes spin { to { transform: rotate(360deg); } }

    .fade-up { animation: fadeUp .6s cubic-bezier(.22,1,.36,1) both; }
    .skeleton {
      background: linear-gradient(90deg, rgba(128,128,128,0.06) 25%, rgba(128,128,128,0.13) 50%, rgba(128,128,128,0.06) 75%);
      background-size: 800px 100%; animation: shimmer 1.4s infinite linear; border-radius: 8px;
    }
    .gradient-heading {
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
    }
    .results-grid { display:grid; gap:20px; align-items:start; grid-template-columns:1.3fr 1fr 1fr; }
    .span-full { grid-column:1 / -1; }
    .span-half-l { grid-column:1 / 3; }
    .span-half-r { grid-column:3 / -1; }
    @media (max-width:1024px){ .results-grid{grid-template-columns:1fr 1fr;} .span-full,.span-half-l,.span-half-r{grid-column:1 / -1;} }
    @media (max-width:640px){ .results-grid{grid-template-columns:1fr;} }

    button:focus-visible, label:focus-visible {
      outline: 2px solid ${ACCENT.primary};
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .fade-up, .skeleton { animation: none !important; }
      * { transition: none !important; }
    }
  `}</style>
);

function App() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("dark");
  const [downloading, setDownloading] = useState(false);

  const T = useMemo(() => ({ ...THEMES[theme], ...ACCENT }), [theme]);
  const reportRef = useRef(null);
  const inputRef = useRef(null);

  // ─── Derived score visuals ──────────────────────────────
  const scoreColor =
    analysis?.atsScore >= 80 ? T.success
    : analysis?.atsScore >= 60 ? T.warning
    : T.danger;

  const grade =
    analysis?.atsScore >= 80 ? "Excellent"
    : analysis?.atsScore >= 60 ? "Good"
    : "Needs Improvement";

  // ─── File validation ────────────────────────────────────
  const validateAndSetFile = useCallback((selected) => {
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Max size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    setError("");
    setAnalysis(null);
    setFile(selected);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setAnalysis(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // ─── Safely parse the API response ──────────────────────
  const parseAnalysis = (raw) => {
    if (typeof raw !== "string") {
      // Already an object?
      return { ...ANALYSIS_DEFAULTS, ...raw };
    }
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { ...ANALYSIS_DEFAULTS, ...parsed };
  };

  // ─── Upload + analyze ───────────────────────────────────
  const uploadResume = async () => {
    if (!file) {
      setError("Please select a resume first.");
      return;
    }
    setError("");
    setLoading(true);
    setAnalysis(null);

    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await axios.post(API_URL, formData, {
        timeout: 60000, // 60s — Render free tier can be slow to spin up
      });

      if (!res?.data?.analysis) {
        throw new Error("Empty response from server.");
      }

      const normalized = parseAnalysis(res.data.analysis);
      setAnalysis(normalized);
    } catch (err) {
      console.error("Resume analysis failed:", err);
      if (err.code === "ECONNABORTED") {
        setError("The request timed out. The server may be waking up — please try again.");
      } else if (err instanceof SyntaxError) {
        setError("Received an unexpected response. Please try again.");
      } else if (err.response) {
        setError(`Server error (${err.response.status}). Please try again.`);
      } else {
        setError("Something went wrong. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── PDF Export ─────────────────────────────────────────
  const downloadPDF = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: THEMES[theme].bg,
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      // Multi-page support
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`resume-analysis-${Date.now()}.pdf`);
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError("Could not generate PDF. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  // ─── Reusable UI Components ──────────────────────────────
  const Card = ({ children, className = "", delay = 0, style }) => (
    <div
      className={`fade-up ${className}`}
      style={{
        background: T.surface, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: `1px solid ${T.border}`, borderRadius: 20, padding: 26, boxShadow: T.shadow,
        overflowWrap: "break-word", transition: "transform .3s ease, border-color .3s ease, box-shadow .3s ease",
        animationDelay: `${delay}s`, ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = T.borderHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = T.border; }}
    >
      {children}
    </div>
  );

  const CardTitle = ({ icon, children, count }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span style={{ fontSize: 15, width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(99,102,241,0.12)" }}>{icon}</span>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: "-0.01em", flex: 1, color: T.text }}>{children}</h2>
      {count != null && (
        <span style={{ fontSize: 12, fontWeight: 600, color: T.muted, padding: "3px 9px", borderRadius: 999, background: T.inner, border: `1px solid ${T.border}` }}>{count}</span>
      )}
    </div>
  );

  const Chip = ({ children, tone }) => {
    const map = {
      success: { c: T.success, bg: "rgba(34,197,94,0.12)", b: "rgba(34,197,94,0.3)" },
      danger:  { c: T.danger,  bg: "rgba(239,68,68,0.12)", b: "rgba(239,68,68,0.3)" },
    }[tone];
    return <span style={{ display: "inline-block", padding: "6px 13px", margin: "4px 6px 4px 0", borderRadius: 999, fontSize: 13.5, fontWeight: 500, color: map.c, background: map.bg, border: `1px solid ${map.b}` }}>{children}</span>;
  };

  const Bullet = ({ accent, index, children }) => (
    <div style={{ display: "flex", gap: 12, padding: "13px 16px", marginBottom: 10, background: T.inner, borderRadius: 12, borderLeft: `3px solid ${accent}`, fontSize: 14.5, lineHeight: 1.55, color: T.textSoft }}>
      {index != null && <span style={{ color: T.primary, fontWeight: 700, minWidth: 18 }}>{index}.</span>}
      <span>{children}</span>
    </div>
  );

  const Skeleton = ({ lines = 4, className = "" }) => (
    <div className={`fade-up ${className}`} style={{ background: T.surface, backdropFilter: "blur(18px)", border: `1px solid ${T.border}`, borderRadius: 20, padding: 26 }}>
      <div className="skeleton" style={{ height: 18, width: "45%", marginBottom: 20 }} />
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="skeleton" style={{ height: 13, width: `${85 - i * 8}%`, marginBottom: 12 }} />)}
    </div>
  );

  // Helper to render a list-or-empty-state inside cards
  const renderChips = (items, tone) =>
    items.length > 0
      ? items.map((s, i) => <Chip key={i} tone={tone}>{s}</Chip>)
      : <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>None detected.</p>;

  const renderBullets = (items, accent, numbered = false) =>
    items.length > 0
      ? items.map((s, i) => <Bullet key={i} accent={accent} index={numbered ? i + 1 : null}>{s}</Bullet>)
      : <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>Nothing to show here.</p>;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, position: "relative", overflow: "hidden", transition: "background .4s ease, color .4s ease" }}>
      <GlobalStyles bg={T.bg} />

      {/* Ambient glow */}
      <div aria-hidden style={{ position: "fixed", top: "-20%", left: "50%", width: "min(900px,120vw)", height: "min(900px,120vw)", background: `radial-gradient(circle, ${T.glow}, transparent 60%)`, pointerEvents: "none", zIndex: 0, animation: "floatGlow 8s ease-in-out infinite" }} />

      {/* ─── Top bar ─── */}
      <header style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1280, margin: "0 auto", padding: "20px clamp(16px,4vw,24px) 0" }}>
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: T.text }}>
          <span style={{ color: T.primary }}>✦</span> ResumeAI
        </span>
        <button
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px",
            borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface,
            backdropFilter: "blur(10px)", color: T.text, fontSize: 13.5, fontWeight: 500,
            cursor: "pointer", fontFamily: T.font, transition: "all .2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.borderHover)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(24px,5vw,40px) clamp(16px,4vw,24px) 80px", position: "relative", zIndex: 1 }}>

        {/* ─── Header / Upload ─── */}
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.inner, fontSize: 13, color: T.muted, marginBottom: 20 }}>✦ Powered by AI</span>

          {/* FIXED gradient heading: standard + webkit clip + fallback color */}
          <h1
            className="gradient-heading"
            style={{
              fontSize: "clamp(2.2rem,7vw,3.6rem)", fontWeight: 800, letterSpacing: "-0.035em",
              lineHeight: 1.08, margin: "0 0 14px",
              backgroundImage: T.headingGradient,
              color: T.headingFallback, // graceful fallback if background-clip:text unsupported
            }}
          >
            AI Resume Analyzer
          </h1>

          <p style={{ color: T.muted, fontSize: "clamp(15px,2.5vw,17px)", maxWidth: 520, margin: "0 auto 36px", lineHeight: 1.6, padding: "0 10px" }}>
            Instant ATS scoring, skill-gap analysis, and tailored AI suggestions to land more interviews.
          </p>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); validateAndSetFile(e.dataTransfer.files[0]); }}
            style={{ display: "block", padding: "38px 24px", background: dragOver ? "rgba(99,102,241,0.08)" : T.inner, border: `2px dashed ${dragOver ? T.primary : T.border}`, borderRadius: 18, cursor: "pointer", width: "100%", maxWidth: 460, margin: "0 auto", transition: "all .2s ease" }}
          >
            <div style={{ fontSize: 30, marginBottom: 10 }} aria-hidden>📄</div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.text }}>Drag & drop your resume</h3>
            <p style={{ color: T.muted, margin: "6px 0 0", fontSize: 13.5 }}>or click to browse · PDF only · max {MAX_FILE_SIZE_MB}MB</p>
            <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => validateAndSetFile(e.target.files[0])} />
          </label>

          {file && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "10px 16px", marginTop: 16, color: T.success, fontSize: 14, fontWeight: 500, maxWidth: 460, overflow: "hidden" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {file.name}</span>
              <button
                onClick={clearFile}
                aria-label="Remove file"
                style={{ background: "transparent", border: "none", color: T.success, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div role="alert" style={{ color: T.danger, fontSize: 14, marginTop: 14, fontWeight: 500 }}>⚠ {error}</div>
          )}

          <div>
            <button
              onClick={uploadResume}
              disabled={loading || !file}
              style={{
                background: (loading || !file) ? "rgba(99,102,241,0.45)" : "linear-gradient(135deg,#6366F1,#8B5CF6)",
                color: "white", border: "none", padding: "15px 36px", borderRadius: 14,
                cursor: loading ? "wait" : !file ? "not-allowed" : "pointer",
                fontWeight: 600, fontSize: 15.5, marginTop: 24, width: "100%", maxWidth: 460,
                fontFamily: T.font, boxShadow: (loading || !file) ? "none" : "0 8px 30px rgba(99,102,241,0.4)",
                transition: "transform .15s ease", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}
              onMouseEnter={(e) => !loading && file && (e.currentTarget.style.transform = "scale(1.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {loading && <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />}
              {loading ? "Analyzing your resume…" : "Analyze Resume →"}
            </button>
          </div>

          {/* Download PDF — only after analysis */}
          {analysis && !loading && (
            <div className="fade-up">
              <button
                onClick={downloadPDF}
                disabled={downloading}
                style={{ background: "transparent", color: T.text, border: `1px solid ${T.border}`, padding: "13px 28px", borderRadius: 14, cursor: downloading ? "wait" : "pointer", fontWeight: 600, fontSize: 14.5, marginTop: 14, width: "100%", maxWidth: 460, fontFamily: T.font, transition: "all .2s ease", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderHover; e.currentTarget.style.background = T.inner; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "transparent"; }}
              >
                {downloading
                  ? <><span style={{ width: 15, height: 15, border: `2px solid ${T.muted}`, borderTopColor: T.text, borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} /> Generating PDF…</>
                  : <>⬇ Download Report as PDF</>}
              </button>
            </div>
          )}
        </div>

        {/* ─── Loading Skeletons ─── */}
        {loading && (
          <div className="results-grid">
            <Skeleton lines={5} /><Skeleton lines={4} /><Skeleton lines={4} /><Skeleton lines={3} className="span-full" />
          </div>
        )}

        {/* ─── Results ─── */}
        {analysis && !loading && (
          <div ref={reportRef} className="results-grid" style={{ padding: 4 }}>
            <Card delay={0.05}>
              <CardTitle icon="📊">ATS Score</CardTitle>
              <div style={{ width: "min(180px,55%)", height: "min(180px,55vw)", margin: "10px auto 16px" }}>
                <CircularProgressbar
                  value={analysis.atsScore}
                  text={`${analysis.atsScore}%`}
                  styles={buildStyles({ pathColor: scoreColor, textColor: scoreColor, trailColor: T.trail, textSize: "18px", pathTransitionDuration: 1.4 })}
                />
              </div>
              <p style={{ textAlign: "center", color: scoreColor, fontWeight: 600, fontSize: 16, margin: "0 0 20px" }}>{grade}</p>
              <div style={{ padding: 16, background: T.inner, borderRadius: 14, border: `1px solid ${T.border}` }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: T.muted, letterSpacing: "0.05em" }}>RESUME SUMMARY</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: T.textSoft }}>{analysis.summary || "No summary available."}</p>
              </div>
            </Card>

            <Card delay={0.12}>
              <CardTitle icon="✅" count={analysis.skillsFound.length}>Skills Found</CardTitle>
              <div>{renderChips(analysis.skillsFound, "success")}</div>
            </Card>

            <Card delay={0.19}>
              <CardTitle icon="🎯" count={analysis.missingSkills.length}>Missing Skills</CardTitle>
              <div>{renderChips(analysis.missingSkills, "danger")}</div>
            </Card>

            <Card className="span-full" delay={0.26}>
              <CardTitle icon="💡" count={analysis.suggestions.length}>AI Suggestions</CardTitle>
              {renderBullets(analysis.suggestions, T.primary, true)}
            </Card>

            <Card className="span-half-l" delay={0.32}>
              <CardTitle icon="⭐" count={analysis.strengths.length}>Strengths</CardTitle>
              {renderBullets(analysis.strengths, T.success)}
            </Card>

            <Card className="span-half-r" delay={0.38}>
              <CardTitle icon="⚠️" count={analysis.weaknesses.length}>Weaknesses</CardTitle>
              {renderBullets(analysis.weaknesses, T.warning)}
            </Card>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "32px 16px", borderTop: `1px solid ${T.border}`, position: "relative", zIndex: 1 }}>
        Built with ✦ AI · Analyze · Improve · Get hired
      </footer>
    </div>
  );
}

export default App;