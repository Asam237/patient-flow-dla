"use client";

import { useState, useEffect, useRef } from "react";
import { doc, collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Volume2, Users } from "lucide-react";
import type { QueueState, User, QueueNumber } from "@/lib/types";
import images from "@/assets/pictures";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { formatTicket } from "@/lib/utils";

export default function DisplayPage() {
  const [queueState, setQueueState] = useState<any>(null);
  const [assistants, setAssistants] = useState<User[]>([]);
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);
  const [isNewNumberA, setIsNewNumberA] = useState(false);
  const [isNewNumberB, setIsNewNumberB] = useState(false);
  const [time, setTime] = useState<string>("");
  const [isAudioReady, setIsAudioReady] = useState(false);

  const previousNumberARef = useRef<number | null>(null);
  const previousNumberBRef = useRef<number | null>(null);
  const previousCalledAtARef = useRef<number | null>(null);
  const previousCalledAtBRef = useRef<number | null>(null);
  const assistantsRef = useRef<User[]>([]);

  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioReadyRef = useRef<boolean>(false);

  const frVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const enVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const carouselImages = [images.plan, images.plan1, images.qrcode];
  const carouselData = [
    { title: "Poste d'enregistrement / Registration Box" },
    { title: "Poste d'enregistrement / Registration Box" },
    {
      title:
        "Scannez le code QR pour donner votre avis / Scan the QR Code to Share Your Feedback",
    },
  ];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
    }, 15000);
    return () => clearInterval(interval);
  }, [carouselImages.length]);

  const announcementQueueRef = useRef<
    Array<{ ticketNumber: number; assistantName?: string; blockLabel?: string }>
  >([]);
  const isAnnouncingRef = useRef<boolean>(false);

  // =========================
  // INIT AUDIO
  // =========================
  const handleStartAudio = async () => {
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
      if (htmlAudioRef.current) {
        htmlAudioRef.current.volume = 0.01;
        await htmlAudioRef.current.play().catch(() => {});
        htmlAudioRef.current.pause();
        htmlAudioRef.current.currentTime = 0;
        htmlAudioRef.current.volume = 1;
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
  };

  const playNotificationSound = (): Promise<void> => {
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
          setTimeout(() => resolve(), 200);
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
      if (htmlAudioRef.current) {
        const audio = htmlAudioRef.current;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setTimeout(() => resolve(), 200);
        return;
      }
      resolve();
    });
  };

  const processQueue = async () => {
    if (isAnnouncingRef.current) return;
    if (announcementQueueRef.current.length === 0) return;
    isAnnouncingRef.current = true;
    while (announcementQueueRef.current.length > 0) {
      const next = announcementQueueRef.current.shift()!;
      await announceTicketBilingual(
        next.ticketNumber,
        next.assistantName,
        next.blockLabel,
      );
    }
    isAnnouncingRef.current = false;
  };

  const announceTicketBilingual = async (
    ticketNumber: number,
    assistantName?: string,
    blockLabel?: string,
  ) => {
    await playNotificationSound();

    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const formatted = formatTicket(ticketNumber);
    const guichetNumber = assistantName ? assistantName.replace(/\D/g, "") : "";

    const blockFr = blockLabel ? `, ${blockLabel}` : "";
    const blockEn = blockLabel ? `, ${blockLabel}` : "";

    const frText = guichetNumber
      ? `Numéro ${formatted}${blockFr}, veuillez vous rendre au box numéro ${guichetNumber}`
      : `Numéro ${formatted}${blockFr}, veuillez vous rendre au box ${assistantName || ""}`;

    const enText = guichetNumber
      ? `Ticket number ${formatted}${blockEn}, please proceed to box number ${guichetNumber}`
      : `Ticket number ${formatted}${blockEn}, please proceed to box ${assistantName || ""}`;

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
            v.name.toLowerCase().includes(preferred) && v.lang.startsWith("fr"),
        );
        if (match) return match;
      }

      const frFR = voices.find(
        (v) =>
          v.lang === "fr-FR" &&
          !v.name.toLowerCase().includes("swiss") &&
          !v.name.toLowerCase().includes("suisse") &&
          !v.name.toLowerCase().includes("ch") &&
          !v.name.toLowerCase().includes("canada") &&
          !v.name.toLowerCase().includes("québec"),
      );

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

        if (voice) {
          msg.voice = voice;
        }

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

    // Français x2
    await speakWithPromise(frText, "fr-FR", preferredFrVoice);
    await speakWithPromise(frText, "fr-FR", preferredFrVoice);

    // Anglais x2
    await speakWithPromise(enText, "en-US", enVoiceRef.current);
    await speakWithPromise(enText, "en-US", enVoiceRef.current);
  };

  useEffect(() => {
    const unsubscribeState = onSnapshot(
      doc(db, "queue_state", "current"),
      (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        const newNumberA = data.currentNumberA ?? null;
        const calledAtAMillis: number | null =
          data.calledAtA?.toMillis?.() ?? null;
        const isNewCallA =
          newNumberA !== null &&
          calledAtAMillis !== null &&
          calledAtAMillis !== previousCalledAtARef.current;
        if (isNewCallA) {
          const assistantId = data.currentAssistantIdA;
          const assistant = assistantsRef.current.find(
            (a) => a.id === assistantId,
          );
          const queueAnnounceFn = (name?: string) => {
            announcementQueueRef.current.push({
              ticketNumber: newNumberA,
              assistantName: name,
              blockLabel: "Block A",
            });
            processQueue();
          };
          const assistantName =
            assistantsRef.current.find((a) => a.id === assistantId)?.name ||
            "Guichet";
          announcementQueueRef.current.push({
            ticketNumber: newNumberA,
            assistantName,
            blockLabel: "Block A",
          });

          processQueue();
          setIsNewNumberA(true);
          setTimeout(() => setIsNewNumberA(false), 6000);
        }
        previousNumberARef.current = newNumberA;
        if (calledAtAMillis !== null) {
          previousCalledAtARef.current = calledAtAMillis;
        }

        // Détection changement Block B — même logique basée sur calledAtB.
        const newNumberB = data.currentNumberB ?? null;
        const calledAtBMillis: number | null =
          data.calledAtB?.toMillis?.() ?? null;
        const isNewCallB =
          newNumberB !== null &&
          calledAtBMillis !== null &&
          calledAtBMillis !== previousCalledAtBRef.current;
        if (isNewCallB) {
          const assistantId = data.currentAssistantIdB;
          const assistant = assistantsRef.current.find(
            (a) => a.id === assistantId,
          );
          const queueAnnounceFn = (name?: string) => {
            announcementQueueRef.current.push({
              ticketNumber: newNumberB,
              assistantName: name,
              blockLabel: "Block B",
            });
            processQueue();
          };
          const assistantName =
            assistantsRef.current.find((a) => a.id === assistantId)?.name ||
            "Guichet";

          announcementQueueRef.current.push({
            ticketNumber: newNumberB,
            assistantName,
            blockLabel: "Block B",
          });

          processQueue();
          setIsNewNumberB(true);
          setTimeout(() => setIsNewNumberB(false), 6000);
        }
        previousNumberBRef.current = newNumberB;
        if (calledAtBMillis !== null) {
          previousCalledAtBRef.current = calledAtBMillis;
        }

        setQueueState(data);
      },
    );

    const unsubscribeAssistants = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as User)
          .filter((u) => u.role === "assistant");
        assistantsRef.current = list;
        setAssistants(list);
      },
    );

    const unsubscribeNumbers = onSnapshot(
      collection(db, "queue_numbers"),
      (snapshot) => {
        const numbers: QueueNumber[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              number: data.number,
              block: data.block || "",
              status: data.status,
              assistantId: data.assistantId || null,
              assistantName: data.assistantName || null,
              createdAt: data.createdAt?.toDate() || new Date(),
              calledAt: data.calledAt?.toDate() || null,
              completedAt: data.completedAt?.toDate() || null,
              serviceDurationSeconds: data.serviceDurationSeconds || null,
            };
          })
          .sort((a, b) => a.number - b.number);
        setQueueNumbers(numbers);
      },
    );

    return () => {
      unsubscribeState();
      unsubscribeAssistants();
      unsubscribeNumbers();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const updateTime = () =>
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentAssistantA = assistants.find(
    (a) => a.id === queueState?.currentAssistantIdA,
  );
  const currentAssistantB = assistants.find(
    (a) => a.id === queueState?.currentAssistantIdB,
  );

  const waitingA = queueNumbers.filter(
    (n) =>
      (n as any).block?.toLowerCase() === "block a" && n.status === "waiting",
  ).length;
  const waitingB = queueNumbers.filter(
    (n) =>
      (n as any).block?.toLowerCase() === "block b" && n.status === "waiting",
  ).length;

  return (
    <div className="h-screen bg-[#084B9A] text-slate-900 overflow-hidden font-sans flex flex-col p-6 lg:p-10">
      <audio
        ref={htmlAudioRef}
        src="/sound.mp3"
        preload="auto"
        className="hidden"
      />

      {/* Overlay d'activation */}
      {!isAudioReady && (
        <div className="fixed inset-0 z-[100] bg-[#084B9A]/95 backdrop-blur-xl flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-12 rounded-[3.5rem] shadow-2xl text-center max-w-md"
          >
            <Volume2 className="w-16 h-16 text-blue-600 mx-auto mb-6 animate-bounce" />
            <h2 className="text-3xl font-black text-blue-900 mb-4">
              Système d&apos;appel
            </h2>
            <p className="text-slate-500 mb-8 text-lg">
              Veuillez cliquer sur le bouton pour activer les annonces vocales
              bilingues.
            </p>
            <button
              onClick={async () => {
                await handleStartAudio();
                setIsAudioReady(true);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-bold text-xl transition-all shadow-lg"
            >
              Lancer l&apos;affichage
            </button>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div className="bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/20">
          <Image
            src={images.iomlogo}
            width={180}
            height={60}
            alt="logo"
            className="brightness-0 invert"
          />
        </div>

        {/* URL feedback */}
        <div className="flex items-center gap-6 px-8 py-5 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 backdrop-blur-xl rounded-3xl border-2 border-blue-400/40 shadow-2xl shadow-blue-500/10">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-yellow-400 text-slate-900 shadow-lg shadow-yellow-400/20 animate-bounce [animation-duration:3s]">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
              />
            </svg>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
              Pour donner votre avis, tapez l&apos;adresse :
            </span>
            <div className="flex items-center gap-3 px-5 py-3 bg-black/60 rounded-2xl border border-white/20 shadow-inner">
              <span className="text-sm font-bold text-white/95 tracking-tight font-mono select-none">
                https://
              </span>
              <span className="text-2xl font-mono font-black text-white tracking-wider">
                shorturl.at/zqDGJ
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 px-8 py-4 bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 text-white shadow-xl">
            <Clock className="w-6 h-6 text-blue-300" />
            <span className="text-3xl font-black">{time}</span>
          </div>
          <div className="flex items-center gap-3 px-8 py-4 bg-green-500 rounded-3xl shadow-lg shadow-green-900/30 text-white">
            <div className="w-3 h-3 bg-white rounded-full animate-ping" />
            <span className="text-xl font-black uppercase tracking-widest">
              Live
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-12 gap-6 mb-6 overflow-hidden">
        {/* ======== BLOCK A ======== */}
        <motion.div
          animate={
            isNewNumberA
              ? {
                  scale: [1, 1.02, 1],
                  transition: { duration: 0.5, repeat: 4 },
                }
              : {}
          }
          className="col-span-12 lg:col-span-5 h-full"
        >
          <Card className="h-full bg-white border-0 shadow-2xl rounded-[3.5rem] overflow-hidden relative flex flex-col">
            {/* Barre couleur top Block A */}
            <div className="absolute top-0 left-0 w-full h-4 bg-blue-600" />
            <div className="p-10 flex flex-col h-full">
              {/* Label block */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-600 uppercase tracking-widest font-black text-lg">
                  Block A
                </span>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold text-blue-600">
                    {waitingA} en attente
                  </span>
                </div>
              </div>
              <span className="text-slate-400 text-sm font-semibold mb-4">
                Ticket Actuel / Current Ticket
              </span>

              <div className="flex-1 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={queueState?.currentNumberA}
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-[10rem] xl:text-[14rem] leading-none font-black text-blue-600 tabular-nums"
                  >
                    {queueState?.currentNumberA != null
                      ? formatTicket(queueState.currentNumberA)
                      : "--"}
                  </motion.div>
                </AnimatePresence>
              </div>

              {currentAssistantA && (
                <div className="mt-4 pt-8 border-t-2 border-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-base uppercase text-slate-400 font-black">
                      Allez au guichet / Go to
                    </p>
                    <p className="text-4xl font-black text-slate-800">
                      {currentAssistantA.name}
                    </p>
                  </div>
                  <div
                    className="h-20 w-20 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl"
                    style={{
                      backgroundColor: currentAssistantA.color || "#3b82f6",
                    }}
                  >
                    {currentAssistantA.name.match(/\d+/) || "!"}
                  </div>
                </div>
              )}

              {/* Suivant Block A */}
              <div className="mt-4 flex items-center gap-3 px-5 py-3 bg-blue-50 rounded-2xl border border-blue-100">
                <span className="text-xs font-black text-blue-400 uppercase tracking-widest">
                  Suivant / Next
                </span>
                <span className="text-2xl font-black text-blue-300 tabular-nums ml-auto">
                  {queueState?.nextNumberA != null
                    ? formatTicket(queueState.nextNumberA)
                    : "--"}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ======== BLOCK B ======== */}
        <motion.div
          animate={
            isNewNumberB
              ? {
                  scale: [1, 1.02, 1],
                  transition: { duration: 0.5, repeat: 4 },
                }
              : {}
          }
          className="col-span-12 lg:col-span-4 h-full"
        >
          <Card className="h-full bg-white border-0 shadow-2xl rounded-[3.5rem] overflow-hidden relative flex flex-col">
            {/* Barre couleur top Block B */}
            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-purple-600 to-pink-600" />
            <div className="p-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-purple-600 uppercase tracking-widest font-black text-lg">
                  Block B
                </span>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-full border border-purple-100">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-purple-600">
                    {waitingB} en attente
                  </span>
                </div>
              </div>
              <span className="text-slate-400 text-sm font-semibold mb-4">
                Ticket Actuel / Current Ticket
              </span>

              <div className="flex-1 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={queueState?.currentNumberB}
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-[10rem] xl:text-[14rem] leading-none font-black text-purple-600 tabular-nums"
                  >
                    {queueState?.currentNumberB != null
                      ? formatTicket(queueState.currentNumberB)
                      : "--"}
                  </motion.div>
                </AnimatePresence>
              </div>

              {currentAssistantB && (
                <div className="mt-4 pt-8 border-t-2 border-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-base uppercase text-slate-400 font-black">
                      Allez au guichet / Go to
                    </p>
                    <p className="text-4xl font-black text-slate-800">
                      {currentAssistantB.name}
                    </p>
                  </div>
                  <div
                    className="h-20 w-20 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl"
                    style={{
                      backgroundColor: currentAssistantB.color || "#9333ea",
                    }}
                  >
                    {currentAssistantB.name.match(/\d+/) || "!"}
                  </div>
                </div>
              )}

              {/* Suivant Block B */}
              <div className="mt-4 flex items-center gap-3 px-5 py-3 bg-purple-50 rounded-2xl border border-purple-100">
                <span className="text-xs font-black text-purple-400 uppercase tracking-widest">
                  Suivant / Next
                </span>
                <span className="text-2xl font-black text-purple-300 tabular-nums ml-auto">
                  {queueState?.nextNumberB != null
                    ? formatTicket(queueState.nextNumberB)
                    : "--"}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ======== CAROUSEL ======== */}
        <Card className="col-span-12 lg:col-span-3 border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white/10 backdrop-blur-xl border-white/20">
          <CardContent className="h-full p-0 flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentImageIndex}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4 }}
                className="flex-1 flex flex-col px-3 pt-3"
              >
                <div className="relative flex-1 w-full rounded-[2rem] overflow-hidden">
                  <Image
                    src={carouselImages[currentImageIndex]}
                    alt={`Slide ${currentImageIndex + 1}`}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mt-3 pb-2"
                >
                  <div className="bg-white/15 backdrop-blur-md rounded-2xl px-6 py-4">
                    <h3 className="text-center text-white text-base font-semibold leading-relaxed">
                      {carouselData[currentImageIndex].title}
                    </h3>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
            <div className="flex justify-center gap-2 pb-4">
              {carouselImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentImageIndex
                      ? "bg-white w-8"
                      : "bg-white/40 w-2 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="flex justify-center items-center py-2">
        <p className="text-white/30 text-sm font-medium tracking-widest uppercase">
          &copy; {new Date().getFullYear()} — Organisation Internationale pour
          les Migrations
        </p>
      </footer>
    </div>
  );
}
