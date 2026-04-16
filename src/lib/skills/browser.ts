import OpenAI from "openai";

/**
 * Browser automation via Stagehand v3 + Browserbase (cloud WebDriver).
 *
 * Three tools exposed to the LLM:
 *
 *   browser_task(goal, url?)     — Stagehand agent: multi-step natural
 *                                  language task (fills forms, clicks,
 *                                  navigates — AI decides the steps)
 *   browser_extract(url, query)  — Open URL, extract data matching query
 *                                  as JSON
 *   browser_observe(url, query)  — Open URL, list interactive elements
 *                                  matching the query
 *
 * Gracefully no-ops if BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID are
 * missing — the tool is registered either way so the LLM knows it's a
 * capability.
 */

const HAS_BROWSERBASE =
  !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID;

export const BROWSER_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "browser_task",
      description:
        "Ejecuta una tarea compleja en un navegador real: rellenar formularios, clicar botones, navegar por una web. Úsalo cuando el usuario necesite INTERACCIÓN con una web (reservar, registrarse, buscar en un sitio con JS dinámico, hacer un trámite). NO uses esto si basta con leer contenido — para eso usa web_scrape.",
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description:
              "Descripción en lenguaje natural de la tarea completa. Ejemplo: 'Busca vuelos Madrid-Barcelona para el 15 de junio en skyscanner y devuelve los 3 más baratos'",
          },
          url: {
            type: "string",
            description: "URL inicial (opcional si el goal ya incluye dónde navegar)",
          },
        },
        required: ["goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_extract",
      description:
        "Abre una URL en un navegador real y extrae datos en lenguaje natural. Útil cuando la página requiere JavaScript para cargar contenido (SPAs, tiendas con lazy-load) y web_scrape no llega al dato.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa con https://",
          },
          query: {
            type: "string",
            description:
              "Qué extraer en lenguaje natural. Ejemplo: 'el precio actual del producto y si está en stock'",
          },
        },
        required: ["url", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_observe",
      description:
        "Abre una URL y devuelve qué elementos interactivos hay visibles (botones, inputs, enlaces) relevantes a un query. Útil como primer paso antes de decidir una acción.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa con https://",
          },
          query: {
            type: "string",
            description: "Qué buscas observar. Ejemplo: 'el formulario de login'",
          },
        },
        required: ["url", "query"],
      },
    },
  },
];

export async function executeBrowser(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  if (!HAS_BROWSERBASE) {
    return JSON.stringify({
      error: "browserbase_not_configured",
      message:
        "El navegador automatizado no está disponible porque BROWSERBASE_API_KEY y/o BROWSERBASE_PROJECT_ID no están configurados. Indica al usuario que cree cuenta en browserbase.com y añada las variables al entorno.",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stagehand: any = null;

  try {
    const mod = await import("@browserbasehq/stagehand");
    const Stagehand = mod.Stagehand;

    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      model: "gpt-4o-mini",
      verbose: 0,
    });

    await stagehand.init();
    const page = stagehand.context.pages()[0];

    if (toolName === "browser_task") {
      const goal = String(input.goal || "");
      const url = input.url ? String(input.url) : null;
      if (url) await page.goto(url);
      const agent = stagehand.agent();
      const result = await agent.execute(goal);
      return JSON.stringify({ goal, url, result: result ?? "completed" });
    }

    if (toolName === "browser_extract") {
      const url = String(input.url || "");
      const query = String(input.query || "");
      if (!url.startsWith("http")) return JSON.stringify({ error: "invalid_url" });
      await page.goto(url);
      const extracted = await stagehand.extract(query);
      return JSON.stringify({ url, query, extracted });
    }

    if (toolName === "browser_observe") {
      const url = String(input.url || "");
      const query = String(input.query || "");
      if (!url.startsWith("http")) return JSON.stringify({ error: "invalid_url" });
      await page.goto(url);
      const observed = await stagehand.observe(query);
      return JSON.stringify({ url, query, observed });
    }

    return JSON.stringify({ error: "unknown_tool", toolName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[browser] error:", msg);
    return JSON.stringify({ error: "browser_exception", message: msg.slice(0, 300) });
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}
