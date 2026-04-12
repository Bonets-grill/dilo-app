import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const DECISION_HELPER_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "productivity_decide",
      description: "Help make a decision by analyzing pros/cons from multiple perspectives. Use when user says 'help me decide', 'should I...', 'pros and cons of...', 'ayúdame a decidir', 'qué hago con...'",
      parameters: {
        type: "object",
        properties: {
          decision: { type: "string", description: "The decision to analyze" },
          options: { type: "string", description: "Comma-separated options to compare (e.g. 'stay at job, start business')" },
          context: { type: "string", description: "Additional context about the situation" },
        },
        required: ["decision"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "productivity_perspectives",
      description: "Get multiple expert perspectives on a problem. Simulates advice from different viewpoints. Use when user says 'what would X think', 'give me different opinions', 'múltiples perspectivas'",
      parameters: {
        type: "object",
        properties: {
          problem: { type: "string", description: "The problem or question to analyze" },
          perspectives: { type: "string", description: "Comma-separated perspectives to use. Default: 'CEO, Engineer, Customer, Investor'" },
        },
        required: ["problem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "productivity_learn",
      description: "Learn a complex topic explained simply, step by step. Use when user says 'explain...', 'teach me about...', 'enséñame...', 'qué es...', 'how does X work'",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The topic to learn about" },
          level: { type: "string", enum: ["beginner", "intermediate", "advanced"], description: "Knowledge level" },
          style: { type: "string", enum: ["eli5", "analogy", "step-by-step", "examples"], description: "Teaching style" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "productivity_mbti",
      description: "Analyze personality type based on conversation patterns. Use when user asks about their personality, MBTI, 'qué tipo de persona soy', 'analyze my personality'",
      parameters: {
        type: "object",
        properties: {
          behaviors: { type: "string", description: "Description of user behaviors, preferences, and tendencies" },
        },
        required: ["behaviors"],
      },
    },
  },
];

export async function executeDecisionHelperTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (toolName === "productivity_decide") {
      const { decision, options, context = "" } = input as { decision: string; options?: string; context?: string };

      const optionsList = options ? `\nOptions to compare: ${options}` : "";

      const prompt = `Analyze this decision: "${decision}"${optionsList}
${context ? `Context: ${context}` : ""}

Provide a structured analysis as JSON with:
1. "summary": One-line summary of the decision
2. "options": Array of options, each with:
   - "name": option name
   - "pros": array of 3-5 pros
   - "cons": array of 3-5 cons
   - "score": 1-10 rating
   - "risk_level": "low", "medium", "high"
3. "recommendation": Which option and why (2 sentences max)
4. "questions_to_ask": 3 questions the user should answer before deciding
5. "worst_case": What happens in the worst case for each option
6. "time_horizon": Short-term vs long-term impact`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a strategic decision advisor. Return valid JSON only. Be objective and practical." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const analysis = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, analysis: JSON.parse(analysis) });
    }

    if (toolName === "productivity_perspectives") {
      const { problem, perspectives = "CEO, Engineer, Customer, Investor" } = input as { problem: string; perspectives?: string };

      const prompt = `Analyze this problem from multiple perspectives: "${problem}"

Perspectives to use: ${perspectives}

For each perspective, provide as JSON:
{
  "perspectives": [
    {
      "role": "perspective name",
      "opinion": "2-3 sentences from this viewpoint",
      "priority": "what matters most to this person",
      "action": "what they would do",
      "risk_they_see": "main concern"
    }
  ],
  "consensus": "Where all perspectives agree (1 sentence)",
  "biggest_disagreement": "Where they diverge most (1 sentence)",
  "recommended_action": "Best path considering all perspectives (2 sentences)"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1200,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You simulate multiple expert perspectives authentically. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, ...JSON.parse(result) });
    }

    if (toolName === "productivity_learn") {
      const { topic, level = "beginner", style = "step-by-step" } = input as { topic: string; level?: string; style?: string };

      const styleInstructions: Record<string, string> = {
        eli5: "Explain like I'm 5 years old. Use very simple words and fun analogies.",
        analogy: "Use real-world analogies the user already understands.",
        "step-by-step": "Break it down into numbered steps, building knowledge progressively.",
        examples: "Teach primarily through practical examples and use cases.",
      };

      const prompt = `Teach about: "${topic}"
Level: ${level}
Style: ${styleInstructions[style] || styleInstructions["step-by-step"]}

Return JSON:
{
  "title": "topic title",
  "tldr": "One-sentence summary",
  "explanation": ["step 1 text", "step 2 text", ...],
  "key_concepts": ["concept 1", "concept 2", ...],
  "real_world_example": "A practical example",
  "common_mistakes": ["mistake 1", "mistake 2"],
  "next_topics": ["what to learn next 1", "what to learn next 2"],
  "difficulty": "easy/medium/hard"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are an exceptional teacher. Make complex topics simple. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const lesson = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, lesson: JSON.parse(lesson) });
    }

    if (toolName === "productivity_mbti") {
      const { behaviors } = input as { behaviors: string };

      const prompt = `Based on these behaviors and preferences, analyze the personality type:
"${behaviors}"

Return JSON:
{
  "mbti_type": "XXXX",
  "type_name": "The Architect / The Mediator / etc.",
  "confidence": "low/medium/high",
  "traits": {
    "energy": {"type": "E or I", "description": "why"},
    "information": {"type": "S or N", "description": "why"},
    "decisions": {"type": "T or F", "description": "why"},
    "lifestyle": {"type": "J or P", "description": "why"}
  },
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "challenges": ["challenge 1", "challenge 2"],
  "ideal_work": "type of work that suits them",
  "communication_tip": "how to communicate better based on type",
  "famous_people": ["famous person with same type 1", "famous person 2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 800,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You are a personality psychology expert. Return valid JSON only. Be nuanced, not stereotypical." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0]?.message?.content || "{}";
      return JSON.stringify({ success: true, personality: JSON.parse(result) });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    return JSON.stringify({ error: `Decision helper error: ${(err as Error).message}` });
  }
}
