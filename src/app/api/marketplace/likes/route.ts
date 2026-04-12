import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/marketplace/likes?userId=xxx — Productos que le gustan al usuario
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "30"), 50);

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  const { data: likes, error } = await supabase
    .from("market_likes")
    .select("listing_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!likes || likes.length === 0) return NextResponse.json({ listings: [] });

  const listingIds = likes.map((l) => l.listing_id);
  const { data: listings } = await supabase
    .from("market_listings")
    .select("id, seller_id, title, price, currency, category, condition, photos, city, status, views, likes, created_at")
    .in("id", listingIds)
    .neq("status", "deleted");

  // Fetch seller info
  const sellerIds = [...new Set((listings || []).map((l) => l.seller_id))];
  const { data: sellers } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .in("id", sellerIds.length > 0 ? sellerIds : ["_none_"]);

  const sellerMap = new Map(sellers?.map((s) => [s.id, s]) || []);

  const enriched = (listings || []).map((l) => {
    const seller = sellerMap.get(l.seller_id);
    return {
      ...l,
      seller: {
        id: l.seller_id,
        name: seller?.name || "Usuario",
        avatar_url: seller?.avatar_url || null,
      },
    };
  });

  return NextResponse.json({ listings: enriched });
}

/**
 * POST /api/marketplace/likes — Toggle like en un producto
 */
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { userId, listingId } = body;

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  if (!listingId) return NextResponse.json({ error: "listingId requerido" }, { status: 400 });

  // Check if already liked
  const { data: existing } = await supabase
    .from("market_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    // Unlike
    await supabase.from("market_likes").delete().eq("id", existing.id);

    // Decrement likes count
    await supabase.rpc("decrement_listing_likes", { p_listing_id: listingId });

    return NextResponse.json({ ok: true, liked: false });
  }

  // Like
  const { error } = await supabase
    .from("market_likes")
    .insert({ user_id: userId, listing_id: listingId });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment likes count
  await supabase.rpc("increment_listing_likes", { p_listing_id: listingId });

  return NextResponse.json({ ok: true, liked: true });
}

export const dynamic = "force-dynamic";
