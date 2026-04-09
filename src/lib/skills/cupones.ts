/**
 * Cupones — busca códigos de descuento reales via Google
 */

import { searchSerper } from "./web-search";

export async function findCoupons(store: string): Promise<string> {
  // Extract store name from natural language
  const storeMatch = store.match(/(?:cup[oó]n|c[oó]digo|descuento|oferta|promo).*?(?:para|en|de)\s+(.+)/i);
  const storeName = storeMatch ? storeMatch[1].trim() : store.replace(/(?:cup[oó]n|c[oó]digo|descuento|oferta|promo)/gi, "").trim();

  if (!storeName || storeName.length < 2) {
    return "¿Para qué tienda necesitas un cupón? Ejemplo: 'Cupón para Zara' o 'Código descuento Amazon'.";
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) return "Búsqueda no disponible.";

  // Search for real coupon codes
  const search = await searchSerper(`código descuento ${storeName} cupón ${new Date().toLocaleDateString("es", { month: "long", year: "numeric" })} España`);

  if (search.results.length === 0) {
    return `No encontré cupones activos para ${storeName}. Prueba más tarde — los cupones cambian constantemente.`;
  }

  let response = `**🏷️ Cupones y descuentos para ${storeName}:**\n\n`;

  for (const r of search.results.slice(0, 5)) {
    // Try to extract coupon codes from snippets
    const codeMatch = r.snippet.match(/(?:código|code|cupón)[\s:]+([A-Z0-9]{3,20})/i);
    const discountMatch = r.snippet.match(/(\d+%|\d+€|\d+\s*euros?)/i);

    response += `- **${r.title.replace(/ - .*$/, "").slice(0, 60)}**\n`;
    if (codeMatch) response += `  🎟️ Código: **${codeMatch[1]}**\n`;
    if (discountMatch) response += `  💰 Descuento: ${discountMatch[1]}\n`;
    response += `  🔗 [Ver cupón](${r.link})\n\n`;
  }

  response += `*Los cupones pueden caducar. Verifica en el enlace que sigan activos.*`;
  return response;
}
