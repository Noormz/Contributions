import React from "react";
import logo from "@/assets/brand/kfas-logo.png";
import logoWhite from "@/assets/brand/kfas-logo-white.png";

// Official KFAS logo (www.kfas.org). `onDark` uses the white version for dark backgrounds.
export default function KfasLogo({ className = "h-10 w-auto", onDark = false }) {
  return <img src={onDark ? logoWhite : logo} alt="KFAS" className={className} />;
}

// Logo tile: logo plus the bilingual foundation name, on a white card.
export function KfasLogoTile() {
  return (
    <div className="inline-flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm" dir="ltr">
      <KfasLogo className="h-12 w-auto" />
      <div className="border-s border-slate-200 ps-4 text-start leading-tight">
        <p className="text-[15px] font-bold text-[#1e3a5f]" dir="rtl">مؤسسة الكويت للتقدم العلمي</p>
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#14283f]/80">Kuwait Foundation for the Advancement of Sciences</p>
      </div>
    </div>
  );
}
