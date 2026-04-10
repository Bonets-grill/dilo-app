import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_CATEGORIES = [
  "tech", "fashion", "home", "motor", "sports",
  "books", "baby", "jobs", "fitness", "music", "other",
];
const VALID_CONDITIONS = ["new", "like_new", "good", "fair", "parts"];

/**
 * GET /api/marketplace/search — Búsqueda avanzada de productos
 * Query params: q, category, condition, priceMin, priceMax, city, sort, cursor, limit
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q");
  const category = params.get("category");
  const condition = params.get("condition");
  const priceMin = params.get("priceMin");
  const priceMax = params.get("priceMax");
  const city = params.get("city");
  const sort = params.get("sort") || "recent";
  const cursor = params.get("cursor");
  const limit = Math.min(parseInt(params.get("limit") || "20"), 50);

  if (!q && !category && !city) {
    return NextResponse.json({ error: "Se requiere al menos un criterio de búsqueda (q, category o city)" }, { status: 400 });
  }

  let query = supabase
    .from("market_listings")
    .select("id, seller_id, title, description, price, currency, category, condition, photos, video_url, city, status, featured, views, likes, created_at")
    .eq("status", "active");

  // Full text search on title + description
  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  // Filters
  if (category && VALID_CATEGORIES.includes(category)) {
    query = query.eq("category", category);
  }
  if (condition && VALID_CONDITIONS.includes(condition)) {
    query = query.eq("condition", condition);
  }
  if (priceMin) {
    const min = parseFloat(priceMin);
    if (!isNaN(min)) query = query.gte("price", min);
  }
  if (priceMax) {
    const max = parseFloat(priceMax);
    if (!isNaN(max)) query = query.lte("price", max);
  }
  if (city) {
    query = query.ilike("city", `%${city}%`);
  }

  // Sorting
  if (sort === "price_asc") {
    query = query.order("price", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price", { ascending: false });
  } else {
    query = query.order("featured", { ascending: false }).order("created_at", { ascending: false });
  }

  // Cursor pagination
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  query = query.limit(limit);

  const { data: listings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!listings || listings.length === 0) {
    return NextResponse.json({ listings: [], nextCursor: null, total: 0 });
  }

  // Seller info
  const sellerIds = [...new Set(listings.map((l) => l.seller_id))];
  const { data: sellers } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .in("id", sellerIds);

  const { data: sellerStats } = await supabase
    .from("market_seller_stats")
    .select("user_id, avg_rating, total_reviews")
    .in("user_id", sellerIds);

  const sellerMap = new Map(sellers?.map((s) => [s.id, s]) || []);
  const statsMap = new Map(sellerStats?.map((s) => [s.user_id, s]) || []);

  const enriched = listings.map((l) => {
    const seller = sellerMap.get(l.seller_id);
    const stats = statsMap.get(l.seller_id);
    return {
      ...l,
      seller: {
        id: l.seller_id,
        name: seller?.name || "Usuario",
        avatar_url: seller?.avatar_url || null,
        rating: stats?.avg_rating || 0,
        reviews: stats?.total_reviews || 0,
      },
    };
  });

  const nextCursor = listings.length === limit
    ? listings[listings.length - 1].created_at
    : null;

  return NextResponse.json({ listings: enriched, nextCursor });
}

export const dynamic = "force-dynamic";
