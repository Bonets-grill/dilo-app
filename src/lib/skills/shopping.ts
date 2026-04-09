/**
 * Shopping Price Comparison — compares real supermarket prices via Google Shopping
 * Uses Serper Shopping API (same key as web search)
 */

interface ShoppingItem {
  title: string;
  source: string;  // store name
  price: string;   // "1,24 €"
  priceNum: number; // 1.24
  link: string;
}

interface StoreGroup {
  store: string;
  items: Array<{ product: string; item: ShoppingItem }>;
  total: number;
}

/** Search Google Shopping for a single product in Spain */
async function searchProduct(product: string): Promise<ShoppingItem[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: product, gl: "es", hl: "es", num: 10 }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.shopping || []).slice(0, 10).map((item: Record<string, unknown>) => {
      const priceStr = (item.price as string) || "0 €";
      // Parse "1,24 €" or "€1.24" to number
      const priceNum = parseFloat(priceStr.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
      return {
        title: (item.title as string) || "",
        source: (item.source as string) || "",
        price: priceStr,
        priceNum,
        link: (item.link as string) || "",
      };
    }).filter((item: ShoppingItem) => item.priceNum > 0 && item.priceNum < 100); // filter nonsense
  } catch {
    return [];
  }
}

/** Compare prices for a shopping list across stores */
export async function compareShoppingList(products: string[], city?: string): Promise<string> {
  if (!products.length) return "No hay productos para buscar.";

  // Search all products in parallel (max 10 to not burn credits)
  const limited = products.slice(0, 10);
  const results = await Promise.all(
    limited.map(async (product) => ({
      product,
      items: await searchProduct(city ? `${product} ${city}` : product),
    }))
  );

  // Find cheapest option per product
  const cheapest: Array<{ product: string; item: ShoppingItem }> = [];
  const allStores = new Map<string, Array<{ product: string; item: ShoppingItem }>>();

  for (const { product, items } of results) {
    if (items.length === 0) continue;

    // Sort by price
    items.sort((a, b) => a.priceNum - b.priceNum);
    cheapest.push({ product, item: items[0] });

    // Group by store
    for (const item of items.slice(0, 5)) {
      const storeName = item.source.toLowerCase().replace(/\.com|\.es|\.online/g, "").trim();
      if (!allStores.has(storeName)) allStores.set(storeName, []);
      allStores.get(storeName)!.push({ product, item });
    }
  }

  if (cheapest.length === 0) return "No encontré precios para esos productos.";

  // Build response
  let response = `**🛒 Comparación de precios** *(tiendas online con envío a domicilio — no son precios de tienda física)*\n\n**Lo más barato por producto:**\n\n`;
  let cheapTotal = 0;

  for (const { product, item } of cheapest) {
    response += `- **${product}**: ${item.price} en ${item.source}`;
    if (item.link) response += ` — [Comprar](${item.link})`;
    response += `\n`;
    cheapTotal += item.priceNum;
  }

  response += `\n**Total comprando siempre lo más barato: ${cheapTotal.toFixed(2)} €**\n`;

  // Show top 3 stores with most products found
  const storesByProducts = [...allStores.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  if (storesByProducts.length > 0) {
    response += "\n**Por supermercado:**\n";
    for (const [store, items] of storesByProducts) {
      const total = items.reduce((s, i) => s + i.item.priceNum, 0);
      response += `\n**${store}** (${items.length} productos, ${total.toFixed(2)} €):\n`;
      for (const { product, item } of items) {
        response += `- ${product}: ${item.price}`;
        if (item.link) response += ` — [Ver](${item.link})`;
        response += `\n`;
      }
    }
  }

  return response;
}
