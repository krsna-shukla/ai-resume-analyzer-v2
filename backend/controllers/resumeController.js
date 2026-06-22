const fs = require("fs");
const pdf = require("pdf-parse");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

exports.uploadResume = async (req, res) => {
  try {
    const jobTitle = req.body.jobTitle;

    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdf(dataBuffer);

    // STEP 1: Get required skills for job role
    const skillsResponse = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `
Give the top 10 required skills for the role: ${jobTitle}

Return ONLY valid JSON:

{
  "requiredSkills": []
}

Do not return markdown.
Do not return explanation.
`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const skillsRaw = skillsResponse.choices[0].message.content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const skillsData = JSON.parse(skillsRaw);

    const requiredSkills = skillsData.requiredSkills || [];

    // STEP 2: Analyze resume using those skills
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `
Analyze this resume for the role of ${jobTitle}.

Required Skills:
${requiredSkills.join(", ")}

Compare the resume against these skills.

Return ONLY valid JSON:

{
  "atsScore": 0,
  "skillsFound": [],
  "missingSkills": [],
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "summary": ""
}

Resume:

${data.text}

Return ONLY JSON.
Do not return markdown.
Do not return explanation.
`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const analysisRaw = completion.choices[0].message.content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(analysisRaw);

    // Add required skills into final response
    parsed.requiredSkills = requiredSkills;
    // Calculate ATS score based on skill match

const foundCount = parsed.skillsFound.length;
const requiredCount = requiredSkills.length || 1;

const skillScore = (foundCount / requiredCount) * 80;

const bonus = Math.min(
  (parsed.strengths?.length || 0) * 4,
  20
);

parsed.atsScore = Math.min(
  Math.round(skillScore + bonus),
  100
);

    console.log("FINAL RESPONSE:", parsed);

    res.status(200).json({
      success: true,
      analysis: parsed,
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};