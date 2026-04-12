"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

interface MarketData {
  quotes: QuoteData[];
  market: {
    open: boolean;
    spy: { price: number; changePct: number } | null;
    qqq: { price: number; changePct: number } | null;
  };
  fetchedAt: string;
}

const POLL_INTERVAL = 15_000; // 15 seconds for live feel

export default function MarketTicker() {
  const [data, setData] = useState<MarketData | null>(null);
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [flashing, setFlashing] = useState<Record<string, "up" | "down" | null>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/trading/live-quotes");
      if (!res.ok) return;
      const json: MarketData = await res.json();

      // Detect price changes for flash animation
      if (data?.quotes) {
        const flashes: Record<string, "up" | "down" | null> = {};
        const prevMap: Record<string, number> = {};

        for (const q of json.quotes) {
          const prev = data.quotes.find(p => p.symbol === q.symbol);
          if (prev && prev.price !== q.price && q.price > 0) {
            flashes[q.symbol] = q.price > prev.price ? "up" : "down";
            prevMap[q.symbol] = prev.price;
          }
        }

        if (Object.keys(flashes).length > 0) {
          setFlashing(flashes);
          setPrevPrices(prev => ({ ...prev, ...prevMap }));
          // Clear flash after 1.5s
          setTimeout(() => setFlashing({}), 1500);
        }
      }

      setData(json);
    } catch { /* silent */ }
  }, [data]);

  useEffect(() => {
    fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(fetchQuotes, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchQuotes]);

  // Pause when tab hidden
  useEffect(() => {
    function onVis() {
      if (document.hidden) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      } else {
        fetchQuotes();
        intervalRef.current = setInterval(fetchQuotes, POLL_INTERVAL);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchQuotes]);

  if (!data || data.quotes.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 animate-pulse">
        <div className="h-4 bg-[var(--border)] rounded w-1/4 mb-2" />
        <div className="h-32 bg-[var(--border)] rounded" />
      </div>
    );
  }

  const { quotes, market } = data;
  const validQuotes = quotes.filter(q => q.price > 0);

  // Split into indices and stocks
  const indices = validQuotes.filter(q => ["SPY", "QQQ"].includes(q.symbol));
  const stocks = validQuotes.filter(q => !["SPY", "QQQ"].includes(q.symbol));

  return (
    <div className="space-y-2">

      {/* Market Header Bar */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={12} className={market.open ? "text-green-400" : "text-[var(--dim)]"} />
            <span className="text-[10px] font-medium text-[var(--dim)]">
              {market.open ? "US Market Open" : "US Market Closed"}
            </span>
          </div>

          {/* Indices inline */}
          <div className="flex items-center gap-3">
            {indices.map(idx => (
              <div key={idx.symbol} className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-[var(--dim)]">{idx.symbol}</span>
                <span className={`text-[10px] font-semibold ${
                  flashing[idx.symbol] === "up" ? "text-green-300 animate-pulse" :
                  flashing[idx.symbol] === "down" ? "text-red-300 animate-pulse" :
                  idx.changePct >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Stocks Grid */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-[10px] font-medium text-[var(--dim)] uppercase tracking-wider">Live Quotes</span>
          <div className="flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <span className="text-[8px] text-[var(--dim)]">15s</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px bg-[var(--border)]">
          {stocks.map(q => {
            const isUp = q.changePct >= 0;
            const flash = flashing[q.symbol];

            return (
              <div
                key={q.symbol}
                className={`bg-[var(--card)] px-2.5 py-2 transition-all duration-300 ${
                  flash === "up" ? "bg-green-500/10" :
                  flash === "down" ? "bg-red-500/10" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-bold">{q.symbol}</span>
                  {isUp ? (
                    <TrendingUp size={9} className="text-green-400" />
                  ) : (
                    <TrendingDown size={9} className="text-red-400" />
                  )}
                </div>

                <p className={`text-sm font-mono font-semibold tabular-nums transition-colors duration-300 ${
                  flash === "up" ? "text-green-300" :
                  flash === "down" ? "text-red-300" :
                  "text-white"
                }`}>
                  ${q.price.toFixed(2)}
                </p>

                <div className="flex items-center justify-between mt-0.5">
                  <span className={`text-[9px] font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{q.changePct.toFixed(2)}%
                  </span>
                  <span className={`text-[8px] ${isUp ? "text-green-400/60" : "text-red-400/60"}`}>
                    {isUp ? "+" : ""}{q.change.toFixed(2)}
                  </span>
                </div>

                {/* Day range mini bar */}
                {q.high > q.low && (
                  <div className="mt-1 h-0.5 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isUp ? "bg-green-500/40" : "bg-red-500/40"}`}
                      style={{
                        width: `${Math.min(100, ((q.price - q.low) / (q.high - q.low)) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
