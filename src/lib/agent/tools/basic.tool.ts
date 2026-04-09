import { registerTool } from "./index";

// ── Calculate ──
registerTool("basic", {
  name: "calculate",
  description: "Perform a mathematical calculation. Use for any math the user asks.",
  input_schema: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Math expression to evaluate, e.g. '(45.50 * 3) + 12'" },
    },
    required: ["expression"],
  },
}, async (params) => {
  try {
    // Safe math evaluation (no eval)
    const expr = String(params.expression).replace(/[^0-9+\-*/().,%\s]/g, "");
    const result = Function(`"use strict"; return (${expr})`)();
    return { success: true, data: { expression: params.expression, result } };
  } catch {
    return { success: false, error: "Invalid expression" };
  }
});

// ── Get Weather ──
registerTool("basic", {
  name: "get_weather",
  description: "Get current weather for a location. Use when user asks about weather.",
  input_schema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name, e.g. 'Madrid' or 'New York'" },
    },
    required: ["location"],
  },
}, async (params) => {
  // In production, call OpenWeather API. For now, return structured placeholder.
  return {
    success: true,
    data: {
      location: params.location,
      note: "Weather API not configured. In production, this calls OpenWeather API.",
    },
  };
});

// ── Get Recipe ──
registerTool("basic", {
  name: "get_recipe",
  description: "Suggest a recipe based on ingredients or cuisine. Use when user asks for cooking help.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What the user wants to cook or ingredients they have" },
    },
    required: ["query"],
  },
}, async (params) => {
  // Claude will generate the recipe based on the query — this tool just signals intent
  return {
    success: true,
    data: { query: params.query, note: "Generate a recipe based on this query." },
  };
});
