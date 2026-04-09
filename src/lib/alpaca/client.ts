/**
 * Alpaca API Client — thin wrapper for trading endpoints
 * All functions require a valid OAuth access token.
 */

const BASE_URL = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";

async function alpacaFetch(token: string, path: string, init?: RequestInit, useDataUrl = false) {
  const base = useDataUrl ? DATA_URL : BASE_URL;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Account ──

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
}

export async function getAccount(token: string): Promise<AlpacaAccount> {
  return alpacaFetch(token, "/v2/account");
}

// ── Positions ──

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  avg_entry_price: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export async function getPositions(token: string): Promise<AlpacaPosition[]> {
  return alpacaFetch(token, "/v2/positions");
}

export async function getPosition(token: string, symbol: string): Promise<AlpacaPosition> {
  return alpacaFetch(token, `/v2/positions/${encodeURIComponent(symbol)}`);
}

// ── Orders ──

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  side: string;
  type: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  created_at: string;
  filled_at: string | null;
  submitted_at: string;
}

export async function getOrders(
  token: string,
  params: { status?: string; limit?: number; after?: string; direction?: string } = {}
): Promise<AlpacaOrder[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.after) qs.set("after", params.after);
  if (params.direction) qs.set("direction", params.direction);
  return alpacaFetch(token, `/v2/orders?${qs.toString()}`);
}

// ── Portfolio History ──

export interface PortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

export async function getPortfolioHistory(
  token: string,
  params: { period?: string; timeframe?: string } = {}
): Promise<PortfolioHistory> {
  const qs = new URLSearchParams();
  qs.set("period", params.period || "1M");
  qs.set("timeframe", params.timeframe || "1D");
  return alpacaFetch(token, `/v2/account/portfolio/history?${qs.toString()}`);
}

// ── Activities (for trade journal import) ──

export interface AlpacaActivity {
  id: string;
  activity_type: string;
  symbol: string;
  side: string;
  qty: string;
  price: string;
  cum_qty: string;
  leaves_qty: string;
  order_id: string;
  transaction_time: string;
  type: string;
}

export async function getActivities(
  token: string,
  params: { activity_types?: string; after?: string; direction?: string; page_size?: number } = {}
): Promise<AlpacaActivity[]> {
  const qs = new URLSearchParams();
  qs.set("activity_types", params.activity_types || "FILL");
  if (params.after) qs.set("after", params.after);
  if (params.direction) qs.set("direction", params.direction);
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return alpacaFetch(token, `/v2/account/activities?${qs.toString()}`);
}

// ── Place Order ──

export interface OrderRequest {
  symbol: string;
  qty?: string;
  notional?: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  limit_price?: string;
  stop_price?: string;
}

export async function placeOrder(token: string, order: OrderRequest): Promise<AlpacaOrder> {
  return alpacaFetch(token, "/v2/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}

export async function cancelOrder(token: string, orderId: string): Promise<void> {
  await alpacaFetch(token, `/v2/orders/${orderId}`, { method: "DELETE" });
}

// ── Market Data (quotes) ──

export async function getLatestQuote(token: string, symbol: string) {
  return alpacaFetch(token, `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`, undefined, true);
}

export async function getLatestBar(token: string, symbol: string) {
  return alpacaFetch(token, `/v2/stocks/${encodeURIComponent(symbol)}/bars/latest`, undefined, true);
}
