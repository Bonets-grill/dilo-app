/**
 * Electricidad España — Precios PVPC en tiempo real
 * API de Red Eléctrica de España (REE/ESIOS) — GRATIS, sin key
 * Indicador 1001 = PVPC 2.0TD (tarifa regulada doméstica)
 */

const REE_API = "https://api.esios.ree.es/indicators/1001";

interface HourPrice {
  hour: string; // "00:00", "01:00", etc
  price: number; // €/kWh
}

/** Get today's electricity prices hour by hour */
export async function getElectricityPrices(): Promise<string> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `${REE_API}?start_date=${today}T00:00&end_date=${today}T23:59`,
      { headers: { Accept: "application/json", "Content-Type": "application/json" } }
    );

    if (!res.ok) return "No se pudieron obtener los precios de electricidad.";

    const data = await res.json();
    const values = data.indicator?.values || [];

    if (values.length === 0) return "No hay datos de precios de electricidad para hoy.";

    const prices: HourPrice[] = values.map((v: { datetime: string; value: number }) => {
      const hour = new Date(v.datetime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      return { hour, price: v.value / 1000 }; // Convert €/MWh to €/kWh
    });

    // Find cheapest and most expensive hours
    const sorted = [...prices].sort((a, b) => a.price - b.price);
    const cheapest3 = sorted.slice(0, 3);
    const expensive3 = sorted.slice(-3).reverse();
    const avgPrice = prices.reduce((s, p) => s + p.price, 0) / prices.length;

    // Current hour price
    const currentHour = new Date().getHours();
    const currentPrice = prices.find(p => parseInt(p.hour) === currentHour);

    let response = "**💡 Precio de la luz hoy** *(PVPC tarifa regulada)*\n\n";

    if (currentPrice) {
      const isExpensive = currentPrice.price > avgPrice * 1.2;
      const isCheap = currentPrice.price < avgPrice * 0.8;
      response += `**Ahora (${currentPrice.hour}):** ${currentPrice.price.toFixed(4)} €/kWh`;
      response += isExpensive ? " 🔴 cara\n" : isCheap ? " 🟢 barata\n" : " 🟡 media\n";
    }

    response += `**Media hoy:** ${avgPrice.toFixed(4)} €/kWh\n\n`;

    response += "**🟢 Horas más baratas (pon lavadora/lavavajillas):**\n";
    for (const p of cheapest3) {
      response += `  ${p.hour} → ${p.price.toFixed(4)} €/kWh\n`;
    }

    response += "\n**🔴 Horas más caras (evita consumo alto):**\n";
    for (const p of expensive3) {
      response += `  ${p.hour} → ${p.price.toFixed(4)} €/kWh\n`;
    }

    // Calculate savings tip
    const cheapAvg = cheapest3.reduce((s, p) => s + p.price, 0) / 3;
    const expAvg = expensive3.reduce((s, p) => s + p.price, 0) / 3;
    const savingPerKwh = expAvg - cheapAvg;
    const monthSaving = (savingPerKwh * 5 * 30).toFixed(2); // 5kWh/day shifted = monthly saving

    response += `\n---\n**Consejo:** Si mueves 5 kWh diarios de horas caras a baratas, ahorras ~${monthSaving} €/mes.\n`;
    response += `Ejemplo: poner lavadora a las ${cheapest3[0].hour} en vez de a las ${expensive3[0].hour}.\n`;

    return response;
  } catch (err) {
    console.error("[Electricidad] Error:", err);
    return "Error obteniendo precios de electricidad.";
  }
}
