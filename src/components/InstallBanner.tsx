"use client";

import { useState, useEffect } from "react";
import { X, Share, Plus } from "lucide-react";

/**
 * PWA Install Banner — shows on first visit if not installed
 * iOS: tells user to use Share → Add to Home Screen
 * Android: triggers native install prompt
 */
export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((navigator as any).standalone) return;

    // Don't show if dismissed recently (7 days)
    const dismissed = localStorage.getItem("dilo_install_dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86400000) return;

    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Android: listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: show manual instructions after 3 seconds
    if (ios) {
      setTimeout(() => setShow(true), 3000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem("dilo_install_dismissed", String(Date.now()));
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-16 left-3 right-3 z-50 animate-in slide-in-from-bottom">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xl">
        <button onClick={dismiss} className="absolute top-3 right-3 text-[var(--dim)]">
          <X size={16} />
        </button>

        <p className="text-sm font-semibold mb-1">Instala DILO en tu móvil</p>

        {isIOS ? (
          <div className="text-xs text-[var(--muted)] space-y-1.5">
            <p>Para recibir notificaciones y acceso rápido:</p>
            <p className="flex items-center gap-1.5">
              1. Toca <Share size={14} className="text-blue-400 inline" /> <span className="text-white">(Compartir)</span> abajo
            </p>
            <p className="flex items-center gap-1.5">
              2. Selecciona <Plus size={14} className="text-white inline" /> <span className="text-white">"Añadir a pantalla de inicio"</span>
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-[var(--muted)] mb-2">
              Acceso rápido + notificaciones push
            </p>
            <button onClick={install} className="w-full py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium">
              Instalar DILO
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
