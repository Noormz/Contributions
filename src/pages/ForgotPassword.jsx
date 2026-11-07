import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useTr } from "@/lib/tr";

export default function ForgotPassword() {
  const tr = useTr();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(tr("Enter a valid email address.", "أدخل بريداً إلكترونياً صحيحاً."));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch {
      // Always show the same message so account existence is not revealed.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title={tr("Reset password", "إعادة تعيين كلمة المرور")}
      subtitle={tr("We'll email you a link to reset it", "سنرسل لك رابطاً لإعادة تعيينها")}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          <ArrowLeft className="me-1 inline h-3 w-3 rtl:rotate-180" />{tr("Back to log in", "العودة لتسجيل الدخول")}
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3 text-center text-sm" data-testid="reset-sent">
          <p>{tr("If an account exists with that email, you'll receive a password reset link shortly.", "إذا كان هناك حساب مرتبط بهذا البريد فستصلك رسالة لإعادة التعيين قريباً.")}</p>
          {import.meta.env.DEV && <Link to="/dev/mailbox" className="text-primary hover:underline">{tr("Open development mailbox", "فتح صندوق البريد التجريبي")}</Link>}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{tr("Email address", "البريد الإلكتروني")}</Label>
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 ps-10" data-testid="forgot-email" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="h-12 w-full font-medium" disabled={loading} data-testid="forgot-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("Send reset link", "إرسال رابط إعادة التعيين")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
