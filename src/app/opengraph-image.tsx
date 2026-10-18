import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "VYRON — Global Social Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Branded social-share card for VYRON.
 * Pure typography renders with the bundled font, offline, every time.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 70,
          background: "linear-gradient(135deg, #000 0%, #111 55%, #000 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 12,
            color: "#fff",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="#fff"/>
            <path d="M8 12h16M8 16h12M8 20h8" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="26" cy="6" r="4" fill="#000" opacity="0.15"/>
          </svg>
          VYRON
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 72,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: 4,
          }}
        >
          GLOBAL SOCIAL PLATFORM
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 30,
            color: "#a3a3a3",
            textAlign: "center",
            maxWidth: 800,
          }}
        >
          Share thoughts. Join conversations. Build your presence.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 20,
            color: "#737373",
            letterSpacing: 4,
          }}
        >
          LUXURY DESIGN · ZERO COMPROMISE · FREE FOREVER
        </div>
      </div>
    ),
    size,
  );
}