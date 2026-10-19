import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The VYRON mark: a white rounded square with a geometric V cut out of it.
 * High contrast at every size, legible at 16px, and impossible to mistake
 * for the old invisible white-on-white rectangle.
 */
export function BrandMark({
  size = 28,
  className,
  standalone = false,
}: {
  size?: number;
  className?: string;
  standalone?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role={standalone ? "img" : undefined}
      aria-label={standalone ? "VYRON" : undefined}
      aria-hidden={standalone ? undefined : true}
      focusable="false"
    >
      <rect width="32" height="32" rx="8.5" fill="currentColor" />
      <path
        d="M8.4 10.1 16 24.1l7.6-14"
        stroke="#050505"
        strokeWidth="3.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect x="24.4" y="7.6" width="1.6" height="1.6" fill="#050505" opacity="0.55" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[15px] font-semibold uppercase leading-none tracking-[0.26em] text-fg",
        className,
      )}
    >
      Vyron
    </span>
  );
}

export function Brand({
  href = "/",
  size = 28,
  wordmark = true,
  className,
}: {
  href?: string;
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="VYRON — home"
      className={cn(
        "group inline-flex items-center gap-2.5 text-white transition-opacity hover:opacity-85",
        className,
      )}
    >
      <BrandMark size={size} />
      {wordmark && <Wordmark />}
    </Link>
  );
}
