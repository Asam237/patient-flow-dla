"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import Image from "next/image";
import images from "@/assets/pictures";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  // Redirect if already logged in
  if (user) {
    const hasAdminAccess = user.role === "admin" || user.role === "dispatching";
    router.push(hasAdminAccess ? "/admin" : "/assistant");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Required fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await signIn(email, password);
      toast({ title: "Success", description: "Login successful" });

      setTimeout(() => {
        window.location.href = "/admin";
      }, 500);
    } catch (error: any) {
      const messages: Record<string, string> = {
        "auth/user-not-found": "Email ou mot de passe incorrect",
        "auth/wrong-password": "Email ou mot de passe incorrect",
        "auth/invalid-email": "Adresse email invalide",
        "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard",
      };

      toast({
        title: "Error",
        description: messages[error.code] || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0033A0] relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <div className="z-10 w-full max-w-md p-4">
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 mb-6">
            <Image
              src={images.iomlogo}
              width={200}
              height={50}
              alt="logo"
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Queue Management System
          </h1>
          <p className="text-blue-200/80 text-sm mt-1">Portal Access Control</p>
        </div>

        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-slate-800">
              Welcome Back
            </CardTitle>
            <CardDescription>
              Sign in to manage your workstation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@organization.org"
                    className="pl-10 h-11 border-slate-200 focus:ring-blue-500 transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10 h-11 border-slate-200 focus:ring-blue-500 transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-[#0033A0] hover:bg-[#00267a] text-white font-medium rounded-lg transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500">
                  Public Access
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => router.push("/display")}
              className="w-full h-11 border-slate-200 text-slate-600 hover:bg-slate-50 group transition-all"
            >
              View Public Display
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </CardContent>
        </Card>
        <p className="text-center mt-10 text-white text-xs">
          &copy; {new Date().getFullYear()} - International Organization for
          Migration
        </p>
      </div>
    </div>
  );
}
