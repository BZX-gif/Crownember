"use client";

import { useEffect } from "react";

/**
 * VYRON Guard — honest client-side hygiene, not a false promise.
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
 * The real shield is server-side: every post, reaction, XP point and Vault
 * unlock is verified on the server. Editing the page changes nothing.
 */
export function SecurityGuard() {
  useEffect(() => {
    console.log(
      "%cVYRON",
      "color:#f5f5f5;font-size:22px;font-weight:900;letter-spacing:0.3em;",
    );
    console.log(
      "%cEvery post, reaction and XP point is verified on the server.\nEditing code here changes nothing — have fun exploring.",
      "color:#8f8f8f;font-size:12px;",
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
