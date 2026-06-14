import { useState } from "react";
import axios from "axios";
import { CircularProgressbar } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

function App() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const scoreColor =
  analysis?.atsScore >= 80
    ? "#22c55e"
    : analysis?.atsScore >= 60
    ? "#f59e0b"
    : "#ef4444";

  const uploadResume = async () => {

    if (!file) {
  alert("Please select a resume first");
  return;
}

    setLoading(true); 

    const formData = new FormData();

    formData.append("resume", file);

    try {
  const res = await axios.post(
  "https://ai-resume-analyzer-n2e3.onrender.com/api/resume/upload",
  formData
);

setLoading(false);

const cleanData = res.data.analysis
  .replace(/```json/g, "")
  .replace(/```/g, "")
  .trim();

  console.log(res.data.analysis);

const parsed = JSON.parse(cleanData);

setAnalysis(parsed);

alert("Resume Analyzed");

console.log(res.data);

} catch (err) {
  console.log(err);
  setLoading(false);
}
  };

  return (
    <div
  style={{
    minHeight: "100vh",
    background: "#020617",
    color: "white",
    padding: "40px",
    fontFamily: "Arial, sans-serif",
  }}
>
<div
  style={{
    textAlign: "center",
    marginBottom: "40px",
  }}
>
  <h1
    style={{
      fontSize: "3rem",
      marginBottom: "10px",
    }}
  >
    🚀 AI Resume Analyzer
  </h1>

  <p
    style={{
      color: "#94a3b8",
      marginBottom: "30px",
    }}
  >
    Get ATS Score, Skill Gap Analysis and AI Suggestions
  </p>

  <input
  type="file"
  accept=".pdf"
  id="resumeUpload"
  style={{ display: "none" }}
  onChange={(e) => setFile(e.target.files[0])}
/>

<label
  htmlFor="resumeUpload"
  style={{
    background: "#0f172a",
    border: "2px dashed #22c55e",
    padding: "20px",
    borderRadius: "15px",
    cursor: "pointer",
    display: "inline-block",
    width: "350px",
    color: "white",
    marginBottom: "15px",
  }}
>
  📄 Click to Upload Resume

  <br />

  <span
    style={{
      color: "#94a3b8",
      fontSize: "14px",
    }}
  >
    PDF files only
  </span>
</label>

{
  file && (
    <div
      style={{
        background: "#0f172a",
        padding: "10px 20px",
        borderRadius: "10px",
        marginBottom: "15px",
        color: "#22c55e",
        width: "350px",
        margin: "0 auto 15px auto",
      }}
    >
      ✅ {file.name}
    </div>
  )
}

  <button
    onClick={uploadResume}
    disabled={loading}
    style={{
      background: "#22c55e",
      color: "white",
      border: "none",
      padding: "12px 24px",
      borderRadius: "10px",
      cursor: "pointer",
      fontWeight: "bold",
    }}
  >
    {loading ? "⏳ Analyzing..." : "Analyze Resume"}
  </button>
</div>

{
  analysis && (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px",
      }}
    >

      <div
  style={{
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  }}
>
<h2 style={{ textAlign: "center" }}>
  📊 ATS Score
</h2>

<div
  style={{
    width: "180px",
    height: "180px",
    margin: "20px auto",
  }}
>
  <CircularProgressbar
    value={analysis.atsScore}
    text={`${analysis.atsScore}%`}
    styles={{
      path: {
        stroke: scoreColor,
      },
      text: {
        fill: scoreColor,
        fontSize: "16px",
        fontWeight: "bold",
      },
      trail: {
        stroke: "#1e293b",
      },
    }}
  />
</div>

  <hr />

<div
  style={{
    marginTop: "20px",
    padding: "15px",
    background: "#111827",
    borderRadius: "10px",
  }}
>
  <h3>📄 Resume Summary</h3>
  <p>{analysis.summary}</p>
</div>
</div>

      <div
  style={{
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  }}
>
  <h2>✅ Skills Found</h2>

  {analysis.skillsFound.map((skill, index) => (
    <p key={index}>✅ {skill}</p>
  ))}
</div>

      <div
  style={{
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  }}
>
  <h2>❌ Missing Skills</h2>

  {analysis.missingSkills.map((skill, index) => (
    <p key={index}>❌ {skill}</p>
  ))}
</div>

      <div
  style={{
    gridColumn: "1 / span 2",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  }}
>
  <h2>💡 Suggestions</h2>

  {analysis.suggestions.map((item, index) => (
    <p key={index}>💡 {item}</p>
  ))}
</div>

      <div
  style={{
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  }}
>
  <h2>⭐ Strengths</h2>

  {analysis.strengths.map((item, index) => (
    <p key={index}>⭐ {item}</p>
  ))}
</div>

<div
  style={{
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  }}
>
  <h2>⚠️ Weaknesses</h2>

  {analysis.weaknesses.map((item, index) => (
    <p key={index}>⚠️ {item}</p>
  ))}
</div>

    </div>
  )
}
    </div>
  );
}

export default App;