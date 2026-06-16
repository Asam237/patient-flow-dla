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
import {
  createAssistantAccount,
  getAllAssistants,
  deleteAssistant,
  signOut,
} from "@/lib/auth-service";
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

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [newNumber, setNewNumber] = useState("");
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);
  const [currentState, setCurrentState] = useState<QueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [assistants, setAssistants] = useState<User[]>([]);
  const [showAssistantDialog, setShowAssistantDialog] = useState(false);
  const [newAssistant, setNewAssistant] = useState({
    email: "",
    password: "",
    name: "",
  });
  const { toast } = useToast();

  const assistantColors = [
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
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
              status: data.status,
              assistantId: data.assistantId || null,
              assistantName: data.assistantName || null,
              createdAt: data.createdAt?.toDate() || new Date(),
              calledAt: data.calledAt?.toDate() || null,
              completedAt: data.completedAt?.toDate() || null,
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
    if (!newNumber.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un numéro",
        variant: "destructive",
      });
      return;
    }

    const numberValue = parseInt(newNumber);
    if (isNaN(numberValue) || numberValue < 1) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un numéro valide",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await addNumberToQueue(numberValue);
      setNewNumber("");
      toast({
        title: "Succès",
        description: `Numéro ${numberValue} ajouté à la file d'attente`,
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'ajouter le numéro",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteQueueNumber(id);
      toast({
        title: "Succès",
        description: "Numéro supprimé",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer le numéro",
        variant: "destructive",
      });
    }
  }

  async function handleReset() {
    if (
      confirm(
        "Êtes-vous sûr de vouloir réinitialiser toute la file d'attente ?",
      )
    ) {
      try {
        setLoading(true);
        await resetQueue();
        toast({
          title: "Succès",
          description: "File d'attente réinitialisée",
        });
      } catch (error: any) {
        toast({
          title: "Erreur",
          description: error.message || "Impossible de réinitialiser",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleCreateAssistant() {
    if (!newAssistant.email || !newAssistant.password || !newAssistant.name) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      });
      return;
    }

    if (newAssistant.password.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const color = assistantColors[assistants.length % assistantColors.length];
      await createAssistantAccount(
        newAssistant.email,
        newAssistant.password,
        newAssistant.name,
        color,
      );
      setNewAssistant({ email: "", password: "", name: "" });
      setShowAssistantDialog(false);
      toast({
        title: "Succès",
        description: `Compte assistant créé pour ${newAssistant.name}`,
      });
    } catch (error: any) {
      let errorMessage = "Impossible de créer le compte";

      if (error.code === "auth/email-already-in-use") {
        errorMessage = "Cet email est déjà utilisé";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Adresse email invalide";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Mot de passe trop faible";
      }

      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAssistant(userId: string) {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce compte assistant ?")) {
      try {
        await deleteAssistant(userId);
        toast({
          title: "Succès",
          description: "Compte assistant supprimé",
        });
      } catch (error: any) {
        toast({
          title: "Erreur",
          description: error.message || "Impossible de supprimer le compte",
          variant: "destructive",
        });
      }
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      router.push("/login");
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Erreur lors de la déconnexion",
        variant: "destructive",
      });
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">
              Tableau de Bord Admin
            </h1>
            <p className="text-blue-600 mt-1">Bienvenue {user.name}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.open("/display", "_blank")}
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              Affichage Public
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="gap-2 text-red-600 hover:text-red-700"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-blue-200 shadow-lg">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-900">État Actuel</CardTitle>
              <CardDescription>Numéros en cours et suivant</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="text-center p-8 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 mb-2">Numéro Actuel</p>
                <p className="text-6xl font-bold text-blue-900 mb-2">
                  {currentState?.currentNumber || "-"}
                </p>
                {currentAssistant && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Circle
                      className="w-4 h-4"
                      fill={currentAssistant.color}
                      color={currentAssistant.color}
                    />
                    <span className="text-sm text-gray-600">
                      {currentAssistant.name}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-center p-6 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Prochain Numéro</p>
                <p className="text-4xl font-bold text-gray-700">
                  {currentState?.nextNumber || "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 shadow-lg">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-900">
                Gestion des Assistants
              </CardTitle>
              <CardDescription>
                Créer et gérer les comptes assistants
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <Dialog
                open={showAssistantDialog}
                onOpenChange={setShowAssistantDialog}
              >
                <DialogTrigger asChild>
                  <Button className="w-full h-12 bg-blue-600 hover:bg-blue-700">
                    <UserPlus className="w-5 h-5 mr-2" />
                    Créer un Compte Assistant
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Créer un Compte Assistant</DialogTitle>
                    <DialogDescription>
                      Créez un nouveau compte pour un assistant médical
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nom complet</Label>
                      <Input
                        id="name"
                        placeholder="Dr. Jean Dupont"
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
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="assistant@exemple.com"
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
                      <Label htmlFor="password">Mot de passe</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Min. 6 caractères"
                        value={newAssistant.password}
                        onChange={(e) =>
                          setNewAssistant({
                            ...newAssistant,
                            password: e.target.value,
                          })
                        }
                      />
                    </div>
                    <Button
                      onClick={handleCreateAssistant}
                      disabled={loading}
                      className="w-full"
                    >
                      Créer le Compte
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <h3 className="font-semibold text-sm text-gray-700">
                  Assistants Actifs ({assistants.length})
                </h3>
                {assistants.map((assistant) => (
                  <div
                    key={assistant.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Circle
                        className="w-4 h-4"
                        fill={assistant.color}
                        color={assistant.color}
                      />
                      <div>
                        <p className="font-medium">{assistant.name}</p>
                        <p className="text-xs text-gray-500">
                          {assistant.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAssistant(assistant.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {assistants.length === 0 && (
                  <p className="text-center text-gray-500 py-8 text-sm">
                    Aucun assistant créé
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-blue-200 shadow-lg">
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-blue-900">
              Gestion de la File d&apos;Attente
            </CardTitle>
            <CardDescription>
              Ajouter un numéro de départ - Les suivants seront générés
              automatiquement
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startNumber" className="text-sm text-gray-700">
                Numéro de départ (les numéros suivants seront créés
                automatiquement)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="startNumber"
                  type="number"
                  placeholder="Ex: 200"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddNumber()}
                  className="text-lg h-12"
                  min="1"
                />
                <Button
                  onClick={handleAddNumber}
                  disabled={loading}
                  className="h-12 px-6 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  En Attente: {waitingCount}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={loading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Réinitialiser
                </Button>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {queueNumbers.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    Aucun numéro dans la file
                  </p>
                ) : (
                  queueNumbers.map((num) => {
                    const numAssistant = assistants.find(
                      (a) => a.id === num.assistantId,
                    );
                    return (
                      <div
                        key={num.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold text-blue-900">
                            {num.number}
                          </span>
                          <Badge
                            variant={
                              num.status === "current"
                                ? "default"
                                : num.status === "waiting"
                                  ? "secondary"
                                  : "outline"
                            }
                            className={
                              num.status === "current"
                                ? "bg-blue-600"
                                : num.status === "waiting"
                                  ? "bg-yellow-500"
                                  : ""
                            }
                          >
                            {num.status === "current"
                              ? "En cours"
                              : num.status === "waiting"
                                ? "En attente"
                                : "Terminé"}
                          </Badge>
                          {numAssistant && (
                            <div className="flex items-center gap-1">
                              <Circle
                                className="w-3 h-3"
                                fill={numAssistant.color}
                                color={numAssistant.color}
                              />
                              <span className="text-xs text-gray-600">
                                {numAssistant.name}
                              </span>
                            </div>
                          )}
                        </div>
                        {num.status !== "current" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(num.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
