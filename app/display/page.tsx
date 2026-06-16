"use client";

import { useState, useEffect, useRef } from "react";
import { doc, collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Clock, Volume2, ArrowRight, Users } from "lucide-react";
import type { QueueState, User, QueueNumber } from "@/lib/types";
import images from "@/assets/pictures";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { formatTicket } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function DisplayPage() {
  const [currentState, setCurrentState] = useState<QueueState | null>(null);
  const [assistants, setAssistants] = useState<User[]>([]);
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);
  const [isNewNumber, setIsNewNumber] = useState(false);
  const [time, setTime] = useState<string>("");
  const [isAudioReady, setIsAudioReady] = useState(false);

  const previousNumberRef = useRef<number | null>(null);
  const assistantsRef = useRef<User[]>([]);

  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioReadyRef = useRef<boolean>(false);

  // Références stables pour stocker les voix dès le départ (Spécial Smart TV)
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
      setCurrentImageIndex(
        (prevIndex) => (prevIndex + 1) % carouselImages.length,
      );
    }, 15000);

    return () => clearInterval(interval);
  }, [carouselImages.length]);

  const announcementQueueRef = useRef<
    Array<{ ticketNumber: number; assistantName?: string }>
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

  // =========================
  // PLAY SOUND BEFORE ANNOUNCE
  // =========================
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
      await announceTicketBilingual(next.ticketNumber, next.assistantName);
    }

    isAnnouncingRef.current = false;
  };

  const announceTicketBilingual = async (
    ticketNumber: number,
    assistantName?: string,
  ) => {
    await playNotificationSound();

    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const formatted = formatTicket(ticketNumber);
    const guichetNumber = assistantName ? assistantName.replace(/\D/g, "") : "";

    const frText = guichetNumber
      ? `Numéro ${formatted}, veuillez vous rendre au box numéro ${guichetNumber}`
      : `Numéro ${formatted}, veuillez vous rendre au box ${assistantName || ""}`;

    const enText = guichetNumber
      ? `Ticket number ${formatted}, please proceed to box number ${guichetNumber}`
      : `Ticket number ${formatted}, please proceed to box number ${assistantName || ""}`;

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

    await speakWithPromise(frText, "fr-FR", preferredFrVoice);
    await speakWithPromise(frText, "fr-FR", preferredFrVoice);

    await speakWithPromise(enText, "en-US", enVoiceRef.current);
    await speakWithPromise(enText, "en-US", enVoiceRef.current);
  };

  useEffect(() => {
    const unsubscribeState = onSnapshot(
      doc(db, "queue_state", "current"),
      (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const newNumber = data.currentNumber;

        if (newNumber !== null && newNumber !== previousNumberRef.current) {
          const assistantId = data.currentAssistantId;
          const assistant = assistantsRef.current.find(
            (a) => a.id === assistantId,
          );

          if (assistant?.name) {
            announcementQueueRef.current.push({
              ticketNumber: newNumber,
              assistantName: assistant.name,
            });
            processQueue();
          } else {
            setTimeout(() => {
              const retryAssistant = assistantsRef.current.find(
                (a) => a.id === assistantId,
              );
              announcementQueueRef.current.push({
                ticketNumber: newNumber,
                assistantName: retryAssistant?.name || "Guichet",
              });
              processQueue();
            }, 500);
          }

          setIsNewNumber(true);
          setTimeout(() => setIsNewNumber(false), 6000);
        }

        previousNumberRef.current = newNumber;

        setCurrentState({
          id: docSnap.id,
          currentNumber: newNumber,
          nextNumber: data.nextNumber,
          currentAssistantId: data.currentAssistantId || null,
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      },
    );

    const unsubscribeAssistants = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as User)
          .filter((user) => user.role === "assistant");
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

  const currentAssistant = assistants.find(
    (a) => a.id === currentState?.currentAssistantId,
  );

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
      <header className="flex justify-between items-center mb-10">
        <div className="bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/20">
          <Image
            src={images.iomlogo}
            width={180}
            height={60}
            alt="logo"
            className="brightness-0 invert"
          />
        </div>

        {/* Bloc Spécial Affichage TV / Projection (Non cliquable, lisibilité maximale) */}
        <div className="flex items-center gap-6 px-8 py-5 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 backdrop-blur-xl rounded-3xl border-2 border-blue-400/40 shadow-2xl shadow-blue-500/10">
          {/* Icône Smartphone + Saisie (parfait pour comprendre qu'il faut sortir son téléphone) */}
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
            {/* Instruction textuelle ultra-directive pour le spectateur */}
            <span className="text-xs font-black uppercase tracking-widest text-yellow-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
              Pour donner votre avis, tapez l'adresse :
            </span>

            {/* L'URL formatée comme une vraie barre de recherche / navigateur */}
            <div className="flex items-center gap-3 px-5 py-3 bg-black/60 rounded-2xl border border-white/20 shadow-inner">
              {/* Le protocole web pour déclencher le réflexe "site internet" dans le cerveau */}
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
      <main className="flex-1 grid grid-cols-12 gap-8 mb-6 overflow-hidden">
        {/* Ticket Actuel */}
        <motion.div
          animate={
            isNewNumber
              ? {
                  scale: [1, 1.02, 1],
                  transition: { duration: 0.5, repeat: 5 },
                }
              : {}
          }
          className="col-span-12 lg:col-span-5 h-full"
        >
          <Card className="h-full bg-white border-0 shadow-2xl rounded-[4rem] overflow-hidden relative flex flex-col">
            <div className="absolute top-0 left-0 w-full h-4 bg-blue-600" />
            <div className="p-12 flex flex-col h-full">
              <span className="text-blue-600 uppercase tracking-widest font-black text-xl mb-4">
                Ticket Actuel / Current Ticket
              </span>

              <div className="flex-1 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentState?.currentNumber}
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-[12rem] xl:text-[18rem] leading-none font-black text-blue-600 tabular-nums"
                  >
                    {currentState?.currentNumber != null
                      ? formatTicket(currentState.currentNumber)
                      : "--"}
                  </motion.div>
                </AnimatePresence>
              </div>

              {currentAssistant && (
                <div className="mt-6 pt-10 border-t-2 border-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-xl uppercase text-slate-400 font-black">
                      Allez au guichet / Go to
                    </p>
                    <p className="text-5xl font-black text-slate-800">
                      {currentAssistant?.name}
                    </p>
                  </div>
                  <div
                    className="h-24 w-24 rounded-2xl flex items-center justify-center text-white text-4xl font-black shadow-xl"
                    style={{
                      backgroundColor: currentAssistant?.color || "#3b82f6",
                    }}
                  >
                    {currentAssistant?.name.match(/\d+/) || "!"}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Prochain Ticket */}
        <Card className="col-span-12 lg:col-span-3 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-[4rem] overflow-hidden flex flex-col p-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ArrowRight className="w-6 h-6 text-white/50" />
            <span className="text-white/60 uppercase font-bold text-xl">
              Suivant / Next
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[8rem] leading-none font-black text-white/40 tabular-nums">
              {currentState?.nextNumber != null
                ? formatTicket(currentState.nextNumber)
                : "--"}
            </div>
          </div>
          <p className="text-white/50 text-xl font-bold italic">
            Préparez-vous / Get ready
          </p>
        </Card>
        <Card className="col-span-12 lg:col-span-4 border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white/10 backdrop-blur-xl border-white/20">
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
                    <h3 className="text-center text-white text-lg font-semibold leading-relaxed">
                      {carouselData[currentImageIndex].title}
                    </h3>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
            {/* Pagination */}
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
