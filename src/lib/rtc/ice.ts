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

  const user = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_TURN_USER : undefined;
  const pass = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_TURN_PASS : undefined;
  const url = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_TURN_URL : undefined;

  // Custom TURN configured (Metered paid / coturn / etc.). If the URL is a
  // bare `turn:<host>` without a port, fan out to the 4 standard variants
  // (UDP 80, UDP 443, TCP 443, TLS 443) for maximum NAT / firewall traversal.
  // If the URL includes a port, use as-is.
  if (user && pass && url) {
    const bare = /^turns?:[^:]+$/.test(url);
    if (bare) {
      const host = url.replace(/^turns?:/, "");
      const stunHost = host.replace(/^standard\./, "stun.");
      servers.push(
        { urls: `stun:${stunHost}:80` },
        { urls: `turn:${host}:80`, username: user, credential: pass },
        { urls: `turn:${host}:80?transport=tcp`, username: user, credential: pass },
        { urls: `turn:${host}:443`, username: user, credential: pass },
        { urls: `turns:${host}:443?transport=tcp`, username: user, credential: pass }
      );
    } else {
      servers.push({ urls: url, username: user, credential: pass });
    }
    return servers;
  }

  // Free public TURN fallback (OpenRelay by Metered). Shared pool — fine for
  // low-volume dev, switch to dedicated (NEXT_PUBLIC_TURN_URL above) in prod.
  servers.push(
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turns:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  );

  return servers;
}
