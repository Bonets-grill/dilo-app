/**
 * Price Alerts — track product prices and notify when they drop
 */

import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

interface ShoppingResult {
  title: string;
  price: string;
  priceNum: number;
  source: string;
  link: string;
}

/** Search current price via Google Shopping */
async function getCurrentPrice(product: string): Promise<ShoppingResult | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: product, gl: "es", hl: "es", num: 3 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.shopping || [];
    if (items.length === 0) return null;

    // Get cheapest
    let cheapest = items[0];
    let cheapestPrice = Infinity;
    for (const item of items) {
      const p = parseFloat((item.price || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
      if (p > 0 && p < cheapestPrice) {
        cheapestPrice = p;
        cheapest = item;
      }
    }

    return {
      title: cheapest.title || product,
      price: cheapest.price || "?",
      priceNum: cheapestPrice === Infinity ? 0 : cheapestPrice,
      source: cheapest.source || "",
      link: cheapest.link || "",
    };
  } catch { return null; }
}

/** Create a price alert for a product */
export async function createPriceAlert(userId: string, productQuery: string): Promise<string> {
  // Extract product name — normalize accents then strip command words
  const normalized = productQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const product = normalized
    .replace(/(?:avis[ae]me|alert[ae]|rastrear?|monitoriz\w*|seguir?|watch|cuando|baj[ea]|precio\s+de[l]?|que\s+baje|si\s+baja)\s*/gi, "")
    .replace(/^\s*(?:el|la|los|las|un|una|de)\s+/i, "")
    .trim();

  if (!product || product.length < 3) {
    return "¿Qué producto quieres que rastree? Ejemplo: 'Avísame cuando baje el MacBook Air' o 'Rastrear precio iPhone 16'.";
  }

  // Get current price
  const current = await getCurrentPrice(product);

  if (!current || current.priceNum === 0) {
    return `No encontré precio actual para "${product}". Intenta ser más específico (marca + modelo).`;
  }

  // Save alert
  const { error } = await supabase.from("price_alerts").insert({
    user_id: userId,
    product,
    current_price: current.priceNum,
    lowest_price: current.priceNum,
    target_price: Math.round(current.priceNum * 0.85 * 100) / 100, // alert at 15% drop
    source: current.source,
    source_url: current.link,
  });

  if (error) {
    console.error("[PriceAlert] Insert error:", error);
    return "Error guardando la alerta. Inténtalo de nuevo.";
  }

  const targetPrice = (current.priceNum * 0.85).toFixed(2);

  return `**🔔 Alerta de precio activada**\n\n` +
    `**Producto:** ${current.title}\n` +
    `**Precio actual:** ${current.price} en ${current.source}\n` +
    `**Te aviso si baja de:** ${targetPrice} € (15% menos)\n` +
    `🔗 [Ver producto](${current.link})\n\n` +
    `Reviso el precio cada día. Te notifico por push/WhatsApp si baja.`;
}

/** List active price alerts for a user */
export async function listPriceAlerts(userId: string): Promise<string> {
  const { data } = await supabase.from("price_alerts")
    .select("product, current_price, lowest_price, target_price, source, created_at")
    .eq("user_id", userId).eq("status", "active")
    .order("created_at", { ascending: false }).limit(10);

  if (!data?.length) return "No tienes alertas de precio activas. Dime 'Avísame cuando baje [producto]' para crear una.";

  let response = "**🔔 Tus alertas de precio activas:**\n\n";
  for (const a of data) {
    response += `- **${a.product}**: ${a.current_price} € (aviso si baja de ${a.target_price} €)\n`;
  }
  return response;
}
