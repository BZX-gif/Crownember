import Link from "next/link";
import { Wordmark } from "@/components/icons";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[0.07] bg-[#050505]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-3">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
            A global social platform. A feed worth reading, rooms worth
            joining, and conversations that respect your attention.
          </p>
        </div>
        <div>
          <p className="font-hud text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-400">
            Platform
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-zinc-500">
            <li><Link href="/forum" className="transition hover:text-white">The Feed</Link></li>
            <li><Link href="/chat" className="transition hover:text-white">Live Rooms</Link></li>
            <li><Link href="/messages" className="transition hover:text-white">Messages</Link></li>
            <li><Link href="/players" className="transition hover:text-white">Members</Link></li>
            <li><Link href="/notifications" className="transition hover:text-white">Inbox</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-hud text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-400">
            Principles
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-zinc-500">
            <li>Free forever — no ads, no tiers.</li>
            <li>Rooms self-destruct after 3 hours. The feed remembers.</li>
            <li>Your data is verified on the server, never the client.</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 border-t border-white/[0.05] py-5 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-3 py-1 font-hud text-[10px] font-bold uppercase tracking-widest text-emerald-500/70">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500/80" />
          Guard active — server-verified
        </span>
        <span className="font-hud text-[10px] uppercase tracking-widest text-zinc-700">
          © {new Date().getFullYear()} VYRON
        </span>
      </div>
    </footer>
  );
}
