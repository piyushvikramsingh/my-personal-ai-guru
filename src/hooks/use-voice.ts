import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceStatus = "idle" | "listening" | "finalizing" | "sending" | "error" | "denied";

export type VoiceSession = {
  id: string;
  startedAt: string;
  endedAt: string;
  status: "success" | "failure" | "cancelled";
  transcript: string;
  error?: string;
};

// ─── Persistence helpers ─────────────────────────────────────────────────────

const SESSION_KEY = "void.voice.sessions";
const HOTKEY_KEY = "void.voice.hotkey";
const DEFAULT_HOTKEY = " "; // Space

export function getVoiceHotkey(): string {
  if (typeof window === "undefined") return DEFAULT_HOTKEY;
  return localStorage.getItem(HOTKEY_KEY) ?? DEFAULT_HOTKEY;
}
export function setVoiceHotkey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HOTKEY_KEY, key);
}

export function getVoiceSessions(): VoiceSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistSession(s: VoiceSession) {
  const all = getVoiceSessions();
  localStorage.setItem(SESSION_KEY, JSON.stringify([s, ...all].slice(0, 50)));
}

export function clearVoiceSessions() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

// ─── Speech recognition hook ─────────────────────────────────────────────────

export type UseSpeechRecognitionOptions = {
  onResult: (text: string, isFinal: boolean) => void;
  onStatusChange?: (status: VoiceStatus) => void;
  onSessionEnd?: (session: VoiceSession) => void;
};

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Store callbacks in refs so they never change identity — avoids infinite effect loops.
  const onResultRef = useRef(opts.onResult);
  const onStatusChangeRef = useRef(opts.onStatusChange);
  const onSessionEndRef = useRef(opts.onSessionEnd);
  useEffect(() => { onResultRef.current = opts.onResult; });
  useEffect(() => { onStatusChangeRef.current = opts.onStatusChange; });
  useEffect(() => { onSessionEndRef.current = opts.onSessionEnd; });

  const recRef = useRef<any | null>(null);
  const sessionRef = useRef<{ id: string; startedAt: string; transcript: string } | null>(null);
  const mountedRef = useRef(false);

  const updateStatus = useCallback((s: VoiceStatus) => {
    if (!mountedRef.current) return;
    setStatus(s);
    onStatusChangeRef.current?.(s);
  }, []);

  const buildRecognizer = useCallback(() => {
    if (typeof window === "undefined") return false;
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return false;

    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      if (!mountedRef.current) return;
      setListening(true);
      updateStatus("listening");
    };

    rec.onresult = (e: any) => {
      let text = "";
      let isFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      if (sessionRef.current) sessionRef.current.transcript = text;
      if (isFinal) updateStatus("finalizing");
      onResultRef.current(text, isFinal);
    };

    rec.onend = () => {
      if (!mountedRef.current) return;
      setListening(false);
      const sess = sessionRef.current;
      if (sess) {
        const session: VoiceSession = {
          id: sess.id,
          startedAt: sess.startedAt,
          endedAt: new Date().toISOString(),
          status: sess.transcript.trim() ? "success" : "cancelled",
          transcript: sess.transcript,
        };
        persistSession(session);
        onSessionEndRef.current?.(session);
        sessionRef.current = null;
      }
      updateStatus("idle");
    };

    rec.onerror = (e: any) => {
      if (!mountedRef.current) return;
      setListening(false);
      const isDenied = e.error === "not-allowed" || e.error === "permission-denied";
      if (isDenied) setPermissionDenied(true);
      updateStatus(isDenied ? "denied" : "error");
      const sess = sessionRef.current;
      if (sess) {
        const session: VoiceSession = {
          id: sess.id,
          startedAt: sess.startedAt,
          endedAt: new Date().toISOString(),
          status: "failure",
          transcript: sess.transcript,
          error: e.error ?? "unknown",
        };
        persistSession(session);
        onSessionEndRef.current?.(session);
        sessionRef.current = null;
      }
    };

    recRef.current = rec;
    return true;
  }, [updateStatus]); // stable — updateStatus is also stable (useCallback with [])

  // Initialize once on mount — deps are empty because we use refs for callbacks.
  useEffect(() => {
    mountedRef.current = true;
    const ok = buildRecognizer();
    setSupported(ok);
    return () => {
      mountedRef.current = false;
      try { recRef.current?.stop(); } catch {}
      recRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reinitialize = useCallback(() => {
    setPermissionDenied(false);
    const ok = buildRecognizer();
    setSupported(ok);
    if (!ok) updateStatus("error");
    return ok;
  }, [buildRecognizer, updateStatus]);

  const start = useCallback(() => {
    if (!recRef.current) {
      if (!reinitialize()) return;
    }
    try {
      sessionRef.current = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        transcript: "",
      };
      recRef.current!.start();
    } catch {
      updateStatus("error");
    }
  }, [reinitialize, updateStatus]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    if (mountedRef.current) {
      setListening(false);
      updateStatus("idle");
    }
  }, [updateStatus]);

  return {
    listening,
    supported,
    status,
    permissionDenied,
    start,
    stop,
    reinitialize,
    toggle: listening ? stop : start,
  };
}

// ─── TTS helpers ─────────────────────────────────────────────────────────────

const SPEED_KEY = "void.tts.speed";
export function getTTSSpeed(): number {
  if (typeof window === "undefined") return 1.05;
  return parseFloat(localStorage.getItem(SPEED_KEY) ?? "1.05");
}
export function setTTSSpeed(v: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SPEED_KEY, String(v));
}

let _activeMsgId: string | null = null;
const _ttsListeners = new Set<() => void>();

function _notifyTTS() {
  _ttsListeners.forEach((fn) => fn());
}

export function speakMessage(msgId: string, text: string, speed = getTTSSpeed()) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  _activeMsgId = msgId;
  _notifyTTS();
  const u = new SpeechSynthesisUtterance(
    text.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>]/g, "").slice(0, 2000)
  );
  u.rate = speed;
  u.pitch = 1;
  u.volume = 1;
  u.onend = () => { _activeMsgId = null; _notifyTTS(); };
  u.onerror = () => { _activeMsgId = null; _notifyTTS(); };
  window.speechSynthesis.speak(u);
}

export function pauseTTS() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.pause();
    _notifyTTS();
  }
}

export function resumeTTS() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.resume();
    _notifyTTS();
  }
}

export function stopTTS() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  _activeMsgId = null;
  _notifyTTS();
}

export function isTTSSpeaking() {
  return typeof window !== "undefined" && !!window.speechSynthesis?.speaking && !window.speechSynthesis?.paused;
}

export function isTTSPaused() {
  return typeof window !== "undefined" && !!window.speechSynthesis?.paused;
}

export function useTTSState(msgId: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    _ttsListeners.add(bump);
    // Poll every 300 ms to catch native speechSynthesis state changes
    const id = setInterval(bump, 300);
    return () => { _ttsListeners.delete(bump); clearInterval(id); };
  }, []);
  const isActive = _activeMsgId === msgId;
  return {
    isActive,
    speaking: isActive && isTTSSpeaking(),
    paused: isActive && isTTSPaused(),
  };
}

// ─── Legacy compat ───────────────────────────────────────────────────────────
export function speak(text: string) { speakMessage("__legacy__", text); }
export function stopSpeaking() { stopTTS(); }

const VOICE_KEY = "void.voice.autoSpeak";
export function getAutoSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(VOICE_KEY) === "1";
}
export function setAutoSpeak(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_KEY, v ? "1" : "0");
}
