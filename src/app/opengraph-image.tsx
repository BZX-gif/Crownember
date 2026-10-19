import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "VYRON — conversations worth returning to";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 76,
          background: "#050505",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
          border: "1px solid #232327",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8.5" fill="#ffffff" />
            <path
              d="M8.4 10.1 16 24.1l7.6-14"
              stroke="#050505"
              strokeWidth="3.5"
              strokeLinecap="square"
              strokeLinejoin="miter"
              fill="none"
            />
          </svg>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 11,
              textTransform: "uppercase",
            }}
          >
            VYRON
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22, color: "#7c7c86", letterSpacing: 2 }}>
            A SOCIAL PLATFORM
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 78,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Conversations worth returning to.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 19,
            color: "#a1a1aa",
            borderTop: "1px solid #232327",
            paddingTop: 26,
          }}
        >
          <span>Forum · Rooms · Messages</span>
          <span style={{ color: "#7c7c86" }}>crownember.vercel.app</span>
        </div>
      </div>
    ),
    size,
  );
}
