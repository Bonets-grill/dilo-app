"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState, useRef, use } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Star,
  Flag,
  MessageCircle,
} from "lucide-react";

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  condition: string;
  city: string;
  photo_urls: string[];
  video_url: string | null;
  views: number;
  likes: number;
  status: string;
  created_at: string;
  seller: {
    id: string;
    name: string;
    avatar_url: string | null;
    rating: number;
    reviews_count: number;
    member_since: string;
    response_rate: number;
  };
}

interface SimilarListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  photo_urls: string[];
}

function ConditionLabel({ condition, t }: { condition: string; t: (key: string) => string }) {
  const colors: Record<string, string> = {
    new: "bg-green-500/20 text-green-400",
    like_new: "bg-emerald-500/20 text-emerald-400",
    good: "bg-blue-500/20 text-blue-400",
    fair: "bg-yellow-500/20 text-yellow-400",
    parts: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${colors[condition] || colors.good}`}>
      {t(`condition.${condition}`)}
    </span>
  );
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("market");
  const tc = useTranslations("common");
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<SimilarListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [showOffer, setShowOffer] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerSent, setOfferSent] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/marketplace/listings/${id}`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        setListing(data.listing ?? data);

        // Fetch similar
        const cat = (data.listing ?? data).category;
        if (cat) {
          const simRes = await fetch(`/api/marketplace/listings?category=${cat}&limit=4`);
          if (simRes.ok) {
            const simData = await simRes.json();
            const items: SimilarListing[] = simData.listings ?? simData.data ?? simData ?? [];
            setSimilar(items.filter((s: SimilarListing) => s.id !== id).slice(0, 4));
          }
        }
      } catch {
        // listing not found
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleOffer = async () => {
    if (!offerPrice.trim() || !listing) return;
    try {
      await fetch(`/api/marketplace/listings/${id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(offerPrice) }),
      });
      setOfferSent(true);
      setTimeout(() => {
        setShowOffer(false);
        setOfferSent(false);
      }, 2000);
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--dim)]">
        <p className="text-sm">{tc("error")}</p>
        <button type="button" onClick={() => router.back()} className="text-orange-400 text-sm">
          {tc("back")}
        </button>
      </div>
    );
  }

  const allMedia = listing.photo_urls || [];
  const currSymbol = listing.currency === "EUR" ? "€" : "$";

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      {/* Back button */}
      <button type="button"
        onClick={() => router.back()}
        className="fixed top-3 left-3 z-50 p-2 rounded-full bg-black/50 backdrop-blur-sm"
      >
        <ArrowLeft size={20} className="text-white" />
      </button>

      {/* Gallery */}
      <div className="relative w-full h-[50vh] bg-black">
        {listing.video_url ? (
          <video
            src={listing.video_url}
            className="w-full h-full object-cover"
            controls
            playsInline
          />
        ) : allMedia.length > 0 ? (
          <>
            <Image src={allMedia[galleryIdx]} alt="" fill className="object-cover" />
            {allMedia.length > 1 && (
              <>
                <button type="button"
                  onClick={() => setGalleryIdx((p) => (p - 1 + allMedia.length) % allMedia.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40"
                >
                  <ChevronLeft size={18} className="text-white" />
                </button>
                <button type="button"
                  onClick={() => setGalleryIdx((p) => (p + 1) % allMedia.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40"
                >
                  <ChevronRight size={18} className="text-white" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {allMedia.map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full ${i === galleryIdx ? "bg-white" : "bg-white/40"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--dim)]">
            No media
          </div>
        )}
      </div>

      {/* Details */}
      <div className="px-4 py-4 space-y-4">
        {/* Title & Price */}
        <div>
          <h1 className="text-xl font-bold text-white">{listing.title}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-2xl font-bold text-orange-400">
              {currSymbol}{listing.price}
            </span>
            <ConditionLabel condition={listing.condition} t={t} />
          </div>
          <p className="text-xs text-[var(--dim)] mt-1">
            {t(`categories.${listing.category}`)} · {listing.city}
          </p>
        </div>

        {/* Description */}
        <div>
          <h2 className="text-sm font-semibold text-white/80 mb-1">{t("description")}</h2>
          <p className="text-sm text-[var(--dim)] whitespace-pre-wrap">{listing.description}</p>
        </div>

        {/* Seller card */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
              {listing.seller.avatar_url ? (
                <Image src={listing.seller.avatar_url} alt="" fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white">
                  {listing.seller.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{listing.seller.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={12}
                      className={
                        i <= Math.round(listing.seller.rating)
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-600"
                      }
                    />
                  ))}
                </div>
                <span className="text-xs text-[var(--dim)]">
                  ({listing.seller.reviews_count} {t("reviews")})
                </span>
              </div>
              {listing.seller.member_since && (
                <p className="text-[10px] text-[var(--dim)] mt-0.5">
                  {t("sellerSince")} {new Date(listing.seller.member_since).getFullYear()}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Link
              href="/dm"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-medium active:scale-95 transition"
            >
              <MessageCircle size={16} />
              {t("chatSeller")}
            </Link>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button type="button"
            onClick={() => setShowOffer(true)}
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.08] text-white text-sm font-semibold active:scale-95 transition border border-white/[0.1]"
          >
            {t("makeOffer")}
          </button>
          <button type="button" className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold active:scale-95 transition">
            {t("buyNow")}
          </button>
        </div>

        {/* Offer form inline */}
        {showOffer && (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-orange-500/30 space-y-3">
            <p className="text-sm font-semibold text-white">{t("makeOffer")}</p>
            {offerSent ? (
              <p className="text-sm text-green-400">✓ {t("makeOffer")}</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  placeholder={`${currSymbol}...`}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-sm text-white placeholder:text-[var(--dim)] focus:outline-none focus:border-orange-500/50"
                />
                <button type="button"
                  onClick={handleOffer}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium"
                >
                  {t("publish")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Similar products */}
        {similar.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-white/80 mb-2">{t("similar")}</h2>
            <div className="grid grid-cols-2 gap-2">
              {similar.map((item) => (
                <Link
                  key={item.id}
                  href={`/market/${item.id}`}
                  className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06]"
                >
                  <div className="relative aspect-square bg-black">
                    {item.photo_urls?.[0] ? (
                      <Image src={item.photo_urls[0]} alt="" fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--dim)] text-xs">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-white truncate">{item.title}</p>
                    <p className="text-sm font-bold text-orange-400">
                      {item.currency === "EUR" ? "€" : "$"}{item.price}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Report */}
        <button type="button" className="flex items-center gap-1.5 text-xs text-[var(--dim)] hover:text-red-400 transition">
          <Flag size={12} />
          {t("report")}
        </button>

        <div className="h-8" />
      </div>
    </div>
  );
}
