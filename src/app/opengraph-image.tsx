import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "VYRON — The Global Social Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Branded social-share card.
 *
 * Deliberately emoji-free: satori (the renderer behind ImageResponse) pulls an
 * emoji font from a public CDN at request time whenever a glyph needs one —
 * that makes previews fragile and leaks a third-party dependency. Pure
 * geometry + typography renders with the bundled font, offline, every time.
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
          padding: 80,
          background: "#050505",
          color: "#f5f5f5",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 80,
            right: 80,
            height: 1,
            background: "rgba(245,245,245,0.25)",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* the V mark, drawn as geometry */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "26px solid transparent",
                borderRight: "26px solid transparent",
                borderTop: "44px solid #050505",
                marginTop: 6,
                display: "flex",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              letterSpacing: 14,
              display: "flex",
            }}
          >
            VYRON
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 34,
            lineHeight: 1.4,
            color: "#a1a1aa",
            maxWidth: 880,
          }}
        >
          The social platform for people who value the conversation.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 52,
            fontSize: 20,
            letterSpacing: 5,
            color: "#52525b",
            textTransform: "uppercase",
          }}
        >
          The feed · Live rooms · The Vault · Free forever
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 80,
            right: 80,
            height: 1,
            background: "rgba(245,245,245,0.25)",
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}
