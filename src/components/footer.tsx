import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-slate-950">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👑</span>
            <span className="font-display text-xl uppercase tracking-wide">
              Ember<span className="text-fire">Crown</span>
            </span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-slate-400">
            The home base of Free Fire players. Chat, squad up, share tips and
            climb the ranks. Launching with only{" "}
            <span className="font-bold text-amber-300">10 founding seats</span> —
            100% free, forever.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Community
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>
              <Link href="/chat" className="hover:text-orange-400">
                Live Chat Rooms
              </Link>
            </li>
            <li>
              <Link href="/forum" className="hover:text-orange-400">
                Forum
              </Link>
            </li>
            <li>
              <Link href="/players" className="hover:text-orange-400">
                Leaderboards
              </Link>
            </li>
            <li>
              <Link href="/forum/new" className="hover:text-orange-400">
                Start a Topic
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Rank Up
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Chat +5 XP · Topic +10 XP · Reply +5 XP · Like received +2 XP.
            Climb from 🥉 Bronze to 👑 Grandmaster.
          </p>
          <p className="mt-4 text-xs text-slate-600">
            EMBERCROWN is a fan-made community. Not affiliated with Garena or Free
            Fire.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5 border-t border-white/5 py-4 text-center text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 font-bold text-emerald-500/80">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          🛡️ EMBERCROWN Guard active — tamper-protected &amp; rate-limited
        </span>
        <span>© {new Date().getFullYear()} EMBERCROWN — Talk. Squad. BOOYAH! 🔥</span>
      </div>
    </footer>
  );
}
