import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

interface Props {
  params: Promise<{ code: string; locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;

  // Get referrer name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: referral } = await (supabase.from("referrals") as any)
    .select("referrer_id")
    .eq("referral_code", code)
    .single();

  let referrerName = "un amigo";
  if (referral) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user } = await (supabase.from("users") as any)
      .select("name")
      .eq("id", referral.referrer_id)
      .single();
    if (user?.name) referrerName = user.name;
  }

  return {
    title: `${referrerName} te invita a DILO`,
    description: "DILO es tu secretario personal con AI. Gestiona tus gastos, trading, WhatsApp, calendario, nutrición y mucho más. Todo por voz o texto.",
    openGraph: {
      title: `${referrerName} te invita a DILO`,
      description: "Tu secretario personal con AI. Gastos, trading, WhatsApp, calendario, nutrición — todo en una app.",
      siteName: "DILO",
      type: "website",
      url: `https://ordydilo.com/invite/${code}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${referrerName} te invita a DILO`,
      description: "Tu secretario personal con AI. Todo en una app.",
    },
  };
}

export default async function InvitePage({ params }: Props) {
  const { code, locale } = await params;

  // Track click
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: referral } = await (supabase.from("referrals") as any)
      .select("id, clicks")
      .eq("referral_code", code)
      .single();

    if (referral) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("referral_events") as any).insert({
        referral_code: code,
        event_type: "click",
        source: "link",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("referrals") as any)
        .update({ clicks: (referral.clicks || 0) + 1 })
        .eq("id", referral.id);
    }
  } catch { /* skip tracking errors */ }

  // Redirect to signup with referral code
  redirect(`/${locale}/signup?ref=${code}`);
}
