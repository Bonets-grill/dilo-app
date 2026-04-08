import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Landing />;
}

function Landing() {
  const t = useTranslations("landing");
  const nav = useTranslations("nav");

  return (
    <main className="flex flex-col items-center justify-center min-h-dvh px-4 py-16">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium mb-8">
          DILO — AI Personal Secretary
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent">
          {t("hero")}
        </h1>

        <p className="text-lg text-gray-400 mb-10 max-w-md mx-auto">
          {t("subtitle")}
        </p>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-semibold text-lg hover:from-purple-500 hover:to-purple-400 transition-all shadow-lg shadow-purple-500/25"
        >
          {t("cta")}
        </Link>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-16">
          {(["messaging", "reading", "reminders", "expenses", "writing", "voice"] as const).map(
            (feature) => (
              <div
                key={feature}
                className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-gray-300"
              >
                {t(`features.${feature}`)}
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
