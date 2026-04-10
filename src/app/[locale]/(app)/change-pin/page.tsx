"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { Lock, Check, ArrowLeft } from "lucide-react";

export default function ChangePinPage() {
  const t = useTranslations("changePin");
  const router = useRouter();
  const [step, setStep] = useState<"current" | "create" | "confirm">("current");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = useState(["", "", "", ""]);
  const [newPin, setNewPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");

  const currentRefs = useRef<(HTMLInputElement | null)[]>([]);
  const newRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");
      setUserId(user.id);

      // Check if user has a PIN set
      const controller = new AbortController();
      fetch("/api/auth/pin/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
        signal: AbortSignal.timeout(10000),
      })
        .then(r => r.json())
        .then(d => {
          setHasPin(d.hasPin);
          if (!d.hasPin) setStep("create");
        })
        .catch(() => {
          // If status endpoint fails, assume no PIN and let them set one
          setHasPin(false);
          setStep("create");
        });

      return () => controller.abort();
    });
  }, [router]);

  useEffect(() => {
    if (hasPin === null) return;
    if (step === "current") currentRefs.current[0]?.focus();
    if (step === "create") newRefs.current[0]?.focus();
    if (step === "confirm") confirmRefs.current[0]?.focus();
  }, [step, hasPin]);

  function handleChange(index: number, value: string, field: "current" | "new" | "confirm") {
    if (!/^\d*$/.test(value)) return;
    const setters = { current: setCurrentPin, new: setNewPin, confirm: setConfirmPin };
    const states = { current: currentPin, new: newPin, confirm: confirmPin };
    const refs = { current: currentRefs, new: newRefs, confirm: confirmRefs };

    const arr = [...states[field]];
    arr[index] = value.slice(-1);
    setters[field](arr);
    setError("");

    if (value && index < 3) {
      refs[field].current[index + 1]?.focus();
    }

    // Auto-advance when all 4 digits entered
    if (value && index === 3 && arr.every(d => d)) {
      if (field === "current") {
        verifyCurrentPin(arr);
      } else if (field === "new") {
        setStep("confirm");
        setTimeout(() => confirmRefs.current[0]?.focus(), 50);
      } else if (field === "confirm") {
        submitNewPin(newPin, arr);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent, field: "current" | "new" | "confirm") {
    const states = { current: currentPin, new: newPin, confirm: confirmPin };
    const refs = { current: currentRefs, new: newRefs, confirm: confirmRefs };
    if (e.key === "Backspace" && !states[field][index] && index > 0) {
      refs[field].current[index - 1]?.focus();
    }
  }

  async function verifyCurrentPin(pinArr: string[]) {
    const code = pinArr.join("");
    setError("");
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: userEmail, pin: code }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        setError(t("wrongPin"));
        setCurrentPin(["", "", "", ""]);
        currentRefs.current[0]?.focus();
        return;
      }
      setStep("create");
      setTimeout(() => newRefs.current[0]?.focus(), 50);
    } catch {
      setError(t("error"));
      setCurrentPin(["", "", "", ""]);
      currentRefs.current[0]?.focus();
    }
  }

  async function submitNewPin(pinArr: string[], confirmArr: string[]) {
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
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", userId, email: userEmail, pin: pinCode }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("error"));
        setSaving(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/settings"), 1500);
    } catch {
      setError(t("error"));
      setSaving(false);
    }
  }

  function renderPinBoxes(values: string[], field: "current" | "new" | "confirm") {
    const refs = { current: currentRefs, new: newRefs, confirm: confirmRefs };
    return (
      <div className="flex justify-center gap-3">
        {values.map((digit, i) => (
          <input
            key={i}
            ref={el => { refs[field].current[i] = el; }}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(i, e.target.value, field)}
            onKeyDown={e => handleKeyDown(i, e, field)}
            className={`w-14 h-14 text-center text-xl font-bold rounded-2xl border-2 bg-[var(--bg2)] focus:outline-none transition-all ${
              digit ? "border-white/30 text-white" : "border-[var(--border)] text-[var(--dim)]"
            } focus:border-white/50`}
          />
        ))}
      </div>
    );
  }

  if (hasPin === null) {
    return (
      <main className="flex items-center justify-center min-h-dvh">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex items-center justify-center min-h-dvh px-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 mb-4">
            <Check size={28} className="text-green-400" />
          </div>
          <p className="text-sm text-green-400">{t("saved")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        {/* Back button */}
        <button onClick={() => router.push("/settings")} className="flex items-center gap-1 text-[var(--dim)] text-sm mb-8">
          <ArrowLeft size={16} />
          <span>{t("back")}</span>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] mb-4">
            <Lock size={24} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold">
            {hasPin ? t("titleChange") : t("titleSetup")}
          </h1>
          <p className="text-[var(--dim)] text-xs mt-1">
            {hasPin ? t("subtitleChange") : t("subtitleSetup")}
          </p>
        </div>

        {error && <p className="text-red-400 text-xs text-center mb-4">{error}</p>}

        <div className="space-y-6">
          {/* Step 1: Verify current PIN (only if user has one) */}
          {step === "current" && hasPin && (
            <div>
              <div className="flex items-center justify-center gap-1 mb-3">
                <span className="text-xs text-[var(--dim)]">{t("currentPin")}</span>
              </div>
              {renderPinBoxes(currentPin, "current")}
            </div>
          )}

          {/* Step 2: New PIN */}
          {step === "create" && (
            <div>
              <div className="flex items-center justify-center gap-1 mb-3">
                <span className="text-xs text-[var(--dim)]">{t("newPin")}</span>
              </div>
              {renderPinBoxes(newPin, "new")}
            </div>
          )}

          {/* Step 3: Confirm new PIN */}
          {step === "confirm" && (
            <div>
              <div className="flex items-center justify-center gap-1 mb-3">
                <span className="text-xs text-[var(--dim)]">
                  <span className="flex items-center gap-1">
                    <Check size={12} className="text-green-400" /> {t("newPin")}
                  </span>
                </span>
              </div>
              {renderPinBoxes(newPin, "new")}
              <div className="mt-6">
                <div className="flex items-center justify-center gap-1 mb-3">
                  <span className="text-xs text-[var(--dim)]">{t("confirmPin")}</span>
                </div>
                {renderPinBoxes(confirmPin, "confirm")}
              </div>
            </div>
          )}

          {saving && (
            <p className="text-center text-xs text-[var(--dim)]">{t("saving")}</p>
          )}
        </div>
      </div>
    </main>
  );
}
