/**
 * Shared ICE server config for WebRTC (calls + walkie-talkie).
 *
 * STUN alone is not enough — many mobile carriers (4G/5G) use symmetric NAT,
 * which blocks direct peer-to-peer connections. A TURN relay fixes this.
 *
 * Defaults: OpenRelay by Metered.ca — free public TURN, no key required.
 *   https://www.metered.ca/tools/openrelay/
 *
 * Override with env vars if you have your own TURN:
 *   NEXT_PUBLIC_TURN_URL        turn:your-turn.example.com:3478
 *   NEXT_PUBLIC_TURN_USER       username
 *   NEXT_PUBLIC_TURN_PASS       credential
 */

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const customUrl = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_TURN_URL : undefined;
  if (customUrl) {
    servers.push({
      urls: customUrl,
      username: process.env?.NEXT_PUBLIC_TURN_USER || "",
      credential: process.env?.NEXT_PUBLIC_TURN_PASS || "",
    });
    return servers;
  }

  // Free public TURN fallback. These are shared pools — fine for low volume,
  // switch to a dedicated provider (Twilio, Metered paid, coturn) when scaling.
  servers.push(
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turns:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  );

  return servers;
}
