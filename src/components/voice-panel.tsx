"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { KeyIcon, MicIcon } from "@/components/icons";
import { avatarUrlFor, cn } from "@/lib/utils";

interface VoiceNote {
  id: number;
  durationMs: number;
  createdAt: string;
  author: { username: string; avatarColor: string };
}

const MAX_REC_MS = 25_000;

interface MicIssue {
  title: string;
  steps: string[];
  debug?: string;
}

const IN_APP_BROWSER =
  /Instagram|FBAN|FBAV|WhatsApp|TelegramApp|Line\/|KAKAOTALK|Twitter|Snapchat|Pinterest/i;

function isInAppBrowser(): boolean {
  return (
    typeof navigator !== "undefined" && IN_APP_BROWSER.test(navigator.userAgent)
  );
}

/** Turn a raw mic failure into exact, human instructions. */
function classifyMicError(err: unknown): MicIssue {
  const name = (err as { name?: string } | null)?.name ?? "";
  const rawMsg = (err as { message?: string } | null)?.message ?? "";
  const debug = name ? `${name}${rawMsg ? `: ${rawMsg}` : ""}` : undefined;

  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      title: "Microphones need a secure (https) link",
      steps: [
        "Copy the site address and open the https:// version in your browser.",
        "Browsers never allow the mic over plain http — that's a browser rule, not a bug.",
      ],
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      title: "No microphone found on this device",
      steps: [
        "Plug in earphones with a mic, or try another phone.",
        "Some browsers on tablets disable mic access completely.",
      ],
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      title: "Your mic is busy in another app",
      steps: [
        "Close voice/video apps using the mic (calls, games with voice chat).",
        "Then tap Try again below.",
      ],
    };
  }
  // NotAllowedError — permission denied OR blocked context (in-app browser / iframe)
  if (isInAppBrowser()) {
    return {
      title: "In-app browsers block the microphone",
      steps: [
        "Tap ⋯ or ⋮ in the top corner of this screen.",
        "Choose “Open in Chrome” / “Open in Safari”.",
        "Try 🎙️ talk again there — it will work.",
      ],
      debug,
    };
  }
  if (typeof window !== "undefined" && window.parent !== window) {
    return {
      title: "This page is embedded — mic is blocked by the frame",
      steps: [
        "Copy the link from the address bar.",
        "Paste it directly into Chrome or Safari and open it.",
        "Then tap 🎙️ talk again.",
      ],
      debug,
    };
  }
  return {
    title: "Microphone permission was denied",
    steps: [
      "Tap the 🔒 or 🎙️ icon next to the address bar.",
      "Switch Microphone to Allow.",
      "Reload this page and tap 🎙️ talk again.",
    ],
    debug,
  };
}

function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "";
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Compact single-row voice deck: record button · scrolling note chips ·
 * founder key control. Built to stay out of the way — messages are the
 * main stage in The Vault.
 */
export function VoicePanel({
  isFounder,
  myName,
}: {
  isFounder: boolean;
  myName: string;
}) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [micError, setMicError] = useState<MicIssue | null>(null);
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [keyCurrent, setKeyCurrent] = useState("");
  const [keyNext, setKeyNext] = useState("");
  const [keyMsg, setKeyMsg] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ---- leave beacon: the instant anyone exits, every voice note burns ----
  const burnOnLeave = useCallback(() => {
    try {
      navigator.sendBeacon("/api/chat/vault/leave");
    } catch {
      void fetch("/api/chat/vault/leave", { method: "POST", keepalive: true });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("beforeunload", burnOnLeave);
    return () => {
      window.removeEventListener("beforeunload", burnOnLeave);
      burnOnLeave(); // route change / unmount
    };
  }, [burnOnLeave]);

  // ---- poll the note list ----
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/chat/vault/voice", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setNotes(data.notes ?? []);
      } catch {
        /* ignore */
      }
    }
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = "";
    };
  }, []);

  // ---- recording ----
  async function startRecording() {
    setMicError(null);
    if (recording || sending) return;

    // Fail fast with exact guidance before the browser even gets asked
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setMicError(classifyMicError(null));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError({
        title: "This browser can't record audio",
        steps: [
          "Update your browser, or open this site in Chrome / Safari.",
          "You can still type messages — nothing else is blocked.",
        ],
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Math.min(MAX_REC_MS, Date.now() - recStartRef.current);
        const blob = new Blob(chunksRef.current, {
          type: mime || "audio/webm",
        });
        setSending(true);
        try {
          const base64 = toBase64(await blob.arrayBuffer());
          const res = await fetch("/api/chat/vault/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio: base64,
              mime: (mime || "audio/webm").split(";")[0],
              durationMs: duration,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setMicError({
              title: data.error ?? "Voice note failed to send",
              steps: ["Check your internet connection and try again."],
            });
          } else {
            setSentFlash(true);
            setTimeout(() => setSentFlash(false), 1500);
          }
        } catch {
          setMicError({
            title: "Network error while sending",
            steps: ["Check your internet connection and try again."],
          });
        } finally {
          setSending(false);
        }
      };
      recorderRef.current = rec;
      streamRef.current = stream;
      recStartRef.current = Date.now();
      rec.start();
      setRecording(true);
      setRecSec(0);
      recTimerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - recStartRef.current) / 1000);
        setRecSec(s);
        if (Date.now() - recStartRef.current >= MAX_REC_MS) stopRecording();
      }, 250);
    } catch (err) {
      setMicError(classifyMicError(err));
    }
  }

  function stopRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  // ---- playback ----
  async function play(note: VoiceNote) {
    if (playingId === note.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/chat/vault/voice/${note.id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        return; // already burned
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlayingId(null);
      };
      setPlayingId(note.id);
      await audio.play();
    } catch {
      /* ignore */
    }
  }

  // ---- founder key rotation ----
  async function rotateKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyMsg("");
    try {
      const res = await fetch("/api/chat/vault/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: keyCurrent, next: keyNext }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeyMsg(data.error ?? "Could not rotate key.");
        return;
      }
      setKeyCurrent("");
      setKeyNext("");
      if (data.relocked) {
        // Rotation revokes every vault token — including yours. That's the
        // guarantee: nobody keeps access on the old key.
        setKeyMsg("Key rotated. Every member must unlock again with the new key — starting with you…");
        setTimeout(() => window.location.reload(), 1800);
        return;
      }
      setKeyMsg("Key rotated.");
    } catch {
      setKeyMsg("Network error.");
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-panel/50">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2 sm:px-4">
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            title="Stop and send"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/15"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
            Stop · {recSec}s
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={sending || sentFlash}
            title="Record a voice note (max 25s, burns when anyone leaves)"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-white/[0.04] px-2.5 text-[11px] text-fg transition-colors hover:border-line-strong disabled:opacity-40"
          >
            <MicIcon size={13} />
            {sending ? "Sending…" : sentFlash ? "Sent" : "Voice note"}
          </button>
        )}

        <div className="nice-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {notes.length === 0 && !recording && (
            <span className="whitespace-nowrap text-[11px] text-subtle">
              Voice notes are ephemeral. Nothing is archived.
            </span>
          )}
          {notes.map((n) => {
            const active = playingId === n.id;
            return (
              <button
                type="button"
                key={n.id}
                onClick={() => play(n)}
                title={`${n.author.username} · play voice note`}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 transition-colors",
                  active
                    ? "border-line-strong bg-white/[0.08] text-fg"
                    : "border-line bg-white/[0.02] text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <Avatar name={n.author.username} size={18} avatarUrl={avatarUrlFor(n.author)} />
                <span className="flex h-3 items-end gap-px" aria-hidden="true">
                  {[0, 1, 2].map((b) => (
                    <span
                      key={b}
                      className={cn("w-px bg-current", active && "animate-pulse")}
                      style={{ height: `${4 + ((b * 4 + n.id * 3) % 8)}px` }}
                    />
                  ))}
                </span>
                <span className="text-[11px] tabular-nums">
                  {Math.max(1, Math.round(n.durationMs / 1000))}s
                </span>
              </button>
            );
          })}
        </div>

        {isFounder && (
          <button
            type="button"
            onClick={() => setShowKeys((s) => !s)}
            title="Rotate the Vault passcode"
            aria-label="Rotate the Vault passcode"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <KeyIcon size={13} />
          </button>
        )}
      </div>

      {micError && (
        <div className="mx-3 mb-2 rounded-lg border border-line bg-ink p-3 sm:mx-4">
          <div className="flex items-start gap-2.5">
            <MicIcon size={15} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">{micError.title}</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-muted">
                {micError.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          </div>
          {micError.debug && (
            <p className="mt-2 break-words text-[11px] text-subtle">
              Browser detail: {micError.debug}
            </p>
          )}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={startRecording}
              className="rounded-md border border-line-strong px-2.5 py-1 text-[11px] text-fg transition-colors hover:bg-white/[0.06]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setMicError(null)}
              className="rounded-md px-2.5 py-1 text-[11px] text-subtle transition-colors hover:text-fg"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isFounder && showKeys && (
        <form
          onSubmit={rotateKey}
          className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 border-t border-line px-3 py-2 sm:px-4"
        >
          <span className="text-[11px] uppercase tracking-[0.1em] text-subtle">
            Rotate passcode
          </span>
          <input
            type="password"
            value={keyCurrent}
            onChange={(e) => setKeyCurrent(e.target.value)}
            placeholder="Current"
            aria-label="Current passcode"
            className="h-7 w-28 rounded border border-line bg-ink px-2 text-[11px] text-fg placeholder:text-subtle focus:border-line-strong focus:outline-none"
          />
          <input
            type="password"
            value={keyNext}
            onChange={(e) => setKeyNext(e.target.value)}
            placeholder="New (6+ chars)"
            aria-label="New passcode"
            className="h-7 w-32 rounded border border-line bg-ink px-2 text-[11px] text-fg placeholder:text-subtle focus:border-line-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={!keyCurrent || keyNext.length < 6}
            className="h-7 rounded border border-line-strong px-2.5 text-[11px] text-fg transition-colors hover:bg-white/[0.06] disabled:opacity-40"
          >
            Rotate
          </button>
          {keyMsg && <span className="text-[11px] text-muted">{keyMsg}</span>}
        </form>
      )}
    </div>
  );
}
