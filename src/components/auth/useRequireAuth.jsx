import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook that checks if the user is authenticated.
 * Redirects to login if not authenticated (unless skip=true).
 * Returns { user, loading }
 */
export function useRequireAuth({ skip = false } = {}) {
  const [user, setUser] = useState(undefined);
  const [loading, setLoading] = useState(!skip);

  useEffect(() => {
    if (skip) return;

    base44.auth.me()
      .then(u => {
        setUser(u);
        setLoading(false);
        if (!u) {
          base44.auth.redirectToLogin(window.location.href);
        }
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
        base44.auth.redirectToLogin(window.location.href);
      });
  }, [skip]);

  return { user, loading };
}