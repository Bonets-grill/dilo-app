import OpenAI from "openai";

export const KNOWLEDGE_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "knowledge_search",
      description: "Search Wikipedia for information about any topic. Use for general knowledge questions: history, science, people, places, concepts, definitions. Returns article summaries with sources.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g. 'inflación', 'fotosíntesis', 'Albert Einstein')" },
          lang: { type: "string", description: "Language code: es, en, fr, it, de. Default: es", enum: ["es", "en", "fr", "it", "de"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knowledge_calculate",
      description: "Calculate math, conversions, science formulas, statistics using Wolfram Alpha. Use for: BMI, unit conversions, equations, chemical formulas, dates, distances, population data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Calculation or question (e.g. 'BMI 80kg 175cm', '100 miles in km', 'population of Spain', 'solve x^2 + 3x - 10 = 0')" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knowledge_weather",
      description: "Get current weather and 5-day forecast for any city in the world. Use when user asks about weather, temperature, rain, or climate for a specific location.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name (e.g. 'Madrid', 'New York', 'Tokyo')" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knowledge_food",
      description: "Search nutritional information for food products. Use when user asks about calories, macros, or nutritional content of a specific food or product. Can also scan barcodes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Food name (e.g. 'plátano', 'Coca-Cola', 'arroz integral') or barcode number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knowledge_news",
      description: "Get latest news headlines or search for news on a specific topic. Use when user asks about current events, latest news, or news about a topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional search query. Leave empty for top headlines." },
          lang: { type: "string", description: "Language: es, en, fr, it, de. Default: es", enum: ["es", "en", "fr", "it", "de"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knowledge_currency",
      description: "Convert between currencies using real-time exchange rates. Use when user asks about currency conversion, exchange rates, or money conversion.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount to convert" },
          from: { type: "string", description: "Source currency code (e.g. EUR, USD, GBP, MXN)" },
          to: { type: "string", description: "Target currency code (e.g. USD, EUR, GBP)" },
        },
        required: ["amount", "from", "to"],
      },
    },
  },
];

export async function executeKnowledgeTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (toolName === "knowledge_search") {
      const { searchWikipedia, getArticleSummary } = await import("@/lib/wikipedia/client");
      const query = input.query as string;
      const lang = (input.lang as string) || "es";

      const results = await searchWikipedia(query, lang, 3);
      if (results.length === 0) {
        return `No encontré artículos sobre "${query}" en Wikipedia.`;
      }

      // Get full summary of the first result
      const article = await getArticleSummary(results[0].title, lang);
      let response = "";

      if (article) {
        response += `**${article.title}**\n`;
        if (article.description) response += `_${article.description}_\n\n`;
        response += `${article.extract}\n\n`;
        response += `Fuente: ${article.url}\n`;
      }

      if (results.length > 1) {
        response += `\n**Artículos relacionados:**\n`;
        for (const r of results.slice(1)) {
          response += `- ${r.title}: ${r.extract.slice(0, 100)}...\n`;
        }
      }

      return response || `No pude obtener detalles sobre "${query}".`;
    }

    if (toolName === "knowledge_calculate") {
      const { queryWolfram } = await import("@/lib/wolfram/client");
      const query = input.query as string;
      const result = await queryWolfram(query);

      if (result.success) {
        return `**Resultado:** ${result.answer}`;
      }
      return `No pude calcular: ${result.answer}`;
    }

    if (toolName === "knowledge_weather") {
      const { getWeather } = await import("@/lib/weather/client");
      const city = input.city as string;
      const weather = await getWeather(city);

      if (!weather) {
        return `No encontré datos meteorológicos para "${city}".`;
      }

      let response = `**Clima en ${weather.location}, ${weather.country}**\n\n`;
      response += `Ahora: ${weather.temperature}°C (sensación ${weather.apparentTemperature}°C)\n`;
      response += `${weather.weatherDescription}\n`;
      response += `Humedad: ${weather.humidity}% · Viento: ${weather.windSpeed} km/h\n`;
      if (weather.precipitation > 0) {
        response += `Precipitación: ${weather.precipitation} mm\n`;
      }

      if (weather.forecast.length > 0) {
        response += `\n**Pronóstico:**\n`;
        for (const day of weather.forecast) {
          response += `- ${day.date}: ${day.tempMin}°/${day.tempMax}°C — ${day.weatherDescription}`;
          if (day.precipitationSum > 0) response += ` (${day.precipitationSum}mm lluvia)`;
          response += `\n`;
        }
      }

      return response;
    }

    if (toolName === "knowledge_food") {
      const query = input.query as string;

      // Check if it's a barcode (all digits, 8-13 chars)
      if (/^\d{8,13}$/.test(query)) {
        const { getProductByBarcode } = await import("@/lib/nutrition/food-database");
        const product = await getProductByBarcode(query);
        if (!product) return `No encontré producto con código de barras ${query}.`;
        return formatFoodProduct(product);
      }

      const { searchFood } = await import("@/lib/nutrition/food-database");
      const products = await searchFood(query, 3);

      if (products.length === 0) {
        return `No encontré información nutricional para "${query}".`;
      }

      let response = `**Información nutricional: "${query}"**\n\n`;
      for (const p of products) {
        response += formatFoodProduct(p) + "\n---\n";
      }
      return response;
    }

    if (toolName === "knowledge_news") {
      const query = input.query as string | undefined;
      const lang = (input.lang as string) || "es";

      if (query) {
        const { searchNews } = await import("@/lib/news/client");
        const articles = await searchNews(query, lang, 5);
        if (articles.length === 0) return `No encontré noticias sobre "${query}".`;
        return formatNewsArticles(articles, `Noticias: "${query}"`);
      }

      const { getHeadlines } = await import("@/lib/news/client");
      const articles = await getHeadlines(lang, lang === "es" ? "es" : "us", 5);
      if (articles.length === 0) return "No pude obtener titulares en este momento.";
      return formatNewsArticles(articles, "Titulares del momento");
    }

    if (toolName === "knowledge_currency") {
      const { convertCurrency } = await import("@/lib/currency/client");
      const amount = input.amount as number;
      const from = input.from as string;
      const to = input.to as string;

      const result = await convertCurrency(amount, from, to);
      if (!result) return `No pude convertir ${amount} ${from} a ${to}.`;

      return `**${result.amount} ${result.from} = ${result.result} ${result.to}**\nTasa: 1 ${result.from} = ${result.rate} ${result.to}`;
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (err) {
    console.error("[Knowledge Tool] Error:", err);
    return JSON.stringify({ error: "Error accessing knowledge service" });
  }
}

function formatFoodProduct(p: { name: string; brand: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null; sugar: number | null; servingSize: string; nutriScore: string | null }): string {
  let result = `**${p.name}**${p.brand ? ` (${p.brand})` : ""}\n`;
  result += `Por ${p.servingSize}:\n`;
  if (p.calories !== null) result += `- Calorías: ${p.calories} kcal\n`;
  if (p.protein !== null) result += `- Proteínas: ${p.protein}g\n`;
  if (p.carbs !== null) result += `- Carbohidratos: ${p.carbs}g\n`;
  if (p.fat !== null) result += `- Grasas: ${p.fat}g\n`;
  if (p.fiber !== null) result += `- Fibra: ${p.fiber}g\n`;
  if (p.sugar !== null) result += `- Azúcares: ${p.sugar}g\n`;
  if (p.nutriScore) result += `- Nutri-Score: ${p.nutriScore.toUpperCase()}\n`;
  return result;
}

function formatNewsArticles(articles: { title: string; description: string; source: string; publishedAt: string; url: string }[], title: string): string {
  let result = `**${title}**\n\n`;
  for (const a of articles) {
    const date = new Date(a.publishedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    result += `**${a.title}**\n${a.description || ""}\n_${a.source} · ${date}_\n\n`;
  }
  return result;
}
