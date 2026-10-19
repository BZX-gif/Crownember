"use client";

import { useEffect, useRef, useState } from "react";
import { cn, initials } from "@/lib/utils";
import { DevGlyph } from "@/components/icons";

/**
 * Avatar: initials are the identity; a photo is progressive enhancement.
 *
 * `avatarUrl` must only be provided when the member actually has a picture
 * (see `avatarUrlFor`). Historically this component fetched
 * `/api/profile/avatar` for every name, which produced a 404 and a broken-image
 * glyph for every member without a photo. When a URL is present and fails —
 * including a failure that happens before hydration attaches `onError` — the
 * initials remain and the image is removed.
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = avatarUrl && avatarUrl.length > 0 ? avatarUrl : null;
  // Failure is tracked per URL, so a new picture (after an upload) is attempted
  // without a state-resetting effect.
  const showImage = Boolean(src) && failedSrc !== src;

  // An SSR'd image can finish (and fail) before React hydrates, in which case
  // the onError handler never runs. Check once on mount and drop the element.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const check = () => {
      if (img.complete && img.naturalWidth === 0) setFailedSrc(src);
    };
    check();
    const frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [src]);

  return (
    <div
      className={cn("relative shrink-0", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${name}'s profile picture`}
    >
      <div
        className="relative flex select-none items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1c1c1f] font-medium text-fg"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, Math.round(size * 0.34)),
          letterSpacing: "0.02em",
        }}
        aria-hidden="true"
      >
        {/* Initials are painted by CSS so they stay decorative: the
            surrounding link or button owns the accessible name, and no
            screen reader announces a stray "MI" next to a username. */}
        <span className="avatar-initials" data-initials={initials(name)} aria-hidden="true" />
        {showImage && src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={src}
            alt=""
            width={size}
            height={size}
            loading={loading}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        )}
      </div>
      {dev && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-[#3a3a3f] bg-[#0a0a0b] text-white"
          title="VYRON builder"
          aria-label="VYRON builder"
        >
          <DevGlyph size={9} />
        </span>
      )}
    </div>
  );
}
