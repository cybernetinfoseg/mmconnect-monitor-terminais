import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

// Detecta a timezone do sistema do browser
export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

// Hook que retorna a timezone do utilizador (da sua preferência guardada, ou do browser como fallback)
export function useUserTimezone() {
  const [timezone, setTimezone] = useState(getBrowserTimezone());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me()
      .then(user => {
        if (user?.timezone) {
          setTimezone(user.timezone);
        } else {
          // Fallback: timezone do browser
          setTimezone(getBrowserTimezone());
        }
      })
      .catch(() => setTimezone(getBrowserTimezone()))
      .finally(() => setLoading(false));
  }, []);

  return { timezone, loading };
}