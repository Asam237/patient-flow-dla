"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  addNumberToQueue,
  deleteQueueNumber,
  resetQueue,
  formatNumberToCode,
} from "@/lib/queue-service";
import { addNewQueueNumber } from "@/lib/queue-hooks";
import { createAssistantAccount, signOut } from "@/lib/auth-service";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  RotateCcw,
  UserPlus,
  Circle,
  LogOut,
  Loader2,
  Monitor,
  LayoutDashboard,
  Hash,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { QueueNumber, QueueState, User } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AnalyticsPanel } from "@/components/analytics-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Block = "block a" | "block b";

function BlockQueueList({
  label,
  color,
  numbers,
  inputValue,
  onInputChange,
  onRangeAdd,
  loading,
  assistants,
  onDelete,
}: {
  label: string;
  color: "indigo" | "cyan";
  numbers: QueueNumber[];
  inputValue: { start: string; end: string };
  onInputChange: (v: { start: string; end: string }) => void;
  onRangeAdd: () => void;
  loading: boolean;
  assistants: any[];
  onDelete: (id: string) => void;
}) {
  const btnBg =
    color === "indigo"
      ? "bg-indigo-600 hover:bg-indigo-700"
      : "bg-cyan-600 hover:bg-cyan-700";

  return (
    <Card className="border-none shadow-xl shadow-indigo-900/5 bg-white rounded-[2rem] overflow-hidden">
      <CardContent className="p-8 space-y-6">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <Label className="text-slate-600 font-semibold mb-3 block">
            {label} — Issue Tickets (Range)
          </Label>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Input
                type="text"
                placeholder="Start"
                value={inputValue.start}
                onChange={(e) =>
                  onInputChange({ ...inputValue, start: e.target.value })
                }
                className="h-14 text-lg rounded-xl w-24"
              />
              <span className="text-slate-400 font-bold">→</span>
              <Input
                type="number"
                placeholder="End"
                value={inputValue.end}
                onChange={(e) =>
                  onInputChange({ ...inputValue, end: e.target.value })
                }
                className="h-14 text-lg rounded-xl w-24"
              />
              <Button
                variant="outline"
                onClick={onRangeAdd}
                disabled={loading}
                className="h-14 px-6 rounded-xl"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Range
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Enter the same number in both fields to add a single ticket.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 px-1">
            {label} — Active Numbers
            <Badge variant="outline" className="ml-2 bg-slate-50">
              {numbers.length}
            </Badge>
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
            {numbers.map((num) => {
              const numAssistant = assistants.find(
                (a) => a.id === num.assistantId,
              );
              return (
                <div
                  key={num.id}
                  className="group flex flex-col p-4 bg-white border border-slate-100 rounded-2xl hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-black text-slate-900 tracking-tighter">
                      {formatNumberToCode(num.number)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(num.id)}
                      className="h-8 w-8 text-slate-200 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Badge
                    className={`w-fit text-[10px] uppercase font-bold py-0.5 rounded-md border-none mb-3 ${
                      num.status === "current"
                        ? "bg-green-500"
                        : num.status === "waiting"
                          ? "bg-amber-500"
                          : "bg-slate-300"
                    }`}
                  >
                    {num.status === "current"
                      ? "Serving"
                      : num.status === "waiting"
                        ? "Waiting"
                        : "Completed"}
                  </Badge>
                  {numAssistant && (
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-50">
                      <Circle
                        className="w-2 h-2"
                        fill={numAssistant.color}
                        color={numAssistant.color}
                      />
                      <span className="text-[11px] font-medium text-slate-500 truncate italic">
                        {numAssistant.name}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [newNumberA, setNewNumberA] = useState({ start: "", end: "" });
  const [newNumberB, setNewNumberB] = useState({ start: "", end: "" });
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);
  const [currentState, setCurrentState] = useState<QueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [assistants, setAssistants] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics">(
    "dashboard",
  );
  const [showAssistantDialog, setShowAssistantDialog] = useState(false);
  const [newAssistant, setNewAssistant] = useState({
    email: "",
    password: "",
    name: "",
    block: "block a" as Block,
    startNumber: "",
  });
  const { toast } = useToast();

  // États pour le dialogue de conflit
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictNumbers, setConflictNumbers] = useState<number[]>([]);
  const [pendingRange, setPendingRange] = useState<{
    start: number;
    end: number;
    block: Block;
  } | null>(null);

  const assistantColors = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#f97316",
  ];

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
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
      const assistantsList: User[] = snapshot.docs
        .map((doc) => {
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
        })
        .filter((u) => u.role === "assistant");
      setAssistants(assistantsList);
    });

    return () => {
      unsubscribeNumbers();
      unsubscribeState();
      unsubscribeUsers();
    };
  }, [user]);

  // Ajouter une plage pour un bloc donné avec gestion des conflits
  async function handleAddRange(block: Block, start: number, end: number) {
    if (isNaN(start) || isNaN(end) || start < 0 || end < 0 || start > end) {
      toast({
        title: "Invalid range",
        description: "Please enter valid numbers (start ≤ end).",
        variant: "destructive",
      });
      return;
    }

    // Vérifier les numéros existants dans ce même bloc
    const existingInSameBlock = queueNumbers.filter(
      (n) =>
        n.block === block &&
        n.number >= start &&
        n.number <= end &&
        n.status !== "completed",
    );
    if (existingInSameBlock.length > 0) {
      toast({
        title: "Some tickets already exist in this block",
        description: `The following numbers will be skipped: ${existingInSameBlock.map((n) => n.number).join(", ")}`,
        variant: "default",
      });
    }

    // Vérifier les conflits dans l'autre bloc
    const otherBlock = block === "block a" ? "block b" : "block a";
    const conflictingNumbers = queueNumbers
      .filter(
        (n) =>
          n.block === otherBlock &&
          n.number >= start &&
          n.number <= end &&
          n.status !== "completed",
      )
      .map((n) => n.number);

    if (conflictingNumbers.length > 0) {
      // Ouvrir le dialogue de conflit
      setConflictNumbers(conflictingNumbers);
      setPendingRange({ start, end, block });
      setConflictDialogOpen(true);
      return;
    }

    // Pas de conflit : ajouter directement la plage (en ignorant les doublons dans le même bloc)
    await addNumbersToBlock(
      block,
      start,
      end,
      existingInSameBlock.map((n) => n.number),
    );
  }

  // Ajout effectif des numéros (après résolution de conflit ou directement)
  async function addNumbersToBlock(
    block: Block,
    start: number,
    end: number,
    skipNumbers: number[] = [],
  ) {
    try {
      setLoading(true);
      let added = 0;
      for (let num = start; num <= end; num++) {
        if (skipNumbers.includes(num)) continue;
        // Vérification de sécurité (si un numéro a été ajouté entre temps)
        const alreadyExists = queueNumbers.some(
          (n) => n.number === num && n.status !== "completed",
        );
        if (alreadyExists) continue;
        await addNumberToQueue(num, block);
        added++;
      }
      if (added > 0) {
        toast({
          title: "Success",
          description: `${added} ticket${added > 1 ? "s" : ""} added to ${block.toUpperCase()}.`,
        });
      } else {
        toast({
          title: "No new tickets",
          description: "All numbers in the range already exist.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not add tickets.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  // Résoudre le conflit : supprimer les numéros de l'autre bloc et ajouter au bloc cible
  async function handleResolveConflict() {
    if (!pendingRange) return;
    const { start, end, block } = pendingRange;
    try {
      setLoading(true);
      setConflictDialogOpen(false);

      // Supprimer les numéros en conflit (dans l'autre bloc)
      const otherBlock = block === "block a" ? "block b" : "block a";
      const toDelete = queueNumbers.filter(
        (n) =>
          n.block === otherBlock &&
          n.number >= start &&
          n.number <= end &&
          n.status !== "completed",
      );
      for (const item of toDelete) {
        await deleteQueueNumber(item.id);
      }

      // Ajouter au bloc cible (en ignorant les éventuels doublons résiduels)
      await addNumbersToBlock(block, start, end, []);

      toast({
        title: "Conflict resolved",
        description: `Tickets moved from ${otherBlock.toUpperCase()} to ${block.toUpperCase()}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not resolve conflict.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setPendingRange(null);
    }
  }

  function handleCancelConflict() {
    setConflictDialogOpen(false);
    setPendingRange(null);
  }

  // Fonctions existantes
  async function handleAddNumber(block: Block) {
    try {
      setLoading(true);
      const ticket = await addNewQueueNumber(block);
      toast({
        title: "Success",
        description: `Ticket ${formatNumberToCode(ticket.number)} added to ${block.toUpperCase()}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  // Remplacer l'ancienne handleAddCustomNumber par handleAddRangeFromInput
  function handleAddRangeFromInput(
    block: Block,
    input: { start: string; end: string },
  ) {
    const start = parseInt(input.start);
    const end = parseInt(input.end);
    if (isNaN(start) || isNaN(end)) {
      toast({
        title: "Invalid numbers",
        description: "Please enter valid numbers.",
        variant: "destructive",
      });
      return;
    }
    handleAddRange(block, start, end);
  }

  async function handleDelete(id: string) {
    try {
      await deleteQueueNumber(id);
      toast({ title: "Deleted", description: "Number removed" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Deletion failed",
        variant: "destructive",
      });
    }
  }

  async function handleReset() {
    if (confirm("Are you sure? This will clear all data for both blocks.")) {
      try {
        setLoading(true);
        await resetQueue();
        toast({ title: "Reset Complete" });
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Reset failed",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleCreateAssistant() {
    if (!newAssistant.email || !newAssistant.password || !newAssistant.name)
      return;
    try {
      setLoading(true);
      const color = assistantColors[assistants.length % assistantColors.length];
      const startNumber = newAssistant.startNumber
        ? parseInt(newAssistant.startNumber)
        : newAssistant.block === "block b"
          ? 100
          : 0;
      await createAssistantAccount(
        newAssistant.email,
        newAssistant.password,
        newAssistant.name,
        color,
        startNumber,
      );
      setNewAssistant({
        email: "",
        password: "",
        name: "",
        block: "block a",
        startNumber: "",
      });
      setShowAssistantDialog(false);
      toast({ title: "Success", description: "Assistant account created" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Email might be in use",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const numbersA = queueNumbers.filter(
    (n) => (n.block || "block a").toLowerCase() === "block a",
  );
  const numbersB = queueNumbers.filter(
    (n) => (n.block || "").toLowerCase() === "block b",
  );
  const assistantsA = assistants.filter(
    (a) => (a.block || "block a").toLowerCase() === "block a",
  );
  const assistantsB = assistants.filter(
    (a) => (a.block || "").toLowerCase() === "block b",
  );
  const currentAssistantA = assistants.find(
    (a) => a.id === currentState?.currentAssistantIdA,
  );
  const currentAssistantB = assistants.find(
    (a) => a.id === currentState?.currentAssistantIdB,
  );

  function BlockStatusCard({
    label,
    color,
    currentNumber,
    nextNumber,
    currentAssistant,
  }: {
    label: string;
    color: "indigo" | "cyan";
    currentNumber: number | null | undefined;
    nextNumber: number | null | undefined;
    currentAssistant?: User;
  }) {
    const bg = color === "indigo" ? "bg-indigo-50/50" : "bg-cyan-50/50";
    const border = color === "indigo" ? "border-indigo-100" : "border-cyan-100";
    const text = color === "indigo" ? "text-indigo-900" : "text-cyan-900";
    const accent = color === "indigo" ? "text-indigo-600" : "text-cyan-600";
    return (
      <div
        className={`text-center p-8 ${bg} rounded-[2rem] border ${border} relative overflow-hidden`}
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Hash size={80} />
        </div>
        <p
          className={`text-xs font-bold ${accent} uppercase tracking-widest mb-1`}
        >
          {label} — Serving Now
        </p>
        <p className={`text-7xl font-black ${text} mb-4 tracking-tighter`}>
          {currentNumber != null ? formatNumberToCode(currentNumber) : "—"}
        </p>
        {currentAssistant && (
          <Badge
            variant="secondary"
            className="px-4 py-1.5 rounded-full bg-white shadow-sm border-slate-100 text-slate-700"
          >
            <Circle
              className="w-2 h-2 mr-2"
              fill={currentAssistant.color}
              color={currentAssistant.color}
            />
            {currentAssistant.name}
          </Badge>
        )}
        <div className="flex items-center justify-center mt-4 p-4 bg-white/70 rounded-2xl border border-white">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Next Up
            </p>
            <p className="text-xl font-bold text-slate-700">
              {nextNumber != null ? formatNumberToCode(nextNumber) : "--"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky z-50 top-0 left-0">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200">
              <LayoutDashboard className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Admin Command Center
              </h1>
              <p className="text-slate-500 text-sm">
                Welcome back, {user.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => window.open("/display", "_blank")}
              className="rounded-xl"
            >
              <Monitor className="w-4 h-4 mr-2" /> Public Screen
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-red-500 hover:bg-red-50 rounded-xl"
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        {/* Onglets de Navigation */}
        <div className="flex gap-2 bg-white p-1.5 rounded-2xl w-fit border border-slate-100 shadow-sm">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "dashboard"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Statistics
          </button>
        </div>

        {activeTab === "dashboard" ? (
          <>
            {/* Live Status — Block A & Block B side by side */}
            <Card className="border-none shadow-xl shadow-indigo-900/5 bg-white overflow-hidden rounded-3xl">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-slate-800 text-lg flex items-center gap-2">
                  <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                  Live Status — Both Blocks
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-8">
                <div className="grid md:grid-cols-2 gap-6">
                  <BlockStatusCard
                    label="Block A"
                    color="indigo"
                    currentNumber={currentState?.currentNumberA}
                    nextNumber={currentState?.nextNumberA}
                    currentAssistant={currentAssistantA}
                  />
                  <BlockStatusCard
                    label="Block B"
                    color="cyan"
                    currentNumber={currentState?.currentNumberB}
                    nextNumber={currentState?.nextNumberB}
                    currentAssistant={currentAssistantB}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Team Management */}
            <Card className="border-none shadow-xl shadow-indigo-900/5 bg-white rounded-3xl">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <CardTitle className="text-slate-800">
                    Team Management
                  </CardTitle>
                  <CardDescription>
                    Manage your clinical assistants per block
                  </CardDescription>
                </div>
                <Dialog
                  open={showAssistantDialog}
                  onOpenChange={setShowAssistantDialog}
                >
                  <DialogTrigger asChild>
                    <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md">
                      <UserPlus className="w-4 h-4 mr-2" /> New Assistant
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-[2rem]">
                    <DialogHeader>
                      <DialogTitle>Add Assistant</DialogTitle>
                      <DialogDescription>
                        Create a new access account for clinical staff.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          placeholder="Name"
                          value={newAssistant.name}
                          onChange={(e) =>
                            setNewAssistant({
                              ...newAssistant,
                              name: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@clinic.com"
                          value={newAssistant.email}
                          onChange={(e) =>
                            setNewAssistant({
                              ...newAssistant,
                              email: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Security Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Min. 6 chars"
                          value={newAssistant.password}
                          onChange={(e) =>
                            setNewAssistant({
                              ...newAssistant,
                              password: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Block Assignment</Label>
                        <div className="flex gap-2">
                          {(["block a", "block b"] as Block[]).map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() =>
                                setNewAssistant({ ...newAssistant, block: b })
                              }
                              className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                                newAssistant.block === b
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white text-slate-500 border-slate-200"
                              }`}
                            >
                              {b.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="startNumber">
                          Starting Number (optional)
                        </Label>
                        <Input
                          id="startNumber"
                          type="number"
                          placeholder={
                            newAssistant.block === "block b"
                              ? "e.g. 100"
                              : "e.g. 0"
                          }
                          value={newAssistant.startNumber}
                          onChange={(e) =>
                            setNewAssistant({
                              ...newAssistant,
                              startNumber: e.target.value,
                            })
                          }
                        />
                      </div>
                      <Button
                        onClick={handleCreateAssistant}
                        disabled={loading}
                        className="w-full bg-indigo-600 rounded-xl py-6 text-lg"
                      >
                        {loading ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          "Verify & Create Account"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3 px-1">
                      Block A Team
                    </h4>
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
                      {assistantsA.map((assistant) => (
                        <AssistantRow
                          key={assistant.id}
                          assistant={assistant}
                          onDelete={() => handleDelete(assistant.id)}
                        />
                      ))}
                      {assistantsA.length === 0 && (
                        <p className="text-sm text-slate-400 px-1">
                          No assistants assigned yet
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-cyan-600 uppercase tracking-widest mb-3 px-1">
                      Block B Team
                    </h4>
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
                      {assistantsB.map((assistant) => (
                        <AssistantRow
                          key={assistant.id}
                          assistant={assistant}
                          onDelete={() => handleDelete(assistant.id)}
                        />
                      ))}
                      {assistantsB.length === 0 && (
                        <p className="text-sm text-slate-400 px-1">
                          No assistants assigned yet
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Format Documentation */}
            <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-100">
              <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-3">
                Ticket Numbering System
              </h3>
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-bold text-indigo-700">Block A</span> :
                  Tickets <span className="font-semibold">A00 - A99</span>{" "}
                  (numbers 0–99)
                </p>
                <p>
                  <span className="font-bold text-cyan-700">Block B</span> :
                  Tickets <span className="font-semibold">B00 - B99</span>{" "}
                  (numbers 100–199)
                </p>
                <div className="pt-2 text-xs text-slate-500 border-t border-indigo-100">
                  Each block manages its own independent queue and counter.
                </div>
              </div>
            </div>

            {/* Queue Operations — Block A & Block B */}
            <div className="grid lg:grid-cols-2 gap-6">
              <BlockQueueList
                label="Bloc A"
                color="indigo"
                numbers={numbersA}
                inputValue={newNumberA}
                onInputChange={setNewNumberA}
                onRangeAdd={() =>
                  handleAddRangeFromInput("block a", newNumberA)
                }
                loading={loading}
                assistants={assistants}
                onDelete={handleDelete}
              />
              <BlockQueueList
                label="Bloc B"
                color="cyan"
                numbers={numbersB}
                inputValue={newNumberB}
                onInputChange={setNewNumberB}
                onRangeAdd={() =>
                  handleAddRangeFromInput("block b", newNumberB)
                }
                loading={loading}
                assistants={assistants}
                onDelete={handleDelete}
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={loading}
                className="h-12 px-8 bg-red-600 hover:bg-red-700 text-white rounded-xl"
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Reset Entire Queue
              </Button>
            </div>
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <AnalyticsPanel
              queueNumbers={queueNumbers}
              assistants={assistants}
            />
          </div>
        )}
      </div>
      <p className="text-center mt-10 text-gray-900 text-xs">
        &copy; {new Date().getFullYear()} - International Organization for
        Migration
      </p>

      {/* Dialogue de conflit */}
      <AlertDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Conflict Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following ticket numbers already exist in the other block:
              <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="font-mono text-lg font-bold text-red-700">
                  {conflictNumbers.join(", ")}
                </p>
              </div>
              <p className="mt-2">
                Would you like to remove them from the other block ?
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Range : {pendingRange?.start} → {pendingRange?.end} in{" "}
                {pendingRange?.block?.toUpperCase()}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConflict}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResolveConflict}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AssistantRow({
  assistant,
  onDelete,
}: {
  assistant: User;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-2xl hover:border-indigo-200 group">
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: assistant.color }}
        >
          {assistant.name.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-slate-800 leading-tight">
            {assistant.name}
          </p>
          <p className="text-xs text-slate-500">{assistant.email}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
