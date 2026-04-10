"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, Copy, Check, Gift, Users, MousePointerClick, Share2 } from "lucide-react";

export default function ReferralsPage() {
  const t = useTranslations("referrals");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [clicks, setClicks] = useState(0);
  const [signups, setSignups] = useState(0);
  const [rewardGranted, setRewardGranted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      try {
        const res = await fetch(`/api/referral?userId=${user.id}`, {
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json();
        setCode(data.code);
        setLink(data.link);
        setClicks(data.clicks);
        setSignups(data.signups);
        setRewardGranted(data.reward_granted);
      } catch { /* skip */ }
      setLoading(false);
    });
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareText = t("shareText");

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + "\n" + link)}`, "_blank");
  }

  function shareTelegram() {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`, "_blank");
  }

  function shareTwitter() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`, "_blank");
  }

  function shareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(shareText)}`, "_blank");
  }

  function shareNative() {
    if (navigator.share) {
      navigator.share({ title: "DILO", text: shareText, url: link }).catch(() => {});
    } else {
      copyLink();
    }
  }

  const progress = Math.min(signups, 10);
  const progressPct = (progress / 10) * 100;

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-dvh">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Back */}
        <button onClick={() => router.push("/settings")} className="flex items-center gap-1 text-[var(--dim)] text-sm">
          <ArrowLeft size={16} />
          <span>{t("back")}</span>
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent)]/20 mb-3">
            <Gift size={28} className="text-[var(--accent)]" />
          </div>
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="text-sm text-[var(--dim)] mt-1">{t("subtitle")}</p>
        </div>

        {/* Progress */}
        <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[var(--dim)]">{t("progress")}</span>
            <span className={`font-bold ${rewardGranted ? "text-green-400" : "text-[var(--accent)]"}`}>
              {rewardGranted ? t("premiumUnlocked") : `${progress}/10`}
            </span>
          </div>
          <div className="w-full h-3 bg-[var(--bg1)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progressPct}%`,
                background: rewardGranted ? "#10b981" : "var(--accent)",
              }}
            />
          </div>
          {!rewardGranted && (
            <p className="text-[11px] text-[var(--dim)] mt-2">{t("rewardDesc")}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3 text-center">
            <MousePointerClick size={18} className="text-[var(--dim)] mx-auto mb-1" />
            <p className="text-2xl font-bold">{clicks}</p>
            <p className="text-[10px] text-[var(--dim)]">{t("clicks")}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3 text-center">
            <Users size={18} className="text-[var(--dim)] mx-auto mb-1" />
            <p className="text-2xl font-bold">{signups}</p>
            <p className="text-[10px] text-[var(--dim)]">{t("registered")}</p>
          </div>
        </div>

        {/* Link */}
        <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--dim)] mb-2">{t("yourLink")}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--bg1)] rounded-xl px-3 py-2.5 text-sm text-white truncate font-mono">
              {link}
            </div>
            <button onClick={copyLink} className="w-10 h-10 rounded-xl bg-[var(--bg3)] flex items-center justify-center flex-shrink-0 active:scale-95 transition">
              {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-white" />}
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="space-y-2">
          <p className="text-xs text-[var(--dim)]">{t("shareOn")}</p>
          <div className="grid grid-cols-2 gap-2">
            {/* WhatsApp */}
            <button onClick={shareWhatsApp} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 active:scale-[0.98] transition">
              <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </div>
              <span className="text-sm text-white">WhatsApp</span>
            </button>

            {/* Telegram */}
            <button onClick={shareTelegram} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0088cc]/10 border border-[#0088cc]/20 active:scale-[0.98] transition">
              <div className="w-8 h-8 rounded-full bg-[#0088cc] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </div>
              <span className="text-sm text-white">Telegram</span>
            </button>

            {/* Twitter/X */}
            <button onClick={shareTwitter} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 active:scale-[0.98] transition">
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0 border border-white/20">
                <span className="text-white font-bold text-sm">X</span>
              </div>
              <span className="text-sm text-white">X / Twitter</span>
            </button>

            {/* Facebook */}
            <button onClick={shareFacebook} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/20 active:scale-[0.98] transition">
              <div className="w-8 h-8 rounded-full bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">f</span>
              </div>
              <span className="text-sm text-white">Facebook</span>
            </button>
          </div>

          {/* Native share */}
          <button onClick={shareNative} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-medium active:scale-[0.98] transition">
            <Share2 size={16} />
            {t("shareMore")}
          </button>
        </div>

        {/* Code display */}
        <p className="text-center text-[11px] text-[var(--dim)]">
          {t("code")}: <span className="font-mono text-white">{code}</span>
        </p>
      </div>
    </div>
  );
}
