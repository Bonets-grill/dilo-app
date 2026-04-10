"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  Heart,
  MessageCircle,
  Share2,
  Plus,
  Search,
  Star,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
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
  };
}

const CATEGORIES = [
  "all",
  "tech",
  "fashion",
  "home",
  "motor",
  "sports",
  "books",
  "baby",
  "jobs",
  "fitness",
  "music",
  "other",
] as const;

function ConditionBadge({ condition, t }: { condition: string; t: (key: string) => string }) {
  const colors: Record<string, string> = {
    new: "bg-green-500/20 text-green-400",
    like_new: "bg-emerald-500/20 text-emerald-400",
    good: "bg-blue-500/20 text-blue-400",
    fair: "bg-yellow-500/20 text-yellow-400",
    parts: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[condition] || colors.good}`}>
      {t(`condition.${condition}`)}
    </span>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={10}
          className={i <= Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-600"}
        />
      ))}
    </span>
  );
}

function PhotoCarousel({ urls }: { urls: string[] }) {
  const [idx, setIdx] = useState(0);
  if (urls.length === 0) {
    return (
      <div className="w-full h-[60vh] bg-white/[0.03] flex items-center justify-center text-[var(--dim)]">
        No photo
      </div>
    );
  }
  return (
    <div className="relative w-full h-[60vh]">
      <img
        src={urls[idx]}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
      />
      {urls.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((p) => (p - 1 + urls.length) % urls.length); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40"
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((p) => (p + 1) % urls.length); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40"
          >
            <ChevronRight size={18} className="text-white" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {urls.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  return (
    <div className="relative w-full h-[60vh]">
      <video
        ref={ref}
        src={url}
        className="w-full h-full object-cover"
        autoPlay
        loop
        muted={muted}
        playsInline
      />
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute top-3 right-3 p-2 rounded-full bg-black/40"
      >
        {muted ? <VolumeX size={16} className="text-white" /> : <Volume2 size={16} className="text-white" />}
      </button>
    </div>
  );
}

function ListingCard({ listing, t }: { listing: Listing; t: (key: string) => string }) {
  const [liked, setLiked] = useState(false);

  return (
    <div className="relative w-full snap-start">
      {/* Media */}
      {listing.video_url ? (
        <VideoPlayer url={listing.video_url} />
      ) : (
        <PhotoCarousel urls={listing.photo_urls || []} />
      )}

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-5">
        <div className="flex items-end justify-between">
          <div className="flex-1 min-w-0">
            {/* Seller info */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-white/20 overflow-hidden flex-shrink-0">
                {listing.seller.avatar_url ? (
                  <img src={listing.seller.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                    {listing.seller.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{listing.seller.name}</p>
                <RatingStars rating={listing.seller.rating} />
              </div>
            </div>

            {/* Product info */}
            <h3 className="text-base font-bold text-white truncate">{listing.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-orange-400">
                {listing.currency === "EUR" ? "€" : "$"}{listing.price}
              </span>
              <ConditionBadge condition={listing.condition} t={t} />
            </div>
            <p className="text-xs text-white/60 mt-0.5">{listing.city}</p>

            {/* Buy button */}
            <Link
              href={`/market/${listing.id}`}
              className="mt-3 inline-block px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold active:scale-95 transition"
            >
              {t("buyNow")}
            </Link>
          </div>

          {/* Right side action buttons */}
          <div className="flex flex-col items-center gap-4 ml-3">
            <button
              onClick={() => setLiked((l) => !l)}
              className="flex flex-col items-center gap-0.5"
            >
              <Heart
                size={24}
                className={liked ? "text-red-500 fill-red-500" : "text-white"}
              />
              <span className="text-[10px] text-white">{listing.likes + (liked ? 1 : 0)}</span>
            </button>
            <Link href={`/dm`} className="flex flex-col items-center gap-0.5">
              <MessageCircle size={24} className="text-white" />
              <span className="text-[10px] text-white">{t("chatSeller")?.split(" ")[0]}</span>
            </Link>
            <button className="flex flex-col items-center gap-0.5">
              <Share2 size={24} className="text-white" />
              <span className="text-[10px] text-white">{t("share")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  const t = useTranslations("market");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchListings = useCallback(
    async (pageNum: number, reset = false) => {
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: "10",
        });
        if (category !== "all") params.set("category", category);
        if (search.trim()) params.set("q", search.trim());

        const res = await fetch(`/api/marketplace/listings?${params}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();

        const items: Listing[] = data.listings ?? data.data ?? data ?? [];
        if (reset) {
          setListings(items);
        } else {
          setListings((prev) => [...prev, ...items]);
        }
        setHasMore(items.length >= 10);
      } catch {
        if (reset) setListings([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [category, search]
  );

  useEffect(() => {
    setPage(0);
    setLoading(true);
    fetchListings(0, true);
  }, [category, fetchListings]);

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const next = page + 1;
          setPage(next);
          fetchListings(next);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchListings]);

  // Pull to refresh
  const handleRefresh = () => {
    setPage(0);
    setLoading(true);
    fetchListings(0, true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setLoading(true);
    fetchListings(0, true);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search bar */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <form onSubmit={handleSearch} className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-[var(--dim)] focus:outline-none focus:border-orange-500/50"
          />
        </form>
      </div>

      {/* Category tabs */}
      <div className="flex-shrink-0 px-3 pb-2 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 min-w-max">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap ${
                category === cat
                  ? "bg-orange-500 text-white"
                  : "bg-white/[0.05] text-[var(--dim)] border border-white/[0.08]"
              }`}
            >
              {cat === "all" ? t("feed") : t(`categories.${cat}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory overscroll-y-contain"
      >
        {/* Pull to refresh zone */}
        <div className="text-center py-2">
          <button onClick={handleRefresh} className="text-xs text-[var(--dim)]">
            ↓ {t("feed")}
          </button>
        </div>

        {loading && listings.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--dim)]">
            <p className="text-sm">{t("noListings")}</p>
          </div>
        ) : (
          listings.map((listing) => (
            <Link key={listing.id} href={`/market/${listing.id}`}>
              <ListingCard listing={listing} t={t} />
            </Link>
          ))
        )}

        {/* Infinite scroll sentinel */}
        <div ref={observerRef} className="h-10" />
      </div>

      {/* Floating sell button */}
      <Link
        href="/market/sell"
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-orange-500 shadow-lg shadow-orange-500/30 flex items-center justify-center active:scale-95 transition"
      >
        <Plus size={28} className="text-white" />
      </Link>
    </div>
  );
}
