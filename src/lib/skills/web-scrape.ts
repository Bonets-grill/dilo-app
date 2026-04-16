import OpenAI from "openai";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

/**
 * Firecrawl-powered scraping tools. Two shapes:
 *
 *   web_scrape(url)            → clean markdown of the page
 *   web_extract(url, schema)   → structured JSON following the given schema
 *
 * Both gracefully no-op with a helpful message if FIRECRAWL_API_KEY is not
 * configured — the tool is registered either way so the LLM can reference it.
 */
export const WEB_SCRAPE_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_scrape",
      description:
        "Extrae el contenido limpio (markdown) de una URL específica. Úsalo cuando el usuario dé una URL directa, pida el contenido de una página concreta, o necesites datos frescos de una web (noticias, producto, artículo). NO uses este tool para búsqueda general — usa web_search. NO uses este tool si la info es estable y ya la sabes.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa con https:// incluido",
          },
          main_content_only: {
            type: "boolean",
            description: "Si true (default), quita navegación/anuncios y devuelve solo el contenido principal",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_extract",
      description:
        "Extrae datos ESTRUCTURADOS (JSON) de una URL según un schema que describes. Úsalo para scrapear precios, listados de productos, fichas técnicas, tablas de comparativas, etc. Más potente que web_scrape cuando necesitas datos específicos.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa con https:// incluido",
          },
          schema_description: {
            type: "string",
            description:
              "Descripción en lenguaje natural del JSON que quieres extraer. Ejemplo: 'lista de productos con {nombre, precio_eur, url, en_stock}'",
          },
        },
        required: ["url", "schema_description"],
      },
    },
  },
];

export async function executeWebScrape(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  if (!FIRECRAWL_API_KEY) {
    return JSON.stringify({
      error: "firecrawl_not_configured",
      message:
        "El scraping no está disponible porque FIRECRAWL_API_KEY no está configurado. Pide al usuario que añada la API key de firecrawl.dev a las variables de entorno.",
    });
  }

  try {
    if (toolName === "web_scrape") {
      const url = String(input.url || "");
      const mainOnly = input.main_content_only !== false;
      if (!url.startsWith("http")) {
        return JSON.stringify({ error: "invalid_url", message: "URL debe empezar con https://" });
      }
      const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: mainOnly,
        }),
      });
      if (!res.ok) {
        return JSON.stringify({ error: "scrape_failed", status: res.status, message: await res.text() });
      }
      const data = await res.json();
      const markdown = data?.data?.markdown || data?.markdown || "";
      // Cap length — the LLM context isn't infinite
      const capped = markdown.length > 8000 ? markdown.slice(0, 8000) + "\n\n…[truncado]" : markdown;
      return JSON.stringify({
        url,
        title: data?.data?.metadata?.title || null,
        content: capped,
        source_length_chars: markdown.length,
      });
    }

    if (toolName === "web_extract") {
      const url = String(input.url || "");
      const schemaDesc = String(input.schema_description || "");
      if (!url.startsWith("http") || !schemaDesc) {
        return JSON.stringify({ error: "invalid_args" });
      }
      // Firecrawl's /scrape with extract format uses a natural-language
      // prompt — the server uses its own LLM to produce the JSON.
      const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["extract"],
          extract: { prompt: schemaDesc },
        }),
      });
      if (!res.ok) {
        return JSON.stringify({ error: "extract_failed", status: res.status, message: await res.text() });
      }
      const data = await res.json();
      return JSON.stringify({
        url,
        extracted: data?.data?.extract || data?.extract || null,
      });
    }

    return JSON.stringify({ error: "unknown_tool", toolName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return JSON.stringify({ error: "exception", message: msg });
  }
}
