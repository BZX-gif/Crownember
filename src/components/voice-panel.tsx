"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

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
        setKeyMsg(`❌ ${data.error ?? "Could not rotate key."}`);
        return;
      }
      setKeyMsg("✅ Key rotated.");
      setKeyCurrent("");
      setKeyNext("");
    } catch {
      setKeyMsg("❌ Network error.");
    }
  }

  return (
    <div className="border-t border-white/10 bg-slate-950/70">
      <div className="flex items-center gap-2 px-3 py-2">
        {recording ? (
          <button
            onClick={stopRecording}
            title="Stop and send"
            className="flex shrink-0 items-center gap-1.5 bg-rose-500 px-3 py-1.5 font-hud text-[11px] font-bold text-white transition hover:brightness-110"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {recSec}s
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={sending || sentFlash}
            title="Record a voice note (max 25s — burns when anyone leaves)"
            className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 font-hud text-[11px] font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
          >
            {sending ? "…" : sentFlash ? "✓ sent" : "🎙️ talk"}
          </button>
        )}

        <div className="nice-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {notes.length === 0 && !recording && (
            <span className="whitespace-nowrap font-hud text-[10px] uppercase tracking-wider text-slate-600">
              voice burns on exit 🔥
            </span>
          )}
          {notes.map((n) => {
            const mine = n.author.username === myName;
            const active = playingId === n.id;
            return (
              <button
                key={n.id}
                onClick={() => play(n)}
                title={`${n.author.username} · tap to play`}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border px-2 py-1 transition",
                  active
                    ? "border-amber-400/70 bg-amber-500/15"
                    : "border-white/10 bg-white/5 hover:border-amber-500/40",
                )}
              >
                <Avatar
                  name={n.author.username}
                  color={n.author.avatarColor}
                  size={18}
                />
                <span className="flex h-3 items-end gap-px">
                  {[0, 1, 2].map((b) => (
                    <span
                      key={b}
                      className={cn("w-px bg-amber-400", active && "animate-pulse")}
                      style={{ height: `${4 + ((b * 4 + n.id * 3) % 8)}px` }}
                    />
                  ))}
                </span>
                <span className="font-hud text-[10px] font-bold text-slate-300">
                  {Math.max(1, Math.round(n.durationMs / 1000))}s
                </span>
              </button>
            );
          })}
        </div>

        {isFounder && (
          <button
            onClick={() => setShowKeys((s) => !s)}
            title="Rotate the vault key"
            className="shrink-0 border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-hud text-[11px] text-amber-300 transition hover:bg-amber-500/20"
          >
            🗝️
          </button>
        )}
      </div>

      {micError && (
        <div className="mx-3 mb-2 border border-rose-500/40 bg-rose-950/50 p-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-lg">🎙️</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-rose-300">
                {micError.title}
              </p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-300">
                {micError.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          </div>
          {micError.debug && (
            <p className="mt-2 font-hud text-[9px] text-slate-600">
              debug: {micError.debug}
            </p>
          )}
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={startRecording}
              className="bg-rose-500/25 px-3 py-1.5 font-hud text-[10px] font-bold uppercase tracking-wider text-rose-200 transition hover:bg-rose-500/40"
            >
              ↻ try again
            </button>
            <button
              onClick={() => setMicError(null)}
              className="px-3 py-1.5 font-hud text-[10px] font-bold uppercase tracking-wider text-slate-500 transition hover:text-slate-300"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {isFounder && showKeys && (
        <form
          onSubmit={rotateKey}
          className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2"
        >
          <span className="font-hud text-[10px] font-bold uppercase tracking-wider text-slate-500">
            rotate key:
          </span>
          <input
            type="password"
            value={keyCurrent}
            onChange={(e) => setKeyCurrent(e.target.value)}
            placeholder="current"
            className="w-32 border border-white/10 bg-slate-950/80 px-2.5 py-1.5 font-hud text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400/60 focus:outline-none"
          />
          <input
            type="password"
            value={keyNext}
            onChange={(e) => setKeyNext(e.target.value)}
            placeholder="new (6+ chars)"
            className="w-32 border border-white/10 bg-slate-950/80 px-2.5 py-1.5 font-hud text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!keyCurrent || keyNext.length < 6}
            className="bg-amber-500/20 px-3 py-1.5 font-hud text-[10px] font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-40"
          >
            rotate
          </button>
          {keyMsg && (
            <span className="font-hud text-[11px] text-slate-300">{keyMsg}</span>
          )}
        </form>
      )}
    </div>
  );
}
