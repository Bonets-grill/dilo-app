"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function PushSetup() {
  useEffect(() => {
    registerPush();
  }, []);

  async function registerPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    try {
      // Ask for permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      // Get service worker registration
      const reg = await navigator.serviceWorker.ready;

      // Subscribe to push
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey || vapidKey === "placeholder") return;

      // Unsubscribe old subscription if VAPID key changed, then re-subscribe
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Save subscription to DB
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const subJson = sub.toJSON();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("push_subscriptions") as any).upsert({
        user_id: user.id,
        endpoint: subJson.endpoint!,
        keys: subJson.keys,
        user_agent: navigator.userAgent,
      }, { onConflict: "endpoint" });

      console.log("[Push] Subscription saved");
    } catch (e) {
      console.error("[Push] Registration failed:", e);
    }
  }

  return null; // Invisible component
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
