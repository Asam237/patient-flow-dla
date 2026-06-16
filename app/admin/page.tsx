"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  addNumberToQueue,
  deleteQueueNumber,
  resetQueue,
} from "@/lib/queue-service";
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
  Users,
  UserPlus,
  Circle,
  LogOut,
  Loader2,
  Monitor,
  LayoutDashboard,
  Hash,
  BarChart3,
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
import { formatTicket, parseTicket } from "@/lib/utils";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectContent } from "@radix-ui/react-select";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [newNumber, setNewNumber] = useState("");
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
    block: "",
  });
  const { toast } = useToast();

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

  async function handleFixTicket(customTicket: string) {
    try {
      const indexValue = parseTicket(customTicket);
      if (isNaN(indexValue)) {
        throw new Error("Format invalide (Ex: A01)");
      }
      setLoading(true);
      await addNumberToQueue(indexValue);
      setNewNumber("");
      toast({ title: "Succès", description: `Ticket ${customTicket} ajouté` });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

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
              status: data.status,
              assistantId: data.assistantId || null,
              assistantName: data.assistantName || null,
              createdAt: data.createdAt?.toDate() || new Date(),
              calledAt: data.calledAt?.toDate() || null,
              completedAt: data.completedAt?.toDate() || null,
              // Ajout crucial pour l'analyse
              serviceDurationSeconds: data.serviceDurationSeconds || null,
            };
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
            currentNumber: data.currentNumber,
            nextNumber: data.nextNumber,
            currentAssistantId: data.currentAssistantId || null,
            updatedAt: data.updatedAt?.toDate() || new Date(),
          });
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
            color: data.color,
            isActive: data.isActive,
            createdAt: data.createdAt?.toDate() || new Date(),
          };
        })
        .filter((user) => user.role === "assistant");
      setAssistants(assistantsList);
    });

    return () => {
      unsubscribeNumbers();
      unsubscribeState();
      unsubscribeUsers();
    };
  }, [user]);

  async function handleAddNumber() {
    if (!newNumber.trim()) return;
    const numberValue = parseInt(newNumber);
    try {
      setLoading(true);
      await addNumberToQueue(numberValue);
      setNewNumber("");
      toast({ title: "Success", description: `Ticket #${numberValue} added` });
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
    if (confirm("Are you sure? This will clear all data.")) {
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
    if (
      !newAssistant.email ||
      !newAssistant.password ||
      !newAssistant.name ||
      !newAssistant.block
    )
      return;
    try {
      setLoading(true);
      const color = assistantColors[assistants.length % assistantColors.length];
      await createAssistantAccount(
        newAssistant.email,
        newAssistant.password,
        newAssistant.name,
        newAssistant.block,
        color,
      );
      setNewAssistant({ email: "", password: "", name: "", block: "" });
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

  const waitingCount = queueNumbers.filter(
    (n) => n.status === "waiting",
  ).length;
  const currentAssistant = assistants.find(
    (a) => a.id === currentState?.currentAssistantId,
  );

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
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Status Panel */}
              <Card className="border-none shadow-xl shadow-indigo-900/5 bg-white overflow-hidden rounded-3xl">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                  <CardTitle className="text-slate-800 text-lg flex items-center gap-2">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                    Live Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-8 space-y-6">
                  <div className="text-center p-8 bg-indigo-50/50 rounded-[2rem] border border-indigo-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Hash size={80} />
                    </div>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
                      Serving Now
                    </p>
                    <p className="text-7xl font-black text-indigo-900 mb-4 tracking-tighter">
                      {currentState?.currentNumber != null
                        ? formatTicket(currentState.currentNumber)
                        : "—"}
                    </p>
                    {currentAssistant && (
                      <Badge
                        variant="secondary"
                        className="px-4 py-1.5 rounded-full bg-white shadow-sm border-indigo-100 text-indigo-700"
                      >
                        <Circle
                          className="w-2 h-2 mr-2"
                          fill={currentAssistant.color}
                          color={currentAssistant.color}
                        />
                        {currentAssistant.name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Next Up
                      </p>
                      <p className="text-2xl font-bold text-slate-700">
                        {currentState?.nextNumber != null
                          ? formatTicket(currentState.nextNumber)
                          : "--"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Assistant Management */}
              <Card className="border-none shadow-xl shadow-indigo-900/5 bg-white rounded-3xl lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-6">
                  <div>
                    <CardTitle className="text-slate-800">
                      Team Management
                    </CardTitle>
                    <CardDescription>
                      Manage your clinical assistants
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
                          <Label htmlFor="block">Block</Label>
                          <Select
                            value={newAssistant.block}
                            onValueChange={(value) =>
                              setNewAssistant({
                                ...newAssistant,
                                block: value,
                              })
                            }
                          >
                            <SelectTrigger id="block">
                              <SelectValue placeholder="Sélectionnez un block" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="block A">Block A</SelectItem>
                              <SelectItem value="block B">Block B</SelectItem>
                            </SelectContent>
                          </Select>
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
                  <div className="grid sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                    {assistants.map((assistant) => (
                      <div
                        key={assistant.id}
                        className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-2xl hover:border-indigo-200 group"
                      >
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
                            <p className="text-xs text-slate-500">
                              {assistant.email}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(assistant.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Queue Operations */}
            <Card className="border-none shadow-xl shadow-indigo-900/5 bg-white rounded-[2rem] overflow-hidden">
              <CardContent className="p-8 space-y-8">
                {/* Ticket Format Documentation */}
                <div className="mb-6 p-5 rounded-2xl bg-indigo-50 border border-indigo-100">
                  <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-3">
                    Ticket Numbering System
                  </h3>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p>
                      <span className="font-bold text-indigo-700">A</span> :
                      Tickets from <span className="font-semibold">0 - 99</span>
                    </p>
                    <p>
                      <span className="font-bold text-indigo-700">B</span> :
                      Tickets from{" "}
                      <span className="font-semibold">100 - 199</span>
                    </p>
                    <p>
                      <span className="font-bold text-indigo-700">C</span> :
                      Tickets from{" "}
                      <span className="font-semibold">200 - 299</span>
                    </p>
                    <p>
                      <span className="font-bold text-indigo-700">D</span> :
                      Tickets from{" "}
                      <span className="font-semibold">300 - 399</span>
                    </p>
                    <p>
                      <span className="font-bold text-indigo-700">E</span> :
                      Tickets from{" "}
                      <span className="font-semibold">400 - 499</span>
                    </p>
                    <p>
                      <span className="font-bold text-indigo-700">F</span> :
                      Tickets from{" "}
                      <span className="font-semibold">500 - 599</span>
                    </p>
                    <div className="pt-2 text-xs text-slate-500 border-t border-indigo-100">
                      Example:
                      <span className="font-mono ml-1">A01</span>,
                      <span className="font-mono ml-1">A45</span>,
                      <span className="font-mono ml-1">B12</span>,
                      <span className="font-mono ml-1">C78</span>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <Label className="text-slate-600 font-semibold mb-3 block">
                    Quick Add / Start Queue
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="number"
                      placeholder="Enter starting number"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleAddNumber()}
                      className="h-14 text-lg rounded-xl"
                    />
                    <Button
                      onClick={handleAddNumber}
                      disabled={loading}
                      className="h-14 px-8 bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                    >
                      <Plus className="w-5 h-5 mr-2" /> Issue Ticket
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={loading}
                      className="h-14 px-8 bg-red-600 hover:bg-red-700 text-white rounded-xl"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" /> Reset
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 px-1">
                    Active Numbers List
                    <Badge variant="outline" className="ml-2 bg-slate-50">
                      {queueNumbers.length}
                    </Badge>
                  </h3>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-2">
                    {queueNumbers.map((num) => {
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
                              #{formatTicket(num?.number)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(num.id)}
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
          </>
        ) : (
          /* Intégration du panel analytics */
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
    </div>
  );
}
