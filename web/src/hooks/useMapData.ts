import { useEffect, useState } from 'react';
import type { Merchant } from '../types';

export function useMapData() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('map-data.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Merchant[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setMerchants(data.filter((m) => (m.locations || []).length > 0));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { merchants, loading, error };
}
