import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, User, Lock, ShieldCheck, ChevronDown } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { label: "Super Admin",  email: "superadmin@commissionwallet.co.za", color: "text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100" },
  { label: "Admin",        email: "admin@demo.co.za",                  color: "text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100" },
  { label: "Manager",      email: "manager@demo.co.za",                color: "text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100" },
  { label: "Finance",      email: "finance@demo.co.za",                color: "text-cyan-700 border-cyan-200 bg-cyan-50 hover:bg-cyan-100" },
  { label: "Sales Exec",   email: "sales@demo.co.za",                  color: "text-green-700 border-green-200 bg-green-50 hover:bg-green-100" },
  { label: "Executive",    email: "executive@demo.co.za",              color: "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100" },
  { label: "Payroll",      email: "payroll@demo.co.za",                color: "text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100" },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
    setShowDemo(false);
  };

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── Left: Hero image ───────────────────────────────────── */}
      <div className="hidden lg:block flex-1 relative overflow-hidden">
        <img
          src="/hero-login.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-left"
        />
        {/* right-edge fade so it bleeds into the white panel */}
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-r from-transparent to-white" />
      </div>

      {/* ── Right: Form panel ──────────────────────────────────── */}
      <div className="w-full lg:w-[500px] lg:flex-none flex flex-col bg-white relative overflow-hidden">

        {/* Decorative blue blob — bottom-left corner */}
        <div
          className="absolute bottom-0 left-0 w-40 h-40 rounded-tr-full pointer-events-none"
          style={{ background: "radial-gradient(circle at bottom left, rgba(59,130,246,0.18) 0%, transparent 70%)" }}
        />

        {/* Decorative city skyline — bottom-right corner */}
        <div className="absolute bottom-0 right-0 w-52 h-44 pointer-events-none opacity-[0.07]">
          <svg viewBox="0 0 210 175" className="w-full h-full" fill="#3b82f6">
            <rect x="0"   y="115" width="18" height="60" />
            <rect x="22"  y="90"  width="14" height="85" />
            <rect x="2"   y="80"  width="8"  height="35" />
            <rect x="40"  y="100" width="22" height="75" />
            <rect x="66"  y="68"  width="20" height="107" />
            <rect x="70"  y="55"  width="6"  height="13" />
            <rect x="90"  y="80"  width="16" height="95" />
            <rect x="110" y="50"  width="24" height="125" />
            <rect x="113" y="38"  width="8"  height="12" />
            <rect x="138" y="72"  width="18" height="103" />
            <rect x="160" y="85"  width="26" height="90" />
            <rect x="188" y="95"  width="22" height="80" />
          </svg>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 flex flex-col justify-center px-10 py-10 relative z-10 overflow-y-auto">

          {/* Logo */}
          <div className="mb-8">
            <img src="/logo-full.png" alt="Incentiq" className="h-28 w-auto" />
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-1">Sign in to continue to Incentiq</p>
          </div>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                          type="email"
                          placeholder="Email address"
                          autoComplete="email"
                          className="w-full pl-10 pr-4 h-11 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-colors"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Password"
                          autoComplete="current-password"
                          className="w-full pl-10 pr-10 h-11 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-colors"
                          {...field}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((p) => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Remember me + Forgot password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                  />
                  <span className="text-sm text-gray-600">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In — gradient button */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full h-11 rounded-lg font-semibold text-sm text-white transition-all disabled:opacity-70"
                style={{ background: "linear-gradient(to right, #2563eb, #0d9488)" }}
                onMouseOver={(e) => { if (!loginMutation.isPending) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(to right, #1d4ed8, #0f766e)"; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(to right, #2563eb, #0d9488)"; }}
              >
                {loginMutation.isPending ? "Signing in…" : "Sign In"}
              </button>

              {/* Secure badge */}
              <div className="flex items-center justify-center gap-2 text-gray-400 text-xs pt-1">
                <ShieldCheck className="h-4 w-4 text-teal-500 shrink-0" />
                <span>Secure. Reliable. Built for Sales Performance.</span>
              </div>

              {/* Register link */}
              <p className="text-center text-sm text-gray-500 pt-1">
                New to Incentiq?{" "}
                <a href="/register" className="text-blue-600 hover:underline font-medium">
                  Register your company
                </a>
              </p>
            </form>
          </Form>

          {/* Demo accounts */}
          <div className="mt-8 border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setShowDemo(!showDemo)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium">Demo accounts — click to fill</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showDemo ? "rotate-180" : ""}`} />
            </button>
            {showDemo && (
              <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-400 py-3">
                  Password: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">Password123!</code>
                </p>
                <div className="flex flex-wrap gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc.email)}
                      className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${acc.color}`}
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
    </div>
  );
}
