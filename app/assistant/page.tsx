"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { callNextNumber, formatNumberToCode } from "@/lib/queue-service";
import { signOut } from "@/lib/auth-service";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Users,
  LogOut,
  Loader2,
  Circle,
  Monitor,
  ChevronRight,
  PhoneCall,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { QueueNumber, QueueState, User } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { AnalyticsPanel } from "@/components/analytics-panel";

export default function AssistantPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);
  const [currentState, setCurrentState] = useState<QueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [callingId, setCallingId] = useState<string | null>(null);
  const [assistants, setAssistants] = useState<User[]>([]);
  const { toast } = useToast();
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics">(
    "dashboard",
  );

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "assistant")) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;

    const unsubscribeNumbers = onSnapshot(
      collection(db, "queue_numbers"),
      (snapshot) => {
        const numbers: QueueNumber[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              number: data.number,
              block: (data.block as string) || "block a",
              status: data.status,
              assistantId: data.assistantId || null,
              assistantName: data.assistantName || null,
              createdAt: data.createdAt?.toDate() || new Date(),
              calledAt: data.calledAt?.toDate() || null,
              completedAt: data.completedAt?.toDate() || null,
              serviceDurationSeconds: data.serviceDurationSeconds || null,
            } as QueueNumber;
          })
          .sort((a, b) => a.number - b.number);
        setQueueNumbers(numbers);
      },
    );

    const unsubscribeState = onSnapshot(
      doc(db, "queue_state", "current"),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setCurrentState({
            id: doc.id,
            currentNumber: data.currentNumber ?? null,
            nextNumber: data.nextNumber ?? null,
            currentAssistantId: data.currentAssistantId || null,
            currentNumberA: data.currentNumberA ?? null,
            nextNumberA: data.nextNumberA ?? null,
            currentAssistantIdA: data.currentAssistantIdA || null,
            currentNumberB: data.currentNumberB ?? null,
            nextNumberB: data.nextNumberB ?? null,
            currentAssistantIdB: data.currentAssistantIdB || null,
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as QueueState);
        }
      },
    );

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const assistantsList: User[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email,
          name: data.name,
          role: data.role,
          block:
            data.block || (data.startNumber >= 100 ? "block b" : "block a"),
          startNumber: data.startNumber ?? 0,
          color: data.color,
          isActive: data.isActive,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as User;
      });
      setAssistants(assistantsList);
    });

    return () => {
      unsubscribeNumbers();
      unsubscribeState();
      unsubscribeUsers();
    };
  }, [user]);

  const myBlock = (user?.block || "block a").toLowerCase();
  const isBlockA = myBlock === "block a";
  const blockKey = isBlockA ? "A" : "B";
  const blockNumbers = queueNumbers.filter(
    (n) => (n.block || "block a").toLowerCase() === myBlock,
  );
  const waitingCount = blockNumbers.filter(
    (n) => n.status === "waiting",
  ).length;
  const blockCurrentNumber = isBlockA
    ? currentState?.currentNumberA
    : currentState?.currentNumberB;
  const blockNextNumber = isBlockA
    ? currentState?.nextNumberA
    : currentState?.nextNumberB;
  const blockCurrentAssistantId = isBlockA
    ? currentState?.currentAssistantIdA
    : currentState?.currentAssistantIdB;
  const currentAssistant = assistants.find(
    (a) => a.id === blockCurrentAssistantId,
  );
  const isMyTurn = user ? blockCurrentAssistantId === user.id : false;

  useEffect(() => {
    const currentTicket = blockNumbers.find((n) => n.status === "current");
    if (!currentTicket?.calledAt) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(
      Math.floor((Date.now() - currentTicket.calledAt.getTime()) / 1000),
    );
    const interval = setInterval(() => {
      setElapsedSeconds(
        Math.floor((Date.now() - currentTicket.calledAt!.getTime()) / 1000),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [queueNumbers, myBlock]);

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function markPreviousCompleted() {
    const currentTicket = blockNumbers.find((n) => n.status === "current");
    if (currentTicket?.calledAt) {
      const elapsedMs = Date.now() - currentTicket.calledAt.getTime();
      const elapsed = Math.floor(elapsedMs / 1000);
      const { doc: fsDoc, updateDoc } = await import("firebase/firestore");
      await updateDoc(fsDoc(db, "queue_numbers", currentTicket.id), {
        serviceDurationSeconds: elapsed,
      });
    }
  }

  async function handleCallNext() {
    if (!user) return;
    try {
      setLoading(true);
      await markPreviousCompleted();
      const { data: called, error } = await callNextNumber(
        user.id,
        user.name,
        undefined,
        myBlock,
      );
      if (error) throw new Error(error.message);
      if (called) {
        toast({
          title: "Number Called",
          description: `Ticket ${formatNumberToCode(called.number)} has been called successfully`,
        });
      } else {
        toast({
          title: "Info",
          description: "No tickets currently in the queue",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to call next number",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCallSpecific(ticketId: string) {
    if (!user) return;
    try {
      setCallingId(ticketId);
      await markPreviousCompleted();
      const { data: called, error } = await callNextNumber(
        user.id,
        user.name,
        ticketId,
        myBlock,
      );
      if (error) throw new Error(error.message);
      if (called) {
        toast({
          title: "Number Called",
          description: `Ticket ${formatNumberToCode(called.number)} has been called`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to call ticket",
        variant: "destructive",
      });
    } finally {
      setCallingId(null);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      router.push("/login");
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Logout failed",
        variant: "destructive",
      });
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-400 font-medium">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-50 sticky top-0 left-0">
          <div className="space-y-1">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">
              Assistant Dashboard
            </h1>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full w-fit shadow-sm">
              <Circle
                className="w-3 h-3 animate-pulse"
                fill={user.color}
                color={user.color}
              />
              <p className="text-sm font-bold text-slate-700">{user.name}</p>
              <Badge
                variant="secondary"
                className="text-[10px] uppercase tracking-wider"
              >
                Online
              </Badge>
              <Badge className="text-[10px] uppercase tracking-wider bg-slate-900 border-none">
                {myBlock.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => window.open("/display", "_blank")}
              className="bg-white hover:bg-slate-50 border-slate-200 shadow-sm gap-2"
            >
              <Monitor className="w-4 h-4" />
              Public Screen
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </header>

        {/* Onglets */}
        <div className="flex gap-2">
          {(["dashboard", "analytics"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-blue-600 text-white shadow"
                  : "bg-white text-slate-500 border border-slate-200 hover:text-slate-800"
              }`}
            >
              {tab === "dashboard" ? "Dashboard" : "Analyse"}
            </button>
          ))}
        </div>

        {/* Panel Dashboard */}
        {activeTab === "dashboard" && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-none shadow-xl shadow-blue-900/5 bg-white overflow-hidden">
                <CardHeader className="border-b border-slate-50 pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">
                        Queue Control — {myBlock.toUpperCase()}
                      </CardTitle>
                      <CardDescription>
                        Manage incoming visitors for your block
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="px-3 py-1">
                      {waitingCount} waiting
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="grid grid-cols-2 gap-8 mb-10">
                    <div className="relative group p-6 bg-blue-50/50 rounded-3xl border border-blue-100 transition-all hover:shadow-inner">
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-4">
                        Current Ticket
                      </p>
                      <p className="text-7xl font-black text-blue-900 tracking-tighter">
                        {blockCurrentNumber != null
                          ? formatNumberToCode(blockCurrentNumber)
                          : "--"}
                      </p>
                      {blockCurrentNumber != null && (
                        <div className="mt-3 flex items-center gap-2 bg-blue-100 rounded-full px-3 py-1.5 w-fit">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-sm font-bold text-blue-700 tabular-nums">
                            {formatDuration(elapsedSeconds)}
                          </span>
                        </div>
                      )}
                      {currentAssistant && (
                        <div className="mt-3 flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: currentAssistant.color }}
                          />
                          <span className="text-xs font-medium text-slate-500 truncate">
                            {isMyTurn
                              ? "Assigned to You"
                              : `Assigned to ${currentAssistant.name}`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                        Next in Line
                      </p>
                      <p className="text-7xl font-black text-slate-300 tracking-tighter">
                        {blockNextNumber != null
                          ? formatNumberToCode(blockNextNumber)
                          : "--"}
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleCallNext}
                    disabled={loading}
                    className="w-full h-20 text-xl font-bold rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="w-6 h-6 animate-spin mr-3" />
                    ) : (
                      <Bell className="w-6 h-6 mr-3" />
                    )}
                    {loading ? "Calling..." : "Call Next Client"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Queue */}
            <div className="lg:col-span-1">
              <Card className="h-full border-none shadow-xl shadow-blue-900/5 bg-white">
                <CardHeader className="border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg">
                      Live Queue — {myBlock.toUpperCase()}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
                    {blockNumbers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <Users className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-400">
                          Queue is empty
                        </p>
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {blockNumbers.map((num) => {
                          const numAssistant = assistants.find(
                            (a) => a.id === num.assistantId,
                          );
                          const isCurrent = num.status === "current";
                          const isWaiting = num.status === "waiting";
                          const isCompleted = num.status === "completed";

                          return (
                            <motion.div
                              key={num.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={`p-4 flex items-center justify-between transition-colors ${
                                isCurrent ? "bg-blue-50/30" : ""
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <span
                                  className={`text-xl font-black ${isCurrent ? "text-blue-600" : "text-slate-900"}`}
                                >
                                  {formatNumberToCode(num.number)}
                                </span>
                                <div className="flex flex-col gap-1">
                                  <Badge
                                    className={`text-[10px] w-fit uppercase px-1.5 py-0 border-none ${
                                      isCurrent
                                        ? "bg-blue-600"
                                        : isWaiting
                                          ? "bg-amber-500"
                                          : "bg-slate-400"
                                    }`}
                                  >
                                    {isCurrent
                                      ? "Serving"
                                      : isWaiting
                                        ? "Waiting"
                                        : "Done"}
                                  </Badge>
                                  {numAssistant && (
                                    <div className="flex items-center gap-1.5">
                                      <div
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{
                                          backgroundColor: numAssistant.color,
                                        }}
                                      />
                                      <span className="text-[11px] font-semibold text-slate-500">
                                        {numAssistant.id === user.id
                                          ? "Me"
                                          : numAssistant.name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isCompleted && num.serviceDurationSeconds && (
                                  <span className="text-[11px] text-slate-400 tabular-nums bg-slate-50 px-2 py-0.5 rounded-full">
                                    {formatDuration(num.serviceDurationSeconds)}
                                  </span>
                                )}
                                {isCurrent && isMyTurn && (
                                  <span className="text-[11px] text-blue-500 tabular-nums font-semibold">
                                    {formatDuration(elapsedSeconds)}
                                  </span>
                                )}
                                {isWaiting && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={callingId === num.id}
                                    onClick={() => handleCallSpecific(num.id)}
                                    className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                    title="Call this ticket"
                                  >
                                    {callingId === num.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <PhoneCall className="w-4 h-4" />
                                    )}
                                  </Button>
                                )}
                                <ChevronRight className="w-4 h-4 text-slate-200" />
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Panel Analytics */}
        {activeTab === "analytics" && (
          <AnalyticsPanel
            queueNumbers={blockNumbers}
            assistants={assistants.filter(
              (a) => (a.block || "block a").toLowerCase() === myBlock,
            )}
          />
        )}
      </div>
      <p className="text-center mt-10 text-gray-900 text-xs">
        &copy; {new Date().getFullYear()} - International Organization for
        Migration
      </p>
    </div>
  );
}
