import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../ai/openrouter";

const MAX_RECORDING_MS = 30_000;
const MIN_RECORDING_MS = 500;
const MIN_AUDIO_BYTES = 2048;
const LEVEL_FALLOFF = 0.6;

const HALLUCINATION_PATTERNS = [
  /^thank you for*(ing)?\.?$/i,
  /^thanks for watching!?$/i,
  /^please subscribe\.?$/i,
  /^bye[- ]bye\.?$/i,
  /^you\.?$/i,
  /^(\[.*\])?$/i,
];

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // some browsers throw on unknown types, just skip
    }
  }
  return "";
}

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

type VoiceState = {
  recording: boolean;
  transcribing: boolean;
  transcript: string;
  error: string | null;
  supported: boolean;
  level: number;
};

type UseVoiceInputOptions = {
  apiKey: string;
  language?: string;
};

export function useVoiceInput({ apiKey, language }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>({
    recording: false,
    transcribing: false,
    transcript: "",
    error: null,
    supported: isSupported(),
    level: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const mimeRef = useRef<string>("");

  const cleanupAudio = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    cleanupAudio();
  }, [cleanupAudio]);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.min(1, rms * 3);
        setState((s) => ({ ...s, level: s.level * LEVEL_FALLOFF + level * (1 - LEVEL_FALLOFF) }));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // analyser is optional, ignore failures
    }
  }, []);

  const start = useCallback(async () => {
    setState((s) => ({ ...s, error: null, transcript: "", level: 0 }));

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : `Could not access microphone: ${err instanceof Error ? err.message : String(err)}`;
      setState((s) => ({ ...s, error: msg }));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mime = pickMimeType();
    mimeRef.current = mime;

    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      const msg = `MediaRecorder unavailable: ${err instanceof Error ? err.message : String(err)}`;
      setState((s) => ({ ...s, error: msg }));
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const chunks = chunksRef.current.slice();
      const duration = Date.now() - startTimeRef.current;
      const declaredMime = recorder.mimeType || mimeRef.current;
      cleanup();

      if (duration < MIN_RECORDING_MS) {
        setState((s) => ({ ...s, recording: false, level: 0 }));
        return;
      }

      const audioBlob = new Blob(chunks, {
        type: chunks[0]?.type || declaredMime || "audio/webm",
      });
      if (audioBlob.size < MIN_AUDIO_BYTES) {
        setState((s) => ({ ...s, recording: false, level: 0 }));
        return;
      }

      if (!apiKey) {
        setState((s) => ({
          ...s,
          recording: false,
          level: 0,
          error: "Add your OpenRouter API key in Settings to use voice input.",
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setState((s) => ({ ...s, recording: false, transcribing: true, level: 0 }));

      try {
        const text = await transcribeAudio({
          apiKey,
          audio: audioBlob,
          language,
          signal: controller.signal,
        });
        const cleaned = text.trim();
        const isHallucination = HALLUCINATION_PATTERNS.some((re) => re.test(cleaned));
        if (cleaned && !isHallucination) {
          setState((s) => ({ ...s, transcribing: false, transcript: cleaned }));
        } else {
          setState((s) => ({ ...s, transcribing: false }));
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setState((s) => ({ ...s, transcribing: false }));
          return;
        }
        const msg = err instanceof Error ? err.message : "Transcription failed.";
        setState((s) => ({ ...s, transcribing: false, error: msg }));
      } finally {
        abortRef.current = null;
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    startTimeRef.current = Date.now();
    startLevelMeter(stream);
    timeoutRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, MAX_RECORDING_MS);
    setState((s) => ({ ...s, recording: true, level: 0 }));
  }, [apiKey, cleanup, language, startLevelMeter]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setState({ recording: false, transcribing: false, transcript: "", error: null, supported: isSupported(), level: 0 });
  }, [cleanup]);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, transcript: "", error: null }));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanup();
    };
  }, [cleanup]);

  return { ...state, start, stop, cancel, reset };
}
