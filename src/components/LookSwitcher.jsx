import React from 'react';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTr } from '@/lib/tr';
import { useLook } from '@/lib/look';

// Switches the portal between the KFAS design and a Microsoft Dynamics 365 style.
export default function LookSwitcher() {
  const tr = useTr();
  const [look, setLook] = useLook();
  const dynamics = look === 'dynamics';
  const next = dynamics ? tr('Theme: Dynamics 365 (switch to KFAS)', 'التصميم: Dynamics 365 (التبديل إلى تصميم المؤسسة)') : tr('Theme: KFAS (switch to Dynamics 365)', 'التصميم: المؤسسة (التبديل إلى Dynamics 365)');
  return (
    <Button variant="ghost" size="icon" onClick={() => setLook(dynamics ? 'kfas' : 'dynamics')} className="h-8 w-8" title={next} aria-label={next} data-testid="look-switcher" data-look={look}>
      <Palette className="h-4 w-4" />
    </Button>
  );
}
