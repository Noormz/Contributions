import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, User, Lock, Loader2, Building2, ArrowRight, Eye, EyeOff } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useTr } from "@/lib/tr";
import { safeReturnTo } from "@/lib/authReturnTo";

// Local development only: seeded demo accounts (see server/seed.js).
const DEV_PASSWORD = import.meta.env.DEV ? "Portal#2026" : "";
const DEMO_ACCOUNTS = [
  ["admin@portal.local", "System Administrator", "مدير النظام"],
  ["manager@portal.local", "Contributions Manager", "مدير المساهمات"],
  ["officer1@portal.local", "Contributions Officer", "موظف المساهمات"],
  ["accounts@portal.local", "Accounts Unit", "وحدة الحسابات"],
  ["rep1@gulfhorizon.example", "Company Rep — Gulf Horizon", "ممثل شركة — أفق الخليج"],
  ["rep@kni.example", "Company Rep — KNI", "ممثل شركة — الصناعات الوطنية"],
];

export default function Login() {
  const tr = useTr();
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const login = async (id, pw) => {
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(id.trim(), pw);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || tr("Invalid email or password.", "البريد الإلكتروني أو كلمة المرور غير صحيحة."));
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(tr("Enter your email or username and password.", "أدخل البريد الإلكتروني أو اسم المستخدم وكلمة المرور."));
      return;
    }
    login(email, password);
  };

  return (
    <AuthLayout
      title={tr("Welcome", "مرحباً بك")}
      subtitle={tr("Log in to the KFAS Contributions E-Portal", "سجّل دخولك إلى بوابة المساهمات الإلكترونية")}
    >
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="login-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">
            {tr("Email or username", "البريد الإلكتروني أو اسم المستخدم")} <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="email" data-testid="login-email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={tr("Company email or KFAS username", "بريد الشركة أو اسم مستخدم المؤسسة")} className="h-12 bg-card ps-10" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{tr("Password", "كلمة المرور")} <span className="text-destructive">*</span></Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">{tr("Forgot password?", "نسيت كلمة المرور؟")}</Link>
          </div>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="password" data-testid="login-password" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-card px-10" />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPw ? tr("Hide password", "إخفاء كلمة المرور") : tr("Show password", "إظهار كلمة المرور")}>
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="h-12 w-full font-semibold" disabled={loading} data-testid="login-submit">
          {loading ? <><Loader2 className="me-2 h-4 w-4 animate-spin" />{tr("Logging in...", "جارٍ تسجيل الدخول...")}</> : <><LogIn className="me-2 h-4 w-4" />{tr("Login", "تسجيل الدخول")}</>}
        </Button>
      </form>

      <div className="mt-6" data-testid="register-cta">
        <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />{tr("New to the portal?", "جديد على البوابة؟")}<span className="h-px flex-1 bg-border" />
        </div>
        <Link to="/register" data-testid="register-link"
          className="group flex items-center gap-4 rounded-xl border-2 border-[#b08d3c]/70 bg-[#b08d3c]/10 p-4 transition-colors hover:border-[#b08d3c] hover:bg-[#b08d3c]/20">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#b08d3c] text-white">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-foreground">{tr("Register your company", "سجّل شركتك")}</span>
            <span className="block text-xs text-muted-foreground">{tr("Create a company account to file and pay contributions online.", "أنشئ حساباً لشركتك لتقديم المساهمات وسدادها إلكترونياً.")}</span>
          </span>
          <ArrowRight className="h-5 w-5 text-[#8a6a24] transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      {import.meta.env.DEV && (
        <div className="mt-6 rounded-lg border border-dashed border-border p-3" data-testid="demo-accounts">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Demo accounts (development only)", "حسابات تجريبية (للتطوير فقط)")}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_ACCOUNTS.map(([acc, en, ar]) => (
              <button key={acc} type="button" disabled={loading} onClick={() => { setEmail(acc); setPassword(DEV_PASSWORD); login(acc, DEV_PASSWORD); }}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-start text-xs hover:bg-muted" data-testid={`demo-${acc}`}>
                <span className="font-medium">{tr(en, ar)}</span>
                <span className="text-muted-foreground">{acc}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
