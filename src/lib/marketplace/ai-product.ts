import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const VALID_CATEGORIES = [
  "tech", "fashion", "home", "motor", "sports",
  "books", "baby", "jobs", "fitness", "music", "other",
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

const VALID_CONDITIONS = ["new", "like_new", "good", "fair", "parts"] as const;
type Condition = (typeof VALID_CONDITIONS)[number];

export interface ProductAnalysis {
  title: string;
  category: Category;
  condition: Condition;
  suggestedPrice: number;
  description: string;
}

/**
 * Analiza una foto de producto con OpenAI Vision para detectar:
 * nombre del producto, categoría, estado, precio sugerido y descripción
 */
export async function analyzeProductPhoto(
  imageBase64: string
): Promise<ProductAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Eres un experto en clasificación de productos para marketplace.
Analiza la foto y devuelve un JSON con estos campos:
- title: nombre del producto (breve, max 60 chars)
- category: una de [${VALID_CATEGORIES.join(", ")}]
- condition: una de [${VALID_CONDITIONS.join(", ")}]
- suggestedPrice: precio estimado en EUR (número)
- description: descripción atractiva para vender (max 300 chars, en español)

Responde SOLO con el JSON, sin markdown.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: imageBase64.startsWith("data:")
                ? imageBase64
                : `data:image/jpeg;base64,${imageBase64}`,
            },
          },
          { type: "text", text: "Analiza este producto para ponerlo a la venta." },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "{}";
  const parsed = JSON.parse(raw) as ProductAnalysis;

  // Validate category and condition
  if (!VALID_CATEGORIES.includes(parsed.category)) parsed.category = "other";
  if (!VALID_CONDITIONS.includes(parsed.condition)) parsed.condition = "good";
  if (!parsed.suggestedPrice || parsed.suggestedPrice < 0) parsed.suggestedPrice = 0;

  return parsed;
}

/**
 * Sugiere un precio de mercado basado en título, categoría y estado
 */
export async function suggestPrice(
  title: string,
  category: string,
  condition: string
): Promise<{ suggestedPrice: number; priceRange: { min: number; max: number }; reasoning: string }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Eres un experto en precios de mercado de segunda mano en España.
Dado un producto, estima su precio justo en EUR.
Responde SOLO con JSON: { "suggestedPrice": number, "priceRange": { "min": number, "max": number }, "reasoning": "breve explicación" }`,
      },
      {
        role: "user",
        content: `Producto: ${title}\nCategoría: ${category}\nEstado: ${condition}`,
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "{}";
  return JSON.parse(raw);
}

/**
 * Genera una descripción atractiva para vender un producto
 */
export async function generateDescription(
  title: string,
  category: string,
  condition: string,
  photos: string[]
): Promise<{ description: string }> {
  const photoContext = photos.length > 0
    ? `El vendedor ha subido ${photos.length} foto(s) del producto.`
    : "No hay fotos disponibles.";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Eres un copywriter experto en marketplaces. Escribe descripciones que venden.
- Máximo 400 caracteres
- En español, tono cercano pero profesional
- Destaca los puntos fuertes del producto
- Incluye estado y detalles relevantes
Responde SOLO con JSON: { "description": "texto" }`,
      },
      {
        role: "user",
        content: `Producto: ${title}\nCategoría: ${category}\nEstado: ${condition}\n${photoContext}`,
      },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "{}";
  return JSON.parse(raw);
}
