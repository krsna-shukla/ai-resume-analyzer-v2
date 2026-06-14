const fs = require("fs");
const pdf = require("pdf-parse");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

exports.uploadResume = async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);

    const data = await pdf(dataBuffer);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `
Analyze the resume and return ONLY valid JSON.

{
  "atsScore": 00,
  "skillsFound": [],
  "missingSkills": [],
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "summary": ""
}

Resume:

${data.text}

Return only JSON. No markdown. No explanation.
`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const analysis = completion.choices[0].message.content;

console.log(analysis);


    res.status(200).json({
      success: true,
      analysis,
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};