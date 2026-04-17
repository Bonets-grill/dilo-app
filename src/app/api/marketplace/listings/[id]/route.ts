import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";

const supabase = getServiceRoleClient();

const VALID_CATEGORIES = [
  "tech", "fashion", "home", "motor", "sports",
  "books", "baby", "jobs", "fitness", "music", "other",
];
const VALID_CONDITIONS = ["new", "like_new", "good", "fair", "parts"];
const VALID_STATUSES = ["active", "sold", "reserved", "paused"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/marketplace/listings/[id] — Detalle de un producto
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  // Optional auth — viewing a listing is public; we just need userId to
  // tag the "liked" flag if present.
  const supa = await (await import("@/lib/supabase/server")).createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  const userId = user?.id ?? null;

  const { data: listing, error } = await supabase
    .from("market_listings")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (error || !listing) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  // Seller info
  const { data: seller } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .eq("id", listing.seller_id)
    .single();

  const { data: stats } = await supabase
    .from("market_seller_stats")
    .select("*")
    .eq("user_id", listing.seller_id)
    .single();

  // Offers count
  const { count: offersCount } = await supabase
    .from("market_offers")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id)
    .eq("status", "pending");

  // Check if current user liked this
  let liked = false;
  if (userId) {
    const { data: likeRow } = await supabase
      .from("market_likes")
      .select("id")
      .eq("user_id", userId)
      .eq("listing_id", id)
      .maybeSingle();
    liked = !!likeRow;
  }

  // Increment views
  await supabase
    .from("market_listings")
    .update({ views: (listing.views || 0) + 1 })
    .eq("id", id);

  return NextResponse.json({
    listing: {
      ...listing,
      views: (listing.views || 0) + 1,
    },
    seller: {
      id: listing.seller_id,
      name: seller?.name || "Usuario",
      avatar_url: seller?.avatar_url || null,
      rating: stats?.avg_rating || 0,
      totalReviews: stats?.total_reviews || 0,
      totalSold: stats?.total_sold || 0,
      responseRate: stats?.response_rate_pct || 100,
      memberSince: stats?.member_since || listing.created_at,
    },
    offersCount: offersCount || 0,
    liked,
  });
}

/**
 * PATCH /api/marketplace/listings/[id] — Actualizar producto (solo owner)
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const { id } = await ctx.params;
  const body = await req.json();
  const updates = body;

  // Verify ownership
  const { data: existing } = await supabase
    .from("market_listings")
    .select("seller_id, status")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (existing.seller_id !== userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (existing.status === "deleted") return NextResponse.json({ error: "Producto eliminado" }, { status: 410 });

  // Allowed fields
  const allowed: Record<string, unknown> = {};
  if (updates.title !== undefined) allowed.title = updates.title.trim();
  if (updates.description !== undefined) allowed.description = updates.description?.trim() || null;
  if (updates.price !== undefined && updates.price >= 0) allowed.price = updates.price;
  if (updates.category && VALID_CATEGORIES.includes(updates.category)) allowed.category = updates.category;
  if (updates.condition && VALID_CONDITIONS.includes(updates.condition)) allowed.condition = updates.condition;
  if (updates.photos !== undefined) allowed.photos = updates.photos;
  if (updates.video_url !== undefined) allowed.video_url = updates.video_url || null;
  if (updates.city !== undefined) allowed.city = updates.city || null;
  if (updates.status && VALID_STATUSES.includes(updates.status)) allowed.status = updates.status;
  allowed.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("market_listings")
    .update(allowed)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, listing: updated });
}

/**
 * DELETE /api/marketplace/listings/[id] — Soft delete (solo owner)
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const { id } = await ctx.params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("market_listings")
    .select("seller_id")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (existing.seller_id !== userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { error } = await supabase
    .from("market_listings")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
