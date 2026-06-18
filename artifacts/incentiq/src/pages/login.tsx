import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import logoFull from "/logo-full.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { label: "Super Admin",   email: "superadmin@commissionwallet.co.za", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { label: "Admin",         email: "admin@demo.co.za",                  color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  { label: "Manager",       email: "manager@demo.co.za",                color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { label: "Finance",       email: "finance@demo.co.za",                color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { label: "Sales Exec",    email: "sales@demo.co.za",                  color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { label: "Executive",     email: "executive@demo.co.za",              color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { label: "Payroll",       email: "payroll@demo.co.za",                color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const [showDemo, setShowDemo] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginValues) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (res) => {
        localStorage.setItem("incentiq_token", res.token);
        queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Logged in successfully" });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          title: "Login failed",
          description: err?.response?.data?.error || err?.message || "Invalid credentials",
          variant: "destructive",
        });
      },
    });
  };

  const fillDemo = (email: string) => {
    form.setValue("email", email);
    form.setValue("password", "Password123!");
    form.clearErrors();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-card p-8 rounded-xl shadow-lg border border-border space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="bg-white rounded-xl px-6 py-4 mb-2 shadow-sm">
              <img src={logoFull} alt="Incentiq" className="h-24 w-auto" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your Incentiq account</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@company.co.za" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">New to Incentiq? </span>
            <Link href="/register" className="text-primary hover:underline font-medium">
              Register your company
            </Link>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDemo(!showDemo)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="font-medium">Demo accounts — click to fill</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showDemo ? "rotate-180" : ""}`} />
          </button>
          {showDemo && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">Password: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">Password123!</code></p>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => fillDemo(acc.email)}
                    className={`text-xs px-2.5 py-1.5 rounded-md border font-medium transition-opacity hover:opacity-80 ${acc.color}`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
