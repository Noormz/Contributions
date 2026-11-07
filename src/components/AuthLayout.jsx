import React from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTr } from "@/lib/tr";
import { useTranslation } from "@/lib/i18n";
import { KfasLogoTile } from "@/components/brand/KfasEmblem";
import KuwaitSkyline from "@/components/brand/KuwaitSkyline";

// Kuwait flag colours, used as a thin accent bar.
export function FlagStripe({ className = "" }) {
  return (
    <div className={`flex h-1 overflow-hidden rounded-full ${className}`} dir="ltr" aria-hidden="true">
      <span className="flex-1 bg-[#007a3d]" /><span className="flex-1 bg-white" /><span className="flex-1 bg-[#ce1126]" /><span className="w-1/5 bg-black" />
    </div>
  );
}

// Split screen used by every signed-out page: illustrated hero + white sign-in panel.
export default function AuthLayout({ title, subtitle, footer, children }) {
  const tr = useTr();
  const { language, toggleLanguage } = useTranslation();
  return (
    <div className="flex min-h-screen bg-[#0f1b2a] lg:h-screen">
      <aside className="relative hidden flex-1 overflow-hidden lg:block">
        <KuwaitSkyline className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1626]/90 via-[#0b1626]/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <div className="max-w-xl">
            <h2 className="text-4xl font-extrabold leading-tight text-white drop-shadow">
              {tr("Contributions E-Portal", "بوابة المساهمات الإلكترونية")}
            </h2>
            <p className="mt-3 text-base text-white/85">
              {tr(
                "The Kuwait Foundation for the Advancement of Sciences platform for filing, paying and tracking company contributions online.",
                "منصة مؤسسة الكويت للتقدم العلمي لتقديم مساهمات الشركات وسدادها ومتابعتها إلكترونياً."
              )}
            </p>
            <FlagStripe className="mt-6 w-36" />
          </div>
        </div>
      </aside>

      <main className="flex w-full flex-col bg-white text-foreground lg:w-[640px] xl:w-[700px] lg:shrink-0 lg:overflow-y-auto">
        <div className="flex justify-end p-4">
          <Button type="button" variant="ghost" size="sm" onClick={toggleLanguage} className="gap-1.5" data-testid="auth-language">
            <Languages className="h-4 w-4" /> {language === "en" ? "العربية" : "English"}
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-10 sm:px-14 lg:items-start">
          <div className="w-full max-w-lg lg:my-auto">
            <div className="mb-6 flex flex-col items-center text-center">
              <KfasLogoTile />
              <h1 className="mt-6 text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
