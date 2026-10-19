import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  BulbIcon,
  ChatIcon,
  CompassIcon,
  HashIcon,
  LockIcon,
  MegaphoneIcon,
  SmileIcon,
  SparkIcon,
  UsersIcon,
  type IconProps,
} from "@/components/icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-fg text-ink shadow-[0_1px_0_rgba(255,255,255,0.18)_inset] hover:bg-white active:bg-[#e7e7e9]",
  secondary:
    "border border-line bg-white/[0.035] text-fg hover:border-line-strong hover:bg-white/[0.065] active:bg-white/[0.045]",
  ghost: "text-muted hover:bg-white/[0.05] hover:text-fg active:bg-white/[0.03]",
  danger:
    "border border-danger/30 bg-danger/[0.06] text-danger hover:border-danger/50 hover:bg-danger/10 active:bg-danger/[0.08]",
};

/**
 * One height scale. `xs` is the smallest target used inline inside a list row;
 * it keeps a 28px visual height but compensates with a ::before hit area in
 * globals.css so it still meets a comfortable touch target on phones.
 */
const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs",
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
  icon: "h-9 w-9 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  loading = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  variant = "ghost",
  size = "icon",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
  size?: "icon" | "icon-sm";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "h-11 w-full rounded-lg border border-line bg-raised px-3.5 text-sm text-fg placeholder:text-subtle/70 transition-colors hover:border-line-strong/70 focus:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        inputClass,
        "nice-scroll h-auto min-h-28 resize-y py-3 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-baseline justify-between gap-3 text-xs font-medium text-muted"
      >
        <span>{label}</span>
        {optional && <span className="text-subtle">Optional</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-subtle">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Surface({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag className={cn("rounded-xl border border-line bg-panel", className)}>
      {children}
    </Tag>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  size = "default",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-5", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1
          className={cn(
            "display-title mt-2 text-fg",
            size === "compact" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function Chip({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "outline" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5",
        tone === "default" && "border border-line bg-white/[0.04] text-muted",
        tone === "outline" && "border border-line-strong text-fg",
        tone === "muted" && "text-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CategoryGlyph({ icon, size = 13 }: { icon: string; size?: number }) {
  const props: IconProps = { size };
  switch (icon) {
    case "bulb":
      return <BulbIcon {...props} />;
    case "users":
      return <UsersIcon {...props} />;
    case "spark":
      return <SparkIcon {...props} />;
    case "smile":
      return <SmileIcon {...props} />;
    case "megaphone":
      return <MegaphoneIcon {...props} />;
    default:
      return <ChatIcon {...props} />;
  }
}

export function CategoryChip({ icon, label }: { icon: string; label: string }) {
  return (
    <Chip>
      <CategoryGlyph icon={icon} />
      {label}
    </Chip>
  );
}

export function RoomGlyph({ icon, size = 18 }: { icon: string; size?: number }) {
  const props: IconProps = { size };
  switch (icon) {
    case "compass":
      return <CompassIcon {...props} />;
    case "lock":
      return <LockIcon {...props} />;
    case "hash":
      return <HashIcon {...props} />;
    default:
      return <ChatIcon {...props} />;
  }
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/[0.03] text-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({
  variant = "error",
  children,
  className,
}: {
  variant?: "error" | "success" | "info";
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed",
        variant === "error" && "border-danger/25 bg-danger/[0.06] text-danger",
        variant === "success" && "border-success/25 bg-success/[0.05] text-success",
        variant === "info" && "border-line bg-white/[0.03] text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function MetaDot() {
  return <span className="text-subtle" aria-hidden="true">·</span>;
}
