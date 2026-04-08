"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    // Go directly to chat — auth will be real when Supabase email is configured
    router.push("/chat");
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] mb-4">
            <span className="text-xl font-bold">D</span>
          </div>
          <p className="text-[#888] text-sm">{t("login")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("email")}
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-[#555] focus:outline-none focus:border-[#444] transition text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50"
          >
            {loading ? "..." : t("login")}
          </button>
        </form>

        <p className="text-center text-xs text-[#555] mt-5">
          <Link href="/signup" className="text-[#888] hover:text-white">{t("signup")}</Link>
        </p>
      </div>
    </main>
  );
}
