import { NextResponse } from "next/server";
import { getQuote } from "@/lib/finnhub/client";

const WATCHLIST = ["AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "SPY", "QQQ"];

/**
 * Live market quotes — real-time prices from Finnhub.
 * Polled every 15s by the trading dashboard for live ticker.
 * Finnhub free tier: 60 calls/min → 9 symbols = 9 calls/request → safe at 15s intervals.
 */
export async function GET() {
  try {
    const quotes = await Promise.all(
      WATCHLIST.map(async (symbol) => {
        try {
          const q = await getQuote(symbol);
          return {
            symbol,
            price: q.c,
            change: q.d,
            changePct: q.dp,
            high: q.h,
            low: q.l,
            open: q.o,
            prevClose: q.pc,
            timestamp: q.t,
          };
        } catch {
          return { symbol, price: 0, change: 0, changePct: 0, high: 0, low: 0, open: 0, prevClose: 0, timestamp: 0 };
        }
      })
    );

    // Market status: if all timestamps are 0 or prices are 0, market is likely closed
    const validQuotes = quotes.filter(q => q.price > 0);
    const isMarketOpen = validQuotes.length > 0 && validQuotes.some(q => q.change !== 0 || q.changePct !== 0);

    // Market indices summary
    const spy = quotes.find(q => q.symbol === "SPY");
    const qqq = quotes.find(q => q.symbol === "QQQ");

    return NextResponse.json({
      quotes,
      market: {
        open: isMarketOpen,
        spy: spy ? { price: spy.price, changePct: spy.changePct } : null,
        qqq: qqq ? { price: qqq.price, changePct: qqq.changePct } : null,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, quotes: [], market: { open: false } }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
