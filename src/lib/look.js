import { useEffect, useState } from 'react';

// Visual theme ("look") of the portal: the KFAS design or a Microsoft Dynamics 365 (Fluent) style.
// Stored per browser and applied as <html data-look="...">; styles live in src/index.css.
export const LOOKS = ['kfas', 'dynamics'];
const KEY = 'ui_look';

export function storedLook() {
  try {
    const v = localStorage.getItem(KEY);
    return LOOKS.includes(v) ? v : 'kfas';
  } catch {
    return 'kfas';
  }
}

export function applyLook(look) {
  document.documentElement.dataset.look = look;
}

export function useLook() {
  const [look, setLook] = useState(storedLook);
  useEffect(() => {
    applyLook(look);
    try { localStorage.setItem(KEY, look); } catch { /* storage unavailable: keep for this session */ }
  }, [look]);
  return [look, setLook];
}
