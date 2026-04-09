/**
 * Money Saver Skills — uses web search for categories without free APIs
 * Farmacia, Seguros, Telefonía, Cupones delivery, Ayudas públicas, Suscripciones
 */

import { searchSerper } from "./web-search";

/** Compare medication prices via Google Shopping */
export async function compareMedication(medication: string, city?: string): Promise<string> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return "Búsqueda no disponible.";

  const query = city
    ? `${medication} precio farmacia ${city}`
    : `${medication} precio farmacia online españa`;

  try {
    // Try Google Shopping first
    const shopRes = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${medication} farmacia`, gl: "es", hl: "es", num: 8 }),
    });

    if (shopRes.ok) {
      const data = await shopRes.json();
      const items = (data.shopping || []).slice(0, 6);

      if (items.length > 0) {
        let response = `**💊 Precios de ${medication}** *(farmacias online)*\n\n`;
        for (const item of items) {
          response += `- **${item.title}**: ${item.price} — ${item.source}\n`;
          if (item.link) response += `  [Comprar](${item.link})\n`;
        }
        response += `\n*Precios de farmacias online. En tu farmacia local puede variar. Consulta siempre con tu médico o farmacéutico.*`;
        return response;
      }
    }
  } catch { /* fallback */ }

  // Fallback: regular search
  const search = await searchSerper(`${medication} precio farmacia españa`);
  if (search.results.length > 0) {
    let response = `**💊 ${medication} — Resultados de búsqueda:**\n\n`;
    for (const r of search.results.slice(0, 5)) {
      response += `- [${r.title}](${r.link})\n  ${r.snippet.slice(0, 100)}\n\n`;
    }
    return response;
  }

  return `No encontré precios para ${medication}.`;
}

/** Search for insurance deals */
export async function compareInsurance(type: string, city?: string): Promise<string> {
  const query = city
    ? `comparar seguro ${type} barato ${city} 2026`
    : `comparar seguro ${type} barato españa 2026`;

  const search = await searchSerper(query);
  if (search.results.length === 0) return `No encontré comparadores de seguro ${type}.`;

  let response = `**🏥 Comparar seguro ${type}:**\n\n`;
  for (const r of search.results.slice(0, 5)) {
    response += `- [${r.title}](${r.link})\n  ${r.snippet.slice(0, 120)}\n\n`;
  }
  response += `*Compara en varios sitios. Los precios varían mucho según tu perfil y cobertura.*`;
  return response;
}

/** Search for delivery coupons and restaurant deals */
export async function findFoodDeals(city: string): Promise<string> {
  const search = await searchSerper(`cupones descuentos restaurantes delivery ${city} 2026`);
  if (search.results.length === 0) return `No encontré ofertas de restaurantes en ${city}.`;

  let response = `**🍕 Ofertas y cupones en ${city}:**\n\n`;
  for (const r of search.results.slice(0, 5)) {
    response += `- [${r.title}](${r.link})\n  ${r.snippet.slice(0, 120)}\n\n`;
  }
  return response;
}

/** Search for public aid and subsidies */
export async function findPublicAid(profile?: string): Promise<string> {
  const query = profile
    ? `ayudas públicas subvenciones ${profile} españa 2026`
    : `ayudas públicas subvenciones disponibles españa 2026 bono social`;

  const search = await searchSerper(query);
  if (search.results.length === 0) return "No encontré ayudas públicas relevantes.";

  let response = `**📄 Ayudas y subvenciones disponibles:**\n\n`;
  for (const r of search.results.slice(0, 5)) {
    response += `- [${r.title}](${r.link})\n  ${r.snippet.slice(0, 150)}\n\n`;
  }
  response += `*Verifica requisitos en la sede electrónica oficial antes de solicitar.*`;
  return response;
}

/** Compare phone/internet plans */
export async function comparePhonePlans(currentPlan?: string): Promise<string> {
  const query = currentPlan
    ? `comparar tarifas movil internet mejor que ${currentPlan} españa 2026`
    : `mejores tarifas movil fibra baratas españa 2026 comparador`;

  const search = await searchSerper(query);
  if (search.results.length === 0) return "No encontré comparadores de tarifas.";

  let response = `**📱 Comparar tarifas de móvil/internet:**\n\n`;
  for (const r of search.results.slice(0, 5)) {
    response += `- [${r.title}](${r.link})\n  ${r.snippet.slice(0, 120)}\n\n`;
  }
  response += `*Compara en Kelisto, Rastreator, o Selectra para encontrar la mejor oferta.*`;
  return response;
}

/** Compare product prices across stores (for electronics, appliances, etc) */
export async function compareProductPrice(product: string): Promise<string> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return "Búsqueda no disponible.";

  try {
    const shopRes = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: product, gl: "es", hl: "es", num: 8 }),
    });

    if (shopRes.ok) {
      const data = await shopRes.json();
      const items = (data.shopping || []).slice(0, 8);

      if (items.length > 0) {
        // Sort by price
        items.sort((a: { price?: string }, b: { price?: string }) => {
          const pa = parseFloat((a.price || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
          const pb = parseFloat((b.price || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
          return pa - pb;
        });

        let response = `**🔌 Comparación de precios: ${product}**\n\n`;
        for (const item of items) {
          response += `- **${item.price}** — ${item.title?.slice(0, 60)} (${item.source})\n`;
        }
        const cheapest = items[0]?.price || "?";
        const expensive = items[items.length - 1]?.price || "?";
        response += `\n**Más barato: ${cheapest}** | Más caro: ${expensive}\n`;
        response += `*Precios de tiendas online. Verifica disponibilidad antes de comprar.*`;
        return response;
      }
    }
  } catch { /* fallback */ }

  return `No encontré precios para "${product}".`;
}
