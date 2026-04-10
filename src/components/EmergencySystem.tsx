"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FALL_THRESHOLD = 30; // m/s² — typical phone drop is 20-40 m/s²
const FALL_CONFIRM_DELAY = 30000; // 30 seconds to respond before sending alert
const LOCATION_INTERVAL = 300000; // 5 minutes

interface EmergencyContact {
  name: string;
  phone: string;
}

export default function EmergencySystem() {
  const [userId, setUserId] = useState<string | null>(null);
  const [adventureMode, setAdventureMode] = useState(false);
  const [fallDetected, setFallDetected] = useState(false);
  const fallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Load user + adventure mode state
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        const saved = localStorage.getItem("dilo-adventure-mode");
        if (saved === "true") setAdventureMode(true);
      }
    });
  }, []);

  // ── LOCATION TRACKING (Adventure Mode) ──
  const saveLocation = useCallback(async () => {
    if (!userId || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        lastLocationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            altitude: pos.coords.altitude,
          }),
        }).catch(() => {});
      },
      () => {}, // Ignore errors
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [userId]);

  useEffect(() => {
    if (adventureMode && userId) {
      saveLocation(); // Initial
      locationIntervalRef.current = setInterval(saveLocation, LOCATION_INTERVAL);
    }
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current); };
  }, [adventureMode, userId, saveLocation]);

  // ── OFFLINE DETECTION (Adventure Mode → send emergency) ──
  useEffect(() => {
    if (!adventureMode || !userId) return;

    function handleOffline() {
      // Internet lost while in adventure mode — trigger emergency
      triggerEmergency("offline");
    }

    window.addEventListener("offline", handleOffline);
    return () => window.removeEventListener("offline", handleOffline);
  }, [adventureMode, userId]);

  // ── FALL DETECTION ──
  useEffect(() => {
    if (!userId) return;
    if (!("DeviceMotionEvent" in window)) return;

    function handleMotion(event: DeviceMotionEvent) {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const total = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);

      if (total > FALL_THRESHOLD && !fallDetected) {
        setFallDetected(true);
        // Start countdown — if user doesn't dismiss in 30s, send emergency
        fallTimerRef.current = setTimeout(() => {
          triggerEmergency("fall");
          setFallDetected(false);
        }, FALL_CONFIRM_DELAY);
      }
    }

    // Request permission on iOS 13+
    const DeviceMotionEventTyped = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DeviceMotionEventTyped.requestPermission) {
      DeviceMotionEventTyped.requestPermission().then((state: string) => {
        if (state === "granted") {
          window.addEventListener("devicemotion", handleMotion);
        }
      }).catch(() => {});
    } else {
      window.addEventListener("devicemotion", handleMotion);
    }

    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [userId, fallDetected]);

  // ── DISMISS FALL ──
  function dismissFall() {
    setFallDetected(false);
    if (fallTimerRef.current) {
      clearTimeout(fallTimerRef.current);
      fallTimerRef.current = null;
    }
  }

  // ── TRIGGER EMERGENCY ──
  async function triggerEmergency(reason: "fall" | "offline" | "manual") {
    if (!userId) return;

    // Get emergency contacts
    const res = await fetch(`/api/emergency?userId=${userId}`).catch(() => null);
    const data = res ? await res.json() : { contacts: [] };
    const contacts: EmergencyContact[] = data.contacts || [];

    if (contacts.length === 0) return;

    // Get location
    const loc = lastLocationRef.current;
    let locationText = "Ubicación no disponible";
    let mapsLink = "";

    if (loc) {
      mapsLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
      locationText = `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
    } else if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
        );
        mapsLink = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
        locationText = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
      } catch { /* skip */ }
    }

    const reasonText = reason === "fall" ? "Posible caída detectada" : reason === "offline" ? "Conexión perdida (Modo Aventura)" : "Botón de emergencia activado";
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const message = `🚨 URGENCIA DILO\n\n${reasonText}\n📍 ${locationText}\n${mapsLink ? `🗺️ ${mapsLink}\n` : ""}⏰ ${time}\n\nContactar inmediatamente.`;

    // Open SMS with pre-filled message for each contact
    const phones = contacts.map(c => c.phone).join(",");
    const smsUrl = `sms:${phones}?body=${encodeURIComponent(message)}`;

    // Try to open SMS app
    window.open(smsUrl, "_self");
  }

  // ── DILO URGENCIA BUTTON (hold 3 seconds) ──
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startHold() {
    setHolding(true);
    setHoldProgress(0);

    let progress = 0;
    holdIntervalRef.current = setInterval(() => {
      progress += 3.33;
      setHoldProgress(Math.min(100, progress));
    }, 100);

    holdTimerRef.current = setTimeout(() => {
      // 3 seconds held — trigger emergency
      setHolding(false);
      setHoldProgress(0);
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      triggerEmergency("manual");
      // Vibrate
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    }, 3000);
  }

  function endHold() {
    setHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
  }

  // ── TOGGLE ADVENTURE MODE ──
  function toggleAdventure() {
    const next = !adventureMode;
    setAdventureMode(next);
    localStorage.setItem("dilo-adventure-mode", String(next));
    if (next) saveLocation();
  }

  // Store functions globally so other components can access them
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__diloEmergency = {
      triggerEmergency,
      toggleAdventure: () => toggleAdventure(),
      isAdventureMode: () => adventureMode,
    };
  });

  return (
    <>
      {/* Fall detection overlay */}
      {fallDetected && (
        <div className="fixed inset-0 z-[9999] bg-red-900/95 flex flex-col items-center justify-center p-6 text-center animate-pulse">
          <p className="text-6xl mb-4">🚨</p>
          <h1 className="text-2xl font-bold text-white mb-2">¿Estás bien?</h1>
          <p className="text-white/80 mb-6">DILO detectó una posible caída. Si no respondes en 30 segundos, se enviará una alerta de emergencia.</p>
          <button
            onClick={dismissFall}
            className="px-8 py-4 bg-white text-red-900 rounded-2xl text-lg font-bold"
          >
            Estoy bien
          </button>
        </div>
      )}

      {/* DILO URGENCIA — only shows when actively holding (triggered from /emergency page) */}
      {holding && (
        <div className="fixed inset-0 z-[9998] bg-red-900/90 flex flex-col items-center justify-center p-6">
          <div className="relative w-32 h-32 mb-4">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <circle cx="22" cy="22" r="20" fill="none" stroke="white" strokeWidth="3"
                strokeDasharray={`${holdProgress * 1.26} 126`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-4xl">🚨</span>
          </div>
          <p className="text-white text-lg font-bold">Enviando alerta...</p>
          <p className="text-white/60 text-sm mt-1">Suelta para cancelar</p>
        </div>
      )}
    </>
  );
}
