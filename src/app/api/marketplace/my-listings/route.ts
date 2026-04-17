import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/require-user";

const supabase = getServiceRoleClient();

/**
 * GET /api/marketplace/my-listings — Current user's listings + seller stats.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "30"), 50);

  let query = supabase
    .from("market_listings")
    .select("id, title, description, price, currency, category, condition, photos, video_url, city, status, featured, views, likes, ai_suggested_price, created_at, updated_at")
    .eq("seller_id", userId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: listings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!listings || listings.length === 0) {
    return NextResponse.json({ listings: [], stats: null });
  }

  // Get offers count per listing
  const listingIds = listings.map((l) => l.id);
  const { data: offers } = await supabase
    .from("market_offers")
    .select("listing_id, status")
    .in("listing_id", listingIds);

  const offersByListing = new Map<string, { pending: number; total: number }>();
  for (const o of offers || []) {
    const current = offersByListing.get(o.listing_id) || { pending: 0, total: 0 };
    current.total++;
    if (o.status === "pending") current.pending++;
    offersByListing.set(o.listing_id, current);
  }

  // Get likes count per listing (fresh from market_likes)
  const { data: likesData } = await supabase
    .from("market_likes")
    .select("listing_id")
    .in("listing_id", listingIds);

  const likesByListing = new Map<string, number>();
  for (const l of likesData || []) {
    likesByListing.set(l.listing_id, (likesByListing.get(l.listing_id) || 0) + 1);
  }

  const enriched = listings.map((l) => {
    const offerStats = offersByListing.get(l.id);
    return {
      ...l,
      likesCount: likesByListing.get(l.id) || l.likes || 0,
      offersCount: offerStats?.total || 0,
      pendingOffers: offerStats?.pending || 0,
    };
  });

  // Seller stats
  const { data: sellerStats } = await supabase
    .from("market_seller_stats")
    .select("*")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({
    listings: enriched,
    stats: sellerStats || {
      total_listings: listings.length,
      total_sold: 0,
      avg_rating: 0,
      total_reviews: 0,
      total_views: listings.reduce((sum, l) => sum + (l.views || 0), 0),
    },
  });
}

export const dynamic = "force-dynamic";
