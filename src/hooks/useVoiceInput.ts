import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../ai/openrouter";

const MAX_RECORDING_MS = 30_000;

type VoiceState = {
  recording: boolean;
  transcribing: boolean;
  transcript: string;
  error: string | null;
  supported: boolean;
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
    supported:
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setState((s) => ({ ...s, error: null, transcript: "" }));

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

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const chunks = chunksRef.current.slice();
      cleanup();

      const audioBlob = new Blob(chunks, {
        type: chunks[0]?.type || "audio/webm",
      });
      if (audioBlob.size === 0) {
        setState((s) => ({ ...s, recording: false, error: "No audio captured." }));
        return;
      }

      if (!apiKey) {
        setState((s) => ({
          ...s,
          recording: false,
          error: "Add your OpenRouter API key in Settings to use voice input.",
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setState((s) => ({ ...s, recording: false, transcribing: true }));

      try {
        const text = await transcribeAudio({
          apiKey,
          audio: audioBlob,
          language,
          signal: controller.signal,
        });
        if (text.trim()) {
          setState((s) => ({ ...s, transcribing: false, transcript: text }));
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
    timeoutRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, MAX_RECORDING_MS);
    setState((s) => ({ ...s, recording: true }));
  }, [apiKey, cleanup, language]);

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
    setState({ recording: false, transcribing: false, transcript: "", error: null, supported: true });
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
