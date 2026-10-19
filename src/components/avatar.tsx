"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";
import { DevGlyph } from "@/components/icons";

/**
 * Avatar: initials are always painted first, the photo is progressive
 * enhancement. The <img> only exists when a URL is known, uses native lazy
 * loading and falls back silently to the initials if the request 404s.
 *
 * The legacy `color` prop is accepted for call-site compatibility but is
 * intentionally ignored — VYRON identities are neutral graphite, never a
 * random hue.
 */
export function Avatar({
  name,
  avatarUrl,
  size = 40,
  dev = false,
  className,
  decorative = true,
  loading = "lazy",
}: {
  name: string;
  color?: string;
  avatarUrl?: string;
  size?: number;
  dev?: boolean;
  className?: string;
  decorative?: boolean;
  loading?: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState(false);
  const src =
    avatarUrl === ""
      ? null
      : avatarUrl ?? `/api/profile/avatar?username=${encodeURIComponent(name)}`;
  const showImage = !failed && src !== null;

  return (
    <div
      className={cn("relative shrink-0", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${name}'s profile picture`}
    >
      <div
        className="relative flex select-none items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#232326] font-medium text-fg"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, Math.round(size * 0.34)),
          letterSpacing: "0.02em",
        }}
        aria-hidden="true"
      >
        <span>{initials(name)}</span>
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={size}
            height={size}
            loading={loading}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {dev && (
        <span
          className="absolute -bottom-1 -right-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-[#3a3a3f] bg-[#0a0a0b] text-white"
          title="VYRON builder"
          aria-label="VYRON builder"
        >
          <DevGlyph size={9} />
        </span>
      )}
    </div>
  );
}
