import webpush from "web-push";

// Strip base64 padding ("=") — web-push requires URL-safe base64 without padding
const VAPID_PUBLIC = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/=+$/, "");
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || "").replace(/=+$/, "");
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:hello@dilo.app";

try {
  if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_PUBLIC !== "placeholder" && VAPID_PRIVATE !== "placeholder") {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  }
} catch (err) {
  console.warn("[Push] VAPID setup failed, push notifications disabled:", err);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function sendPush(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    console.error("Push send failed:", err);
    return false;
  }
}

export async function sendPushBatch(
  subscriptions: PushSubscriptionData[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const ok = await sendPush(sub, payload);
      if (ok) sent++;
      else failed++;
    })
  );

  return { sent, failed };
}
