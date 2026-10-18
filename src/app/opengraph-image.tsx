import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Crownember — Free Fire Gaming Community";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Branded social-share card.
 *
 * Deliberately emoji-free: satori (the renderer behind ImageResponse) pulls an
 * emoji font from a public CDN at request time whenever a glyph needs one —
 * that makes previews fragile and leaks a third-party dependency. Pure
 * typography renders with the bundled font, offline, every time.
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
          padding: 70,
          background:
            "linear-gradient(135deg, #020617 0%, #0c1222 55%, #1c1005 100%)",
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
            letterSpacing: 8,
            color: "#fb923c",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              background: "#fb923c",
              display: "flex",
            }}
          />
          CROWNEMBER
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 72,
            fontWeight: 900,
            lineHeight: 1.05,
          }}
        >
          FREE FIRE COMMUNITY
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 30,
            color: "#cbd5e1",
          }}
        >
          Chat. Find squads. Build your profile. Compete with the community.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 22,
            color: "#64748b",
            letterSpacing: 3,
          }}
        >
          10 FOUNDING SEATS • FREE FOREVER • BUILT FOR PLAYERS
        </div>
      </div>
    ),
    size,
  );
}
