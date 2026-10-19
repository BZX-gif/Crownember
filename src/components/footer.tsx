import Link from "next/link";
import { Brand } from "@/components/brand";

const EXPLORE = [
  { href: "/", label: "Feed" },
  { href: "/forum", label: "Forum" },
  { href: "/chat", label: "Rooms" },
  { href: "/messages", label: "Messages" },
  { href: "/players", label: "People" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="page-shell grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Brand size={28} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            A global social platform for conversations worth returning to.
            Thoughtful posts, ephemeral rooms, and people you actually want to
            know.
          </p>
          <p className="mono-meta mt-5">Built without advertising. Free to join.</p>
        </div>

        <div>
          <p className="eyebrow">Explore</p>
          <ul className="mt-4 space-y-2.5">
            {EXPLORE.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-muted transition-colors hover:text-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow">Principles</p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            <li>Real people, real conversations.</li>
            <li>No invented activity or engagement.</li>
            <li>Privacy and moderation by default.</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="page-shell flex flex-col items-center justify-between gap-2 py-5 text-center sm:flex-row sm:text-left">
          <p className="mono-meta">
            © {new Date().getFullYear()} VYRON · Global social platform
          </p>
          <p className="mono-meta">Server-verified actions · Rate-limited by design</p>
        </div>
      </div>
    </footer>
  );
}
