import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-black">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2"><svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="6" fill="currentColor"/><path d="M8 12h16M8 16h12M8 20h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="26" cy="6" r="4" fill="#fff" opacity="0.15"/></svg><span className="font-display text-xl uppercase tracking-wide">VYRON</span></div>
          <p className="mt-3 max-w-xs text-sm text-white/50">A premium global social platform. Share thoughts, join conversations, build your presence. Luxury design, zero compromise.</p>
        </div>
        <div><p className="text-sm font-bold uppercase tracking-wider text-white/60">Explore</p><ul className="mt-3 space-y-2 text-sm text-white/50"><li><Link href="/" className="hover:text-white transition-colors">Feed</Link></li><li><Link href="/forum" className="hover:text-white transition-colors">Forum</Link></li><li><Link href="/players" className="hover:text-white transition-colors">People</Link></li><li><Link href="/forum/new" className="hover:text-white transition-colors">New Post</Link></li></ul></div>
        <div><p className="text-sm font-bold uppercase tracking-wider text-white/60">Connect</p><p className="mt-3 text-sm text-white/50">Chat in real-time. Start discussions. Build your following. Earn recognition for quality contributions.</p><p className="mt-4 text-xs text-white/30">VYRON — Global Social Platform.</p></div>
      </div>
      <div className="flex flex-col items-center gap-1.5 border-t border-white/5 py-4 text-center text-xs text-white/30"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-bold text-white/50"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/30" />🛡️ VYRON Guard active — server-verified & rate-limited</span><span>© {new Date().getFullYear()} VYRON — Global Social Platform.</span></div>
    </footer>
  );
}