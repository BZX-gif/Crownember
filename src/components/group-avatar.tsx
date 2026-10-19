"use client";

import { useEffect, useRef, useState } from "react";
import { cn, groupPictureUrl, initials } from "@/lib/utils";

/**
 * Group picture. A group's identity is its name; the picture is progressive
 * enhancement, exactly like a member avatar.
 *
 * `pictureUrl` must only be passed when the group actually has a picture, and
 * it is served by a members-only route — if the request fails (signed out in
 * another tab, picture removed, bytes rejected) the initials tile remains.
 */
export function GroupAvatar({
  name,
  pictureUrl,
  size = 44,
  className,
  square = false,
  decorative = true,
}: {
  name: string;
  pictureUrl?: string;
  size?: number;
  className?: string;
  /** Groups use a rounded square so they never read as a person. */
  square?: boolean;
  decorative?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = pictureUrl && pictureUrl.length > 0 ? pictureUrl : null;
  const showImage = Boolean(src) && failedSrc !== src;

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
      aria-label={decorative ? undefined : `${name} group picture`}
      style={{ width: size, height: size }}
    >
      <div
        className={cn(
          "relative flex h-full w-full select-none items-center justify-center overflow-hidden border border-white/10 bg-[#1c1c1f] font-medium text-fg",
          square ? "rounded-xl" : "rounded-full",
        )}
        style={{ fontSize: Math.max(10, Math.round(size * 0.34)), letterSpacing: "0.02em" }}
        aria-hidden="true"
      >
        <span className="avatar-initials" data-initials={initials(name)} aria-hidden="true" />
        {showImage && src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={src}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        )}
      </div>
    </div>
  );
}

/** Re-exported for client callers; Server Components import from `@/lib/utils`. */
export { groupPictureUrl };
