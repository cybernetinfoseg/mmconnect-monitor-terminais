/**
 * Hook centralizado para terminais.
 *
 * - Query key única: ['terminals'] — partilhada por Dashboard, Terminais, MapaTerminais, TVMode
 * - Subscription real-time: invalida o cache automaticamente quando um terminal é criado/atualizado/eliminado
 * - Intervalo de polling configurável via MonitorConfig (default: 30s)
 * - Elimina o rate-limit causado por múltiplos refetchIntervals em páginas distintas
 */
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const TERMINALS_QUERY_KEY = ['terminals'];

export function useTerminals({ enabled = true, refetchInterval } = {}) {
  const queryClient = useQueryClient();

  // Subscription real-time: qualquer create/update/delete invalida o cache imediatamente
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = base44.entities.Terminal.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: TERMINALS_QUERY_KEY });
    });
    return unsubscribe;
  }, [enabled, queryClient]);

  return useQuery({
    queryKey: TERMINALS_QUERY_KEY,
    queryFn: async () => {
      const response = await base44.functions.invoke('getMyTerminals', {});
      return response.data?.terminals || [];
    },
    refetchInterval: refetchInterval ?? 30000,
    staleTime: 10000,
    enabled,
  });
}