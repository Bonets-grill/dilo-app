import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/marketplace/offers?userId=xxx&role=buyer|seller
 * Obtiene ofertas del usuario como comprador o vendedor
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const role = req.nextUrl.searchParams.get("role") || "buyer";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "30"), 50);

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  const column = role === "seller" ? "seller_id" : "buyer_id";

  const { data: offers, error } = await supabase
    .from("market_offers")
    .select("id, listing_id, buyer_id, seller_id, amount, message, status, created_at")
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!offers || offers.length === 0) {
    return NextResponse.json({ offers: [] });
  }

  // Enrich with listing info
  const listingIds = [...new Set(offers.map((o) => o.listing_id))];
  const { data: listings } = await supabase
    .from("market_listings")
    .select("id, title, price, photos, status")
    .in("id", listingIds);

  const listingMap = new Map(listings?.map((l) => [l.id, l]) || []);

  // Enrich with other user info
  const otherIds = [...new Set(offers.map((o) => role === "seller" ? o.buyer_id : o.seller_id))];
  const { data: users } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .in("id", otherIds);

  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const enriched = offers.map((o) => {
    const listing = listingMap.get(o.listing_id);
    const otherId = role === "seller" ? o.buyer_id : o.seller_id;
    const other = userMap.get(otherId);
    return {
      ...o,
      listing: listing ? {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        photo: listing.photos?.[0] || null,
        status: listing.status,
      } : null,
      otherUser: {
        id: otherId,
        name: other?.name || "Usuario",
        avatar_url: other?.avatar_url || null,
      },
    };
  });

  return NextResponse.json({ offers: enriched });
}

/**
 * POST /api/marketplace/offers — Crear oferta en un producto
 */
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { userId, listingId, amount, message } = body;

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  if (!listingId) return NextResponse.json({ error: "listingId requerido" }, { status: 400 });
  if (amount == null || amount <= 0) return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });

  // Get listing to verify it exists and get seller
  const { data: listing } = await supabase
    .from("market_listings")
    .select("id, seller_id, status, price")
    .eq("id", listingId)
    .single();

  if (!listing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (listing.status !== "active") return NextResponse.json({ error: "Producto no disponible" }, { status: 400 });
  if (listing.seller_id === userId) return NextResponse.json({ error: "No puedes ofertar en tu propio producto" }, { status: 400 });

  // Check for existing pending offer
  const { data: existingOffer } = await supabase
    .from("market_offers")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingOffer) {
    return NextResponse.json({ error: "Ya tienes una oferta pendiente en este producto" }, { status: 409 });
  }

  const { data: offer, error } = await supabase
    .from("market_offers")
    .insert({
      listing_id: listingId,
      buyer_id: userId,
      seller_id: listing.seller_id,
      amount,
      message: message?.trim() || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, offer }, { status: 201 });
}

/**
 * PATCH /api/marketplace/offers — Aceptar/rechazar oferta (solo vendedor)
 */
export async function PATCH(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { userId, offerId, action } = body;

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  if (!offerId) return NextResponse.json({ error: "offerId requerido" }, { status: 400 });
  if (!action || !["accepted", "rejected"].includes(action)) {
    return NextResponse.json({ error: "Acción inválida (accepted/rejected)" }, { status: 400 });
  }

  // Get offer
  const { data: offer } = await supabase
    .from("market_offers")
    .select("id, seller_id, listing_id, status")
    .eq("id", offerId)
    .single();

  if (!offer) return NextResponse.json({ error: "Oferta no encontrada" }, { status: 404 });
  if (offer.seller_id !== userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (offer.status !== "pending") return NextResponse.json({ error: "La oferta ya fue procesada" }, { status: 400 });

  // Update offer status
  const { error } = await supabase
    .from("market_offers")
    .update({ status: action })
    .eq("id", offerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If accepted, mark listing as reserved and reject other pending offers
  if (action === "accepted") {
    await supabase
      .from("market_listings")
      .update({ status: "reserved", updated_at: new Date().toISOString() })
      .eq("id", offer.listing_id);

    await supabase
      .from("market_offers")
      .update({ status: "rejected" })
      .eq("listing_id", offer.listing_id)
      .eq("status", "pending")
      .neq("id", offerId);
  }

  return NextResponse.json({ ok: true, status: action });
}

export const dynamic = "force-dynamic";
