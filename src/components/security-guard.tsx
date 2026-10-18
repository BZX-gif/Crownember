"use client";

import { useEffect } from "react";

/**
 * Crownember Guard — honest client-side hygiene, not a false promise.
 *
 * What it does:
 * - Signs the console for anyone poking around (fun, harmless).
 * - Stops images from being drag-dropped out of the page.
 *
 * What it deliberately does NOT do:
 * - Block right-click, F12, Ctrl+S/U or "detect" devtools. Those tricks
 *   never stopped anyone technical, they break real browser features
 *   (open-link-in-new-tab, save, zoom, screen readers), and window-size
 *   "detection" false-positives on phones and split screens.
 * - Claim incidents are logged. Nothing here is logged, and pretending
 *   otherwise would be a lie.
 *
 * The real shield is server-side: every message, XP point, seat and Vault
 * unlock is verified on the server. Editing the page changes nothing.
 */
export function SecurityGuard() {
  useEffect(() => {
    console.log(
      "%c👑 CROWNEMBER",
      "color:#ff6a00;font-size:22px;font-weight:900;font-style:italic;",
    );
    console.log(
      "%cEvery message, XP point and seat is verified on the server.\nEditing code here changes nothing — have fun exploring.",
      "color:#94a3b8;font-size:12px;",
    );
  }, []);

  useEffect(() => {
    function onDragStart(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "IMG") e.preventDefault();
    }
    document.addEventListener("dragstart", onDragStart);
    return () => document.removeEventListener("dragstart", onDragStart);
  }, []);

  return null;
}
