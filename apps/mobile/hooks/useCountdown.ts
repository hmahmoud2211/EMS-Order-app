import { useEffect, useRef, useState } from 'react';

/**
 * Seconds remaining until `targetIso`, ticking every second. Uses the server's clock
 * (from the last API response) so a wrong phone clock cannot shift the deadline.
 */
export function useCountdown(targetIso: string | null | undefined, serverTimeIso?: string | null): number | null {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (serverTimeIso) offset.current = new Date(serverTimeIso).getTime() - Date.now();
  }, [serverTimeIso]);

  useEffect(() => {
    if (!targetIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!targetIso) return null;
  return Math.max(0, Math.floor((new Date(targetIso).getTime() - (now + offset.current)) / 1000));
}
