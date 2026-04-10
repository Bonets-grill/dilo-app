"use client";

import { useTranslations } from "next-intl";
import { useState, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { Lock, Check } from "lucide-react";

export default function PinSetupPage() {
  const t = useTranslations("pinSetup");
  const router = useRouter();
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handlePinChange(index: number, value: string, isConfirm: boolean) {
    if (!/^\d*$/.test(value)) return;
    const current = isConfirm ? [...confirmPin] : [...pin];
    current[index] = value.slice(-1);
    if (isConfirm) {
      setConfirmPin(current);
    } else {
      setPin(current);
    }
    setError("");

    const refs = isConfirm ? confirmRefs : pinRefs;
    if (value && index < 3) {
      refs.current[index + 1]?.focus();
    }

    // When all 4 digits are entered in create step, auto-move to confirm
    if (!isConfirm && value && index === 3 && current.every(d => d)) {
      setStep("confirm");
      setTimeout(() => confirmRefs.current[0]?.focus(), 50);
    }

    // When all 4 digits entered in confirm step, auto-submit
    if (isConfirm && value && index === 3 && current.every(d => d)) {
      submitPin(pin, current);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent, isConfirm: boolean) {
    const current = isConfirm ? confirmPin : pin;
    const refs = isConfirm ? confirmRefs : pinRefs;
    if (e.key === "Backspace" && !current[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  async function submitPin(pinArr: string[], confirmArr: string[]) {
    const pinCode = pinArr.join("");
    const confirmCode = confirmArr.join("");

    if (pinCode !== confirmCode) {
      setError(t("mismatch"));
      setConfirmPin(["", "", "", ""]);
      confirmRefs.current[0]?.focus();
      return;
    }

    setSaving(true);
    setError("");

    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not logged in");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          userId: user.id,
          email: user.email,
          pin: pinCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
        setSaving(false);
        return;
      }

      router.push("/chat");
    } catch {
      setError("Error");
      setSaving(false);
    }
  }

  function renderPinBoxes(values: string[], isConfirm: boolean) {
    const refs = isConfirm ? confirmRefs : pinRefs;
    return (
      <div className="flex justify-center gap-3">
        {values.map((digit, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el; }}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handlePinChange(i, e.target.value, isConfirm)}
            onKeyDown={e => handleKeyDown(i, e, isConfirm)}
            className={`w-14 h-14 text-center text-xl font-bold rounded-2xl border-2 bg-[var(--bg2)] focus:outline-none transition-all ${
              digit ? "border-white/30 text-white" : "border-[var(--border)] text-[var(--dim)]"
            } focus:border-white/50`}
          />
        ))}
      </div>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] mb-4">
            <Lock size={24} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-[var(--dim)] text-xs mt-1">{t("subtitle")}</p>
        </div>

        {error && <p className="text-red-400 text-xs text-center mb-4">{error}</p>}

        {/* Create PIN */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-center gap-1 mb-3">
              <span className="text-xs text-[var(--dim)]">
                {step === "create" ? "PIN" : (
                  <span className="flex items-center gap-1">
                    <Check size={12} className="text-green-400" /> PIN
                  </span>
                )}
              </span>
            </div>
            {renderPinBoxes(pin, false)}
          </div>

          {/* Confirm PIN */}
          {step === "confirm" && (
            <div>
              <div className="flex items-center justify-center gap-1 mb-3">
                <span className="text-xs text-[var(--dim)]">{t("confirm")}</span>
              </div>
              {renderPinBoxes(confirmPin, true)}
            </div>
          )}

          {saving && (
            <p className="text-center text-xs text-[var(--dim)]">{t("saving")}</p>
          )}
        </div>

        {/* Skip */}
        <button
          onClick={() => router.push("/chat")}
          className="w-full text-center text-xs text-[var(--dim)] mt-8 py-2"
        >
          {t("skip")}
        </button>
      </div>
    </main>
  );
}
