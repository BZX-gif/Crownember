"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  color,
  avatarUrl,
  size = 40,
  dev = false,
  className,
}: {
  name: string;
  color: string;
  avatarUrl?: string;
  size?: number;
  dev?: boolean;
  className?: string;
}) {
  const resolvedAvatarUrl = avatarUrl ?? `/api/profile/avatar?username=${encodeURIComponent(name)}`;
  const [showImage, setShowImage] = useState(true);

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "relative flex select-none items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2",
          dev ? "ring-emerald-400/60" : "ring-white/10",
        )}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(11, Math.round(size * 0.36)),
          background: `linear-gradient(135deg, ${color}, ${color}88)`,
        }}
      >
        {initials(name)}
        {showImage && (
          <img
            src={resolvedAvatarUrl}
            alt={`${name}'s profile picture`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setShowImage(false)}
          />
        )}
      </div>
      {dev && (
        <span
          className="ghost-badge absolute -bottom-1 -right-1.5 leading-none"
          style={{ fontSize: Math.max(11, Math.round(size * 0.48)) }}
          title="👻 Developer — the ghost in the machine"
        >
          👻
        </span>
      )}
    </div>
  );
}
