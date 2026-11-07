import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useTr } from "@/lib/tr";
import { passwordIssue } from "@/components/company/passwordRules";

export default function ResetPassword() {
  const tr = useTr();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const issue = passwordIssue(newPassword, tr);
    if (issue) return setError(issue);
    if (newPassword !== confirmPassword) return setError(tr("Passwords do not match.", "كلمتا المرور غير متطابقتين."));
    setError("");
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.message || tr("Failed to reset password.", "تعذرت إعادة تعيين كلمة المرور."));
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout icon={AlertTriangle} title={tr("Invalid reset link", "رابط غير صالح")}
        subtitle={tr("This password reset link is missing or invalid", "رابط إعادة التعيين مفقود أو غير صالح")}
        footer={<Link to="/forgot-password" className="font-medium text-primary hover:underline">{tr("Request a new link", "طلب رابط جديد")}</Link>}>
        <p className="text-center text-sm">{tr("Please request a new password reset email.", "يرجى طلب رسالة إعادة تعيين جديدة.")}</p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout icon={CheckCircle2} title={tr("Password updated", "تم تحديث كلمة المرور")}
        footer={<Link to="/login" className="font-medium text-primary hover:underline" data-testid="reset-login">{tr("Log in", "تسجيل الدخول")}</Link>}>
        <p className="text-center text-sm">{tr("You can now log in with your new password.", "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.")}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Lock} title={tr("New password", "كلمة مرور جديدة")} subtitle={tr("At least 8 characters with letters and numbers", "8 أحرف على الأقل تتضمن أحرفاً وأرقاماً")}>
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">{tr("New password", "كلمة المرور الجديدة")}</Label>
          <Input id="password" type="password" autoComplete="new-password" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-12" data-testid="reset-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{tr("Confirm password", "تأكيد كلمة المرور")}</Label>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" data-testid="reset-confirm" />
        </div>
        <Button type="submit" className="h-12 w-full font-medium" disabled={loading} data-testid="reset-submit">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("Update password", "تحديث كلمة المرور")}
        </Button>
      </form>
    </AuthLayout>
  );
}
