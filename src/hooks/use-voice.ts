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

function saveSession(s: VoiceSession) {
  const all = getVoiceSessions();
  const updated = [s, ...all].slice(0, 50);
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
}

export function clearVoiceSessions() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

type SpeechRecognitionEvent = any;

export type UseSpeechRecognitionOptions = {
  onResult: (text: string, isFinal: boolean) => void;
  onStatusChange?: (status: VoiceStatus) => void;
  onSessionEnd?: (session: VoiceSession) => void;
};

export function useSpeechRecognition({
  onResult,
  onStatusChange,
  onSessionEnd,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recRef = useRef<any | null>(null);
  const sessionRef = useRef<{ id: string; startedAt: string; transcript: string } | null>(null);
  const isMountedRef = useRef(true);

  const updateStatus = useCallback(
    (s: VoiceStatus) => {
      setStatus(s);
      onStatusChange?.(s);
    },
    [onStatusChange]
  );

  const initRecognizer = useCallback(() => {
    if (typeof window === "undefined") return false;
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return false;

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      if (!isMountedRef.current) return;
      setListening(true);
      updateStatus("listening");
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let text = "";
      let isFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      if (sessionRef.current) sessionRef.current.transcript = text;
      if (isFinal) updateStatus("finalizing");
      onResult(text, isFinal);
    };

    rec.onend = () => {
      if (!isMountedRef.current) return;
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
        saveSession(session);
        onSessionEnd?.(session);
        sessionRef.current = null;
      }
      updateStatus("idle");
    };

    rec.onerror = (e: any) => {
      if (!isMountedRef.current) return;
      setListening(false);
      const isDenied = e.error === "not-allowed" || e.error === "permission-denied";
      if (isDenied) {
        setPermissionDenied(true);
        updateStatus("denied");
      } else {
        updateStatus("error");
      }
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
        saveSession(session);
        onSessionEnd?.(session);
        sessionRef.current = null;
      }
    };

    recRef.current = rec;
    return true;
  }, [onResult, onSessionEnd, updateStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    const ok = initRecognizer();
    setSupported(ok);
    return () => {
      isMountedRef.current = false;
      try {
        recRef.current?.stop();
      } catch {}
    };
  }, [initRecognizer]);

  const reinitialize = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {}
    setPermissionDenied(false);
    const ok = initRecognizer();
    setSupported(ok);
    updateStatus(ok ? "idle" : "error");
    return ok;
  }, [initRecognizer, updateStatus]);

  const start = useCallback(() => {
    if (!recRef.current) {
      const ok = reinitialize();
      if (!ok) return;
    }
    try {
      sessionRef.current = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        transcript: "",
      };
      recRef.current!.start();
    } catch (e: any) {
      updateStatus("error");
    }
  }, [reinitialize, updateStatus]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {}
    setListening(false);
    updateStatus("idle");
  }, [updateStatus]);

  return {
    listening,
    supported,
    status,
    permissionDenied,
    start,
    stop,
    reinitialize,
    toggle: () => (listening ? stop() : start()),
  };
}

// ─── TTS helpers ────────────────────────────────────────────────────────────

export type TTSState = "idle" | "speaking" | "paused";

const SPEED_KEY = "void.tts.speed";
export function getTTSSpeed(): number {
  if (typeof window === "undefined") return 1.05;
  return parseFloat(localStorage.getItem(SPEED_KEY) ?? "1.05");
}
export function setTTSSpeed(v: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SPEED_KEY, String(v));
}

let activeMsgId: string | null = null;
const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function getActiveMsgId() {
  return activeMsgId;
}

export function speakMessage(msgId: string, text: string, speed = getTTSSpeed()) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  activeMsgId = msgId;
  notifyListeners();
  const u = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>]/g, "").slice(0, 2000));
  u.rate = speed;
  u.pitch = 1;
  u.volume = 1;
  u.onend = () => {
    activeMsgId = null;
    notifyListeners();
  };
  u.onerror = () => {
    activeMsgId = null;
    notifyListeners();
  };
  window.speechSynthesis.speak(u);
}

export function pauseTTS() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.pause();
    notifyListeners();
  }
}

export function resumeTTS() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.resume();
    notifyListeners();
  }
}

export function stopTTS() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    activeMsgId = null;
    notifyListeners();
  }
}

export function isTTSSpeaking() {
  return typeof window !== "undefined" && window.speechSynthesis?.speaking && !window.speechSynthesis?.paused;
}

export function isTTSPaused() {
  return typeof window !== "undefined" && window.speechSynthesis?.paused;
}

export function useTTSState(msgId: string) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const fn = () => forceUpdate((n) => n + 1);
    listeners.add(fn);
    const interval = setInterval(fn, 300);
    return () => {
      listeners.delete(fn);
      clearInterval(interval);
    };
  }, []);
  const isActive = activeMsgId === msgId;
  const speaking = isActive && isTTSSpeaking();
  const paused = isActive && isTTSPaused();
  return { isActive, speaking, paused };
}

// Legacy exports for backward compat
export function speak(text: string) {
  speakMessage("__legacy__", text);
}
export function stopSpeaking() {
  stopTTS();
}

const VOICE_KEY = "void.voice.autoSpeak";
export function getAutoSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(VOICE_KEY) === "1";
}
export function setAutoSpeak(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_KEY, v ? "1" : "0");
}
