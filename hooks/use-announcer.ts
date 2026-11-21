"use client";

import { useCallback, useEffect, useRef } from "react";

export type Announcement = {
  fr: string;
  en: string;
};

// Audio pipeline shared by the public screens (/display):
// notification sound, then the text read once in French and once in
// English. Announcements are queued and played one at a time so they never
// overlap. The caller renders <audio ref={audioRef} src="/sound.mp3" /> and
// calls startAudio() from a user gesture to satisfy autoplay restrictions.
export function useAnnouncer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioReadyRef = useRef<boolean>(false);

  // Voices are cached up front because Smart TV browsers can load them late.
  const frVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const enVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const queueRef = useRef<Announcement[]>([]);
  const isAnnouncingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startAudio = useCallback(async () => {
    try {
      const response = await fetch("/sound.mp3");
      const arrayBuffer = await response.arrayBuffer();

      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        await ctx.resume();
        audioContextRef.current = ctx;

        try {
          audioBufferRef.current = await ctx.decodeAudioData(arrayBuffer);
          audioReadyRef.current = true;
        } catch (error) {
          console.warn("decodeAudioData failed:", error);
        }
      }

      if (audioRef.current) {
        audioRef.current.volume = 0.01;
        await audioRef.current.play().catch(() => {});
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1;
      }

      if (typeof window !== "undefined" && window.speechSynthesis) {
        const cacheVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            frVoiceRef.current =
              voices.find((v) => v.lang.toLowerCase().includes("fr")) || null;
            enVoiceRef.current =
              voices.find((v) => v.lang.toLowerCase().includes("en")) || null;
          }
        };

        cacheVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = cacheVoices;
        }

        const warmup = new SpeechSynthesisUtterance(" ");
        warmup.volume = 0;
        window.speechSynthesis.speak(warmup);
      }
    } catch (e) {
      console.error("Audio init failed:", e);
    }
  }, []);

  const playNotificationSound = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (
        audioContextRef.current &&
        audioBufferRef.current &&
        audioReadyRef.current
      ) {
        const ctx = audioContextRef.current;

        const doPlay = () => {
          const source = ctx.createBufferSource();
          source.buffer = audioBufferRef.current!;
          source.connect(ctx.destination);
          source.start(0);
          setTimeout(() => resolve(), 600);
        };

        if (ctx.state === "suspended") {
          ctx
            .resume()
            .then(doPlay)
            .catch(() => resolve());
        } else {
          doPlay();
        }
        return;
      }

      if (audioRef.current) {
        const audio = audioRef.current;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setTimeout(() => resolve(), 600);
        return;
      }

      resolve();
    });
  }, []);

  const announce = useCallback(
    async ({ fr, en }: Announcement) => {
      await playNotificationSound();

      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      const getPreferredFrVoice = (): SpeechSynthesisVoice | null => {
        const voices = window.speechSynthesis.getVoices();

        const preferredNames = [
          "google french",
          "thomas",
          "amelie",
          "marie",
          "juliette",
        ];

        for (const preferred of preferredNames) {
          const match = voices.find(
            (v) =>
              v.name.toLowerCase().includes(preferred) &&
              v.lang.startsWith("fr"),
          );
          if (match) return match;
        }

        const anyFrFR = voices.find((v) => v.lang === "fr-FR");
        if (anyFrFR) return anyFrFR;
        const anyFr = voices.find((v) => v.lang.startsWith("fr"));
        if (anyFr) return anyFr;

        return frVoiceRef.current;
      };

      const preferredFrVoice = getPreferredFrVoice();

      const speakWithPromise = (
        text: string,
        lang: string,
        voice: SpeechSynthesisVoice | null,
      ): Promise<void> => {
        return new Promise((resolve) => {
          const msg = new SpeechSynthesisUtterance(text);
          msg.lang = lang;
          if (voice) msg.voice = voice;

          msg.rate = 0.82;
          msg.pitch = 0.85;
          msg.volume = 1;

          msg.onend = () => resolve();
          msg.onerror = () => resolve();

          msg.onstart = () => {
            if ((window.speechSynthesis as any)._keepAlive) return;
            (window.speechSynthesis as any)._keepAlive = setInterval(() => {
              if (!window.speechSynthesis.speaking) {
                clearInterval((window.speechSynthesis as any)._keepAlive);
                (window.speechSynthesis as any)._keepAlive = null;
              } else {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
              }
            }, 5000);
          };

          window.speechSynthesis.speak(msg);
        });
      };

      await speakWithPromise(fr, "fr-FR", preferredFrVoice);
      await speakWithPromise(en, "en-US", enVoiceRef.current);
    },
    [playNotificationSound],
  );

  const enqueue = useCallback(
    async (announcement: Announcement) => {
      queueRef.current.push(announcement);
      if (isAnnouncingRef.current) return;

      isAnnouncingRef.current = true;
      while (queueRef.current.length > 0) {
        await announce(queueRef.current.shift()!);
      }
      isAnnouncingRef.current = false;
    },
    [announce],
  );

  return { audioRef, startAudio, enqueue };
}
