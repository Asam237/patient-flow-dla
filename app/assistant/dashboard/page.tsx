"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  useQueueNumbers,
  callNextNumber,
  completeNumber,
  addNewQueueNumber,
} from "@/lib/queue-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhoneCall, CheckCircle, LogOut, Plus, User } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export default function AssistantDashboardPage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { queueNumbers, loading: queueLoading, refetch } = useQueueNumbers();
  const [calling, setCalling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && user.role !== "assistant" && user.role !== "admin") {
      router.push("/");
    }
  }, [user, router]);

  if (authLoading || queueLoading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  const myCurrentNumber = queueNumbers.find(
    (q) => q.status === "current" && q.assistantId === user.id,
  );
  const waitingNumbers = queueNumbers.filter((q) => q.status === "waiting");
  const completedNumbers = queueNumbers.filter((q) => q.status === "completed");
  const myCompletedNumbers = completedNumbers.filter(
    (q) => q.assistantId === user.id,
  );

  const handleCallNext = async () => {
    if (myCurrentNumber) {
      toast.error(
        "Veuillez compléter le numéro actuel avant d'appeler le suivant",
      );
      return;
    }

    setCalling(true);
    const { data, error } = await callNextNumber(user.id, user.name);

    if (error) {
      toast.error(error.message || "Erreur lors de l'appel du numéro");
    } else if (data) {
      toast.success(`Numéro ${data.number} appelé avec succès!`);
      await refetch();
    }
    setCalling(false);
  };

  const handleComplete = async () => {
    if (!myCurrentNumber) return;

    setCompleting(true);
    const { error } = await completeNumber(myCurrentNumber.id);

    if (error) {
      toast.error("Erreur lors de la complétion du numéro");
    } else {
      toast.success("Numéro traité avec succès!");
      await refetch();
    }
    setCompleting(false);
  };

  const handleAddNumber = async () => {
    setAdding(true);
    const { data, error }: any = await addNewQueueNumber();

    if (error) {
      toast.error("Erreur lors de l'ajout du numéro");
    } else if (data) {
      toast.success(`Numéro ${data.number} ajouté à la file`);
      await refetch();
    }
    setAdding(false);
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 md:p-8">
      <Toaster />
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Dashboard Assistant
            </h1>
            <p className="text-slate-600 flex items-center gap-2">
              <User className="w-4 h-4" />
              {user.name || user.email}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Déconnexion
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">En attente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-amber-600">
                {waitingNumbers.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Traités par vous</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-green-600">
                {myCompletedNumbers.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Total traités</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-blue-600">
                {completedNumbers.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {myCurrentNumber && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <AlertDescription className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-5xl font-bold text-green-600">
                  {myCurrentNumber.number.toString().padStart(3, "0")}
                </div>
                <div>
                  <p className="font-semibold text-green-900">
                    Vous recevez actuellement
                  </p>
                  <p className="text-sm text-green-700">
                    Cliquez sur &quot;Terminer&quot; une fois le service
                    complété
                  </p>
                </div>
              </div>
              <Button
                onClick={handleComplete}
                disabled={completing}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {completing ? "Traitement..." : "Terminer"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleCallNext}
                disabled={
                  calling || !!myCurrentNumber || waitingNumbers.length === 0
                }
                className="w-full"
                size="lg"
              >
                <PhoneCall className="w-5 h-5 mr-2" />
                {calling ? "Appel en cours..." : "Appeler le prochain numéro"}
              </Button>
              <Button
                onClick={handleAddNumber}
                disabled={adding}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Plus className="w-5 h-5 mr-2" />
                {adding ? "Ajout en cours..." : "Ajouter un nouveau numéro"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File d&apos;attente</CardTitle>
            </CardHeader>
            <CardContent>
              {waitingNumbers.length > 0 ? (
                <div className="space-y-2">
                  {waitingNumbers.slice(0, 8).map((number, index) => (
                    <div
                      key={number.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        index === 0
                          ? "bg-blue-50 border-2 border-blue-200"
                          : "bg-slate-50"
                      }`}
                    >
                      <span className="text-2xl font-bold text-slate-700">
                        {number.number.toString().padStart(3, "0")}
                      </span>
                      {index === 0 && (
                        <Badge className="bg-blue-600">Prochain</Badge>
                      )}
                    </div>
                  ))}
                  {waitingNumbers.length > 8 && (
                    <p className="text-sm text-slate-500 text-center pt-2">
                      +{waitingNumbers.length - 8} autres numéros
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-8">
                  Aucun numéro en attente
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Numéros traités aujourd&apos;hui par vous</CardTitle>
          </CardHeader>
          <CardContent>
            {myCompletedNumbers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {myCompletedNumbers.map((number) => (
                  <Badge
                    key={number.id}
                    variant="outline"
                    className="text-lg px-3 py-1"
                  >
                    {number.number.toString().padStart(3, "0")}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-4">
                Aucun numéro traité pour le moment
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
