"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Eye,
  Heart,
  MessageCircle,
  Package,
  ShoppingBag,
  Star,
  TrendingUp,
} from "lucide-react";

interface MyListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  photo_urls: string[];
  status: string;
  views: number;
  likes: number;
  offers_count: number;
  created_at: string;
}

interface Stats {
  total_listings: number;
  total_sold: number;
  avg_rating: number;
  total_views: number;
}

const STATUS_FILTERS = ["all", "active", "sold", "paused"] as const;

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    sold: "bg-purple-500/20 text-purple-400",
    paused: "bg-yellow-500/20 text-yellow-400",
    reserved: "bg-blue-500/20 text-blue-400",
  };
  const labels: Record<string, string> = {
    active: t("feed"),
    sold: t("sold"),
    paused: "Paused",
    reserved: t("reserved"),
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.active}`}>
      {labels[status] || status}
    </span>
  );
}

export default function MyListingsPage() {
  const t = useTranslations("market");
  const tc = useTranslations("common");
  const router = useRouter();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const [listRes, statsRes] = await Promise.all([
          fetch("/api/marketplace/my-listings"),
          fetch("/api/marketplace/my-stats"),
        ]);

        if (listRes.ok) {
          const data = await listRes.json();
          setListings(data.listings ?? data.data ?? data ?? []);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.stats ?? data);
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered =
    statusFilter === "all"
      ? listings
      : listings.filter((l) => l.status === statusFilter);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <button type="button" onClick={() => router.back()} className="p-1">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold flex-1">{t("myListings")}</h1>
        <Link
          href="/market/sell"
          className="text-xs text-orange-400 font-medium"
        >
          + {t("sell")}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-4 gap-2">
                <StatCard
                  icon={<Package size={16} className="text-orange-400" />}
                  value={stats.total_listings}
                  label={t("myListings")}
                />
                <StatCard
                  icon={<ShoppingBag size={16} className="text-green-400" />}
                  value={stats.total_sold}
                  label={t("sold")}
                />
                <StatCard
                  icon={<Star size={16} className="text-yellow-400" />}
                  value={stats.avg_rating.toFixed(1)}
                  label={t("rating")}
                />
                <StatCard
                  icon={<Eye size={16} className="text-blue-400" />}
                  value={stats.total_views}
                  label={t("views")}
                />
              </div>
            )}

            {/* Status filter */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {STATUS_FILTERS.map((s) => (
                <button type="button"
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    statusFilter === s
                      ? "bg-orange-500 text-white"
                      : "bg-white/[0.05] text-[var(--dim)] border border-white/[0.08]"
                  }`}
                >
                  {s === "all"
                    ? t("feed")
                    : s === "active"
                    ? t("feed")
                    : s === "sold"
                    ? t("sold")
                    : s}
                </button>
              ))}
            </div>

            {/* Listings */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--dim)]">
                <ShoppingBag size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t("noListings")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/market/${listing.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] active:scale-[0.99] transition"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black flex-shrink-0">
                      {listing.photo_urls?.[0] ? (
                        <Image
                          src={listing.photo_urls[0]}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--dim)]">
                          <Package size={20} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-white truncate">
                          {listing.title}
                        </p>
                        <StatusBadge status={listing.status} t={t} />
                      </div>
                      <p className="text-sm font-bold text-orange-400">
                        {listing.currency === "EUR" ? "€" : "$"}{listing.price}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--dim)]">
                        <span className="flex items-center gap-0.5">
                          <Eye size={10} /> {listing.views}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Heart size={10} /> {listing.likes}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle size={10} /> {listing.offers_count}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-base font-bold text-white">{value}</p>
      <p className="text-[9px] text-[var(--dim)] truncate">{label}</p>
    </div>
  );
}
