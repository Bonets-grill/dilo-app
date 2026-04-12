import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const RESUME_BUILDER_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "career_build_resume",
      description: "Build a professional resume/CV from user info. Use when user says 'build my resume', 'create my CV', 'hazme un currículum', 'actualiza mi CV'",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name" },
          title: { type: "string", description: "Professional title (e.g. 'Software Engineer')" },
          experience: { type: "string", description: "Work experience description" },
          education: { type: "string", description: "Education background" },
          skills: { type: "string", description: "Comma-separated skills" },
          target_role: { type: "string", description: "Role they're applying for" },
          language: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "Language" },
        },
        required: ["name", "experience"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "career_interview_sim",
      description: "Simulate a job interview with questions and feedback. Use when user says 'practice interview', 'simula una entrevista', 'interview questions for...'",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Role to interview for" },
          company_type: { type: "string", description: "Type of company (startup, corporate, FAANG, etc.)" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"], description: "Interview difficulty" },
          language: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "Language" },
        },
        required: ["role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "career_salary_negotiate",
      description: "Get salary negotiation strategies and scripts. Use when user says 'negotiate salary', 'how much should I ask', 'negociar salario', 'cuánto pedir'",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Job role" },
          location: { type: "string", description: "City or country" },
          current_salary: { type: "string", description: "Current salary if any" },
          offer: { type: "string", description: "Offer received if any" },
          experience_years: { type: "number", description: "Years of experience" },
        },
        required: ["role", "location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "career_pitfalls",
      description: "Analyze career path for potential pitfalls and give advice. Use when user says 'career advice', 'is this a good career move', 'consejos de carrera', 'errores a evitar'",
      parameters: {
        type: "object",
        properties: {
          current_role: { type: "string", description: "Current role or situation" },
          desired_role: { type: "string", description: "Where they want to be" },
          concerns: { type: "string", description: "Specific concerns or doubts" },
        },
        required: ["current_role"],
      },
    },
  },
];

export async function executeResumeBuilderTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (toolName === "career_build_resume") {
      const { name, title = "", experience, education = "", skills = "", target_role = "", language = "es" } = input as {
        name: string; title?: string; experience: string; education?: string; skills?: string; target_role?: string; language?: string;
      };

      const prompt = `Create a professional resume for:
Name: ${name}
Title: ${title}
Experience: ${experience}
Education: ${education}
Skills: ${skills}
Target role: ${target_role || "general"}
Language: ${language}

Use STAR method for experience bullets. Highlight quantifiable achievements.
CRITICAL: Use the REAL name provided ("${name}"). NEVER use placeholders like [Tu Apellido], [Tu Dirección], [Tu Teléfono].
If data is missing, OMIT the field entirely — do NOT put brackets or placeholder text.
Invent realistic but plausible details based on the info given (e.g., if they say "5 years tech entrepreneur", create realistic company names and achievements).
The current year is 2026.

Return JSON:
{
  "name": "${name}",
  "title": "optimized professional title",
  "summary": "3-line professional summary",
  "experience": [
    {
      "title": "role",
      "company": "company",
      "period": "dates",
      "bullets": ["achievement 1 with numbers", "achievement 2", "achievement 3"]
    }
  ],
  "education": [{"degree": "", "school": "", "year": ""}],
  "skills": {"technical": ["skill1"], "soft": ["skill1"]},
  "certifications": [],
  "languages": [],
  "tips": ["improvement tip 1", "tip 2"],
  "ats_keywords": ["keyword that ATS systems look for"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are an expert HR consultant and resume writer. Return valid JSON only. Use STAR method." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const resume = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, resume: JSON.parse(resume) });
    }

    if (toolName === "career_interview_sim") {
      const { role, company_type = "startup", difficulty = "medium", language = "es" } = input as {
        role: string; company_type?: string; difficulty?: string; language?: string;
      };

      const questionCount = difficulty === "easy" ? 5 : difficulty === "hard" ? 10 : 7;

      const prompt = `Create ${questionCount} interview questions for a ${role} position at a ${company_type}.
Difficulty: ${difficulty}
Language: ${language}

Mix of behavioral, technical, and situational questions.

Return JSON:
{
  "role": "${role}",
  "questions": [
    {
      "number": 1,
      "question": "the question",
      "type": "behavioral/technical/situational",
      "what_they_evaluate": "what the interviewer looks for",
      "good_answer_tips": "how to answer well",
      "example_answer": "a strong example answer"
    }
  ],
  "general_tips": ["tip 1", "tip 2", "tip 3"],
  "red_flags_to_avoid": ["red flag 1", "red flag 2"],
  "questions_to_ask_them": ["smart question to ask the interviewer 1", "question 2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        temperature: 0.6,
        messages: [
          { role: "system", content: "You are a senior recruiter at a top company. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const interview = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, interview: JSON.parse(interview) });
    }

    if (toolName === "career_salary_negotiate") {
      const { role, location, current_salary = "", offer = "", experience_years = 3 } = input as {
        role: string; location: string; current_salary?: string; offer?: string; experience_years?: number;
      };

      const prompt = `Salary negotiation advice for:
Role: ${role}
Location: ${location}
Experience: ${experience_years} years
Current salary: ${current_salary || "not specified"}
Offer received: ${offer || "not yet"}

Return JSON:
{
  "market_range": {"low": "amount", "mid": "amount", "high": "amount", "currency": "EUR/USD"},
  "your_target": "recommended ask amount",
  "negotiation_script": "word-for-word script to use",
  "counter_offer_template": "if they push back, say this",
  "leverage_points": ["point 1", "point 2"],
  "timing_tips": "when to negotiate",
  "non_salary_perks": ["perk to negotiate 1", "perk 2", "perk 3"],
  "mistakes_to_avoid": ["mistake 1", "mistake 2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a salary negotiation coach. Return valid JSON only. Be specific with numbers." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, negotiation: JSON.parse(result) });
    }

    if (toolName === "career_pitfalls") {
      const { current_role, desired_role = "", concerns = "" } = input as {
        current_role: string; desired_role?: string; concerns?: string;
      };

      const prompt = `Career analysis:
Current: ${current_role}
Goal: ${desired_role || "career growth"}
Concerns: ${concerns || "general advice"}

Return JSON:
{
  "current_assessment": "assessment of current position (2 sentences)",
  "pitfalls": [
    {"pitfall": "description", "probability": "low/medium/high", "how_to_avoid": "specific action"}
  ],
  "opportunities": ["opportunity 1", "opportunity 2"],
  "skill_gaps": ["skill to develop 1", "skill 2"],
  "action_plan": [
    {"timeframe": "next 30 days", "action": "specific action"},
    {"timeframe": "3 months", "action": "specific action"},
    {"timeframe": "1 year", "action": "specific action"}
  ],
  "resources": ["book or course recommendation 1", "resource 2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a career strategist. Return valid JSON only. Be specific and actionable." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, career: JSON.parse(result) });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    return JSON.stringify({ error: `Career tool error: ${(err as Error).message}` });
  }
}
