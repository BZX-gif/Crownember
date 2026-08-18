"use client";

import { useEffect, useRef, useState } from "react";

/**
 * EMBERCROWN Guard — client-side tamper deterrent.
 *
 * Blocks the usual "edit the page" tricks (right-click inspect, F12,
 * Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, image dragging) and detects when dev
 * tools are opened, at which point the page locks down with a breach
 * screen. Real enforcement (XP, messages, seats) always happens on the
 * server — this is the visible shield that tells snoops to walk away.
 */
export function SecurityGuard() {
  const [toast, setToast] = useState("");
  const [breach, setBreach] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutive = useRef(0);

  useEffect(() => {
    console.log(
      "%c⛔ EMBERCROWN PROTECTED ZONE",
      "color:#ff6a00;font-size:22px;font-weight:900;font-style:italic;",
    );
    console.log(
      "%cNice try 😏 Every message, XP point and seat is verified on the server.\nEditing code here changes nothing — but it does log a strike.",
      "color:#94a3b8;font-size:12px;",
    );
  }, []);

  useEffect(() => {
    function warn(message: string) {
      setToast(message);
      setStrikes((s) => s + 1);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 2200);
    }

    function onContextMenu(e: MouseEvent) {
      // DM bubbles own their long-press/right-click gesture. Do not let the
      // global anti-inspection guard turn a normal messaging interaction
      // into an inspection warning or text-copy flow.
      const target = e.target as HTMLElement | null;
      if (target?.closest(".dm-message-action-zone")) return;

      e.preventDefault();
      warn("🛡️ Nice try! Right-click inspect is locked down.");
    }

    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toUpperCase();
      const blocked =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(k)) ||
        (e.ctrlKey && ["U", "S"].includes(k));
      if (blocked) {
        e.preventDefault();
        warn("🛡️ Keyboard shortcuts are disabled in the arena.");
      }
    }

    function onDragStart(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "IMG") e.preventDefault();
    }

    const detector = setInterval(() => {
      const opened =
        window.outerWidth - window.innerWidth > 170 ||
        window.outerHeight - window.innerHeight > 170;
      if (opened) {
        consecutive.current += 1;
        if (consecutive.current >= 2) setBreach(true);
      } else {
        consecutive.current = 0;
      }
    }, 1000);

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      clearInterval(detector);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("dragstart", onDragStart);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  return (
    <>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 animate-floaty rounded-full border border-orange-500/50 bg-slate-950/95 px-5 py-2.5 text-sm font-bold text-orange-300 shadow-2xl shadow-orange-500/20">
          {toast}
        </div>
      )}

      {breach && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/97 p-4">
          <div className="pointer-events-none absolute inset-0 animate-pulse border-8 border-rose-500/40" />
          <div className="w-full max-w-md rounded-3xl border border-rose-500/50 bg-slate-900 p-8 text-center shadow-[0_0_80px_rgba(244,63,94,0.35)]">
            <p className="animate-pulse text-5xl">🚨</p>
            <h2 className="mt-3 text-2xl font-black italic tracking-tight text-rose-400">
              SECURITY BREACH DETECTED
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Developer tools are not allowed in the arena. This incident has
              been noted. All messages, XP and seats are verified on the
              server — tampering with the page changes nothing.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-xs text-slate-500">
              &gt; violation strikes logged:{" "}
              <span className="font-black text-rose-400">{strikes}</span>
              <br />
              &gt; session integrity: <span className="text-emerald-400">SERVER-VERIFIED ✓</span>
              <br />
              &gt; status: <span className="text-rose-400">LOCKDOWN</span>
            </div>
            <button
              onClick={() => {
                setBreach(false);
                consecutive.current = 0;
              }}
              className="mt-5 w-full rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-300 transition hover:bg-rose-500/20"
            >
              I come in peace — take me back 🏳️
            </button>
          </div>
        </div>
      )}
    </>
  );
}
