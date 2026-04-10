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
const VALID_SORTS = ["recent", "price_asc", "price_desc"];

/**
 * GET /api/marketplace/listings — Feed de productos
 * Query params: category, city, search, sort, cursor, limit
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const category = params.get("category");
  const city = params.get("city");
  const search = params.get("search");
  const sort = params.get("sort") || "recent";
  const cursor = params.get("cursor"); // ISO timestamp for keyset pagination
  const limit = Math.min(parseInt(params.get("limit") || "20"), 50);

  let query = supabase
    .from("market_listings")
    .select("id, seller_id, title, description, price, currency, category, condition, photos, video_url, city, status, featured, views, likes, ai_suggested_price, created_at, updated_at")
    .eq("status", "active");

  if (category && VALID_CATEGORIES.includes(category)) {
    query = query.eq("category", category);
  }
  if (city) {
    query = query.ilike("city", `%${city}%`);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  // Sorting
  if (sort === "price_asc") {
    query = query.order("price", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price", { ascending: false });
  } else {
    // Featured first, then recent
    query = query.order("featured", { ascending: false }).order("created_at", { ascending: false });
  }

  // Cursor-based pagination
  if (cursor) {
    if (sort === "recent" || !VALID_SORTS.includes(sort)) {
      query = query.lt("created_at", cursor);
    }
  }

  query = query.limit(limit);

  const { data: listings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!listings || listings.length === 0) {
    return NextResponse.json({ listings: [], nextCursor: null });
  }

  // Fetch seller info for all listings
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

  // Increment view counts in background (fire-and-forget)
  const ids = listings.map((l) => l.id);
  supabase.rpc("increment_views_bulk", { listing_ids: ids }).then(() => {});

  const nextCursor = listings.length === limit
    ? listings[listings.length - 1].created_at
    : null;

  return NextResponse.json({ listings: enriched, nextCursor });
}

/**
 * POST /api/marketplace/listings — Crear nuevo producto
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    userId, title, description, price, category, condition,
    photos, video_url, city, latitude, longitude,
  } = body;

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  if (!title || !title.trim()) return NextResponse.json({ error: "Título requerido" }, { status: 400 });
  if (price == null || price < 0) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }
  if (condition && !VALID_CONDITIONS.includes(condition)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const { data: listing, error } = await supabase
    .from("market_listings")
    .insert({
      seller_id: userId,
      title: title.trim(),
      description: description?.trim() || null,
      price,
      category,
      condition: condition || null,
      photos: photos || [],
      video_url: video_url || null,
      city: city || null,
      latitude: latitude || null,
      longitude: longitude || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update seller stats
  await supabase.rpc("increment_seller_listings", { p_user_id: userId });

  return NextResponse.json({ ok: true, listing }, { status: 201 });
}

export const dynamic = "force-dynamic";
