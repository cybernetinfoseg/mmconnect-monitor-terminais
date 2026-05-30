// ControloAcesso.jsx — NOC Monitor: Painel de Controlo Remoto de Terminais
// ✅ VERSÃO ATUALIZADA: Envia o datetime corrigido com o fuso horário do utilizador
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Shield, DoorOpen, DoorClosed, Lock, Unlock, Power,
  AlertTriangle, RefreshCw, Info, Users, Clock,
  CheckCircle2, XCircle, Loader2, Zap, Bell, BellOff,
  ChevronDown, ChevronRight, Wifi, WifiOff, Settings,
  RotateCcw, Trash2, Eye, Ban, UserCheck, Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Constantes ───────────────────────────────────────────────────────────────
const DOOR_STATES = {
  normal:  { label: 'Modo Normal',    icon: DoorOpen,   color: 'bg-emerald-500', fuc: null,  desc: 'Acesso pelo método configurado' },
  unlock:  { label: 'Aberto Forçado', icon: Unlock,     color: 'bg-amber-500',  fuc: 1,    desc: 'Porta desbloqueada continuamente' },
  lock:    { label: 'Fechado Forçado', icon: DoorClosed, color: 'bg-red-500',    fuc: 2,    desc: 'Porta bloqueada para todos' },
};

export default function ControloAcesso() {
  const queryClient = useQueryClient();
  const { timezone: userTimezone } = useUserTimezone(); // Hook que captura a fuso horário do utilizador logado
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [pesquisa, setPesquisa] = useState('');

  // Consulta para listar os terminais disponíveis
  const { data: terminals = [], isLoading: loadingTerminals } = useQuery({
    queryKey: ['controlo-terminais'],
    queryFn: () => base44.entities.Terminal.list(),
  });

  // Filtro de pesquisa de terminais
  const terminaisFiltrados = useMemo(() => {
    return terminals.filter(t => 
      t.nome?.toLowerCase().includes(pesquisa.toLowerCase()) ||
      t.sn?.toLowerCase().includes(pesquisa.toLowerCase()) ||
      t.local?.toLowerCase().includes(pesquisa.toLowerCase())
    );
  }, [terminals, pesquisa]);

  // Define o terminal ativo por padrão se houver dados
  useEffect(() => {
    if (terminals.length > 0 && !selectedTerminal) {
      setSelectedTerminal(terminals[0].sn);
    }
  }, [terminals, selectedTerminal]);

  // Consulta em tempo real do status do terminal via o porto 7789 do backend Python
  const { data: liveStatus = null, isLoading: loadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['terminal-live-status', selectedTerminal],
    queryFn: async () => {
      if (!selectedTerminal) return null;
      // Faz o bypass ou chamada direta ao endpoint de status do servidor Python
      const res = await base44.client.get(`/status/${selectedTerminal}`);
      return res;
    },
    enabled: !!selectedTerminal,
    refetchInterval: 5000, // Atualiza a cada 5 segundos
  });

  // ─── FUNÇÃO CORRIGIDA: Executa o acerto manual injetando o fuso horário correto ───
  const handleAcertarRelogio = async (terminalSn) => {
    if (!terminalSn) return;

    // O formato 'sv-SE' (Suécia) gera nativamente YYYY-MM-DD HH:MM:SS, compatível com o hardware
    const horaFormatadaComTimezone = new Date().toLocaleString("sv-SE", {
      timeZone: userTimezone || "Europe/Lisbon"
    }).replace("T", " ");

    toast.loading("A enviar comando de fuso horário...", { id: "settime" });

    try {
      // Envia o comando para a API que faz a ponte com o WebSocket na porta 7789
      const resposta = await base44.client.post("/cmd", {
        sn: terminalSn,
        command: "settime",
        datetime: horaFormatadaComTimezone // Injeta dinamicamente a hora correta convertida no frontend
      });

      if (resposta.sucesso) {
        toast.success(`Relógio atualizado com sucesso para: ${horaFormatadaComTimezone}`, { id: "settime" });
        refetchStatus();
      } else {
        toast.error(`Falha: ${resposta.erro || "Erro desconhecido"}`, { id: "settime" });
      }
    } catch (err) {
      toast.error("Erro ao comunicar com o servidor de comandos.", { id: "settime" });
      console.error(err);
    }
  };

  // ─── Outras Funções de Controlo Remoto (Exemplo) ──────────────────────────────
  const handleGenericCmd = async (command, label) => {
    if (!selectedTerminal) return;
    toast.loading(`A executar comando: ${label}...`, { id: command });
    try {
      const resposta = await base44.client.post("/cmd", { sn: selectedTerminal, command });
      if (resposta.sucesso) {
        toast.success(`Comando ${label} executado com sucesso!`, { id: command });
      } else {
        toast.error(`Erro: ${resposta.erro}`, { id: command });
      }
    } catch (err) {
      toast.error(`Erro na conexão para o comando ${label}`, { id: command });
    }
  };

  const terminalAtivo = useMemo(() => {
    return terminals.find(t => t.sn === selectedTerminal);
  }, [terminals, selectedTerminal]);

  if (loadingTerminals) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <span>A carregar terminais e permissões...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-1">
      {/* Coluna Esquerda: Seletor de Terminais */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Dispositivos
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="search"
                placeholder="Pesquisar SN ou nome..."
                className="pl-8 h-9 text-xs"
                value={pesquisa}
                onChange={e => setPesquisa(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0 max-h-[450px] overflow-y-auto space-y-1">
            {terminaisFiltrados.map(t => (
              <button
                key={t.sn}
                onClick={() => setSelectedTerminal(t.sn)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-center justify-between border",
                  selectedTerminal === t.sn
                    ? "bg-blue-50 border-blue-200 text-blue-700 font-medium"
                    : "bg-white border-transparent text-slate-600 hover:bg-slate-50"
                )}
              >
                <div className="truncate pr-2">
                  <p className="truncate font-semibold">{t.nome}</p>
                  <p className="text-[10px] opacity-70 font-mono mt-0.5">{t.sn}</p>
                </div>
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  liveStatus?.status === 'online' && selectedTerminal === t.sn ? "bg-emerald-500" : "bg-slate-300"
                )} />
              </button>
            ))}
            {terminaisFiltrados.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">Nenhum terminal encontrado</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coluna Direita: Painel de Ações */}
      <div className="lg:col-span-3 space-y-6">
        {terminalAtivo ? (
          <Card className="overflow-hidden border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4 flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base font-bold text-slate-800">{terminalAtivo.nome}</CardTitle>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Modelo: {liveStatus?.model || terminalAtivo.modelo || 'Desconhecido'} · SN: {terminalAtivo.sn}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(
                  "px-2.5 py-0.5 text-xs font-semibold rounded-full border",
                  liveStatus?.status === 'online' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                )}>
                  {liveStatus?.status === 'online' ? (
                    <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> Online</span>
                  ) : (
                    <span className="flex items-center gap-1"><WifiOff className="h-3 w-3" /> Offline</span>
                  )}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => refetchStatus()} disabled={loadingStatus} className="h-8 w-8 p-0">
                  <RefreshCw className={cn("h-4 w-4 text-slate-500", loadingStatus && "animate-spin")} />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* Seção 1: Sincronização e Relógio */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> Alinhamento de Sistema e Tempo
                </h3>
                <div className="flex flex-wrap gap-3">
                  <Button 
                    onClick={() => handleAcertarRelogio(terminalAtivo.sn)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    Acertar Relógio Remoto
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => handleGenericCmd("getlogs", "Recolher Marcações")}
                    className="text-xs text-slate-700 border-slate-200 hover:bg-slate-50 gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Forçar Recolha de Marcações
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 border border-slate-200/60 rounded-lg">
                  💡 **Nota de fuso horário**: Ao clicar em *Acertar Relógio*, o sistema calcula instantaneamente o tempo civil com base na sua fuso horário preferencial (**{userTimezone}**) e força o display do terminal a sincronizar.
                </p>
              </div>

              {/* Seção 2: Comandos de Hardware */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" /> Comandos Diretos de Hardware
                </h3>
                <div className="flex flex-wrap gap-3">
                  <Button 
                    variant="outline"
                    onClick={() => handleGenericCmd("opendoor", "Abrir Porta")}
                    className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-2"
                  >
                    <DoorOpen className="h-4 w-4" />
                    Disparar Relé (Abrir Porta)
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleGenericCmd("getdevinfo", "Info do Dispositivo")}
                    className="text-xs text-slate-700 border-slate-200 hover:bg-slate-50 gap-2"
                  >
                    <Info className="h-4 w-4" />
                    Solicitar Diagnóstico Interno
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => { if(window.confirm("Deseja mesmo reiniciar este terminal?")) handleGenericCmd("reboot", "Reiniciar Terminal"); }}
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50 gap-2"
                  >
                    <Power className="h-4 w-4" />
                    Reiniciar Terminal Remotamente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-20 border border-dashed rounded-xl border-slate-300 text-slate-400">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-25" />
            <p className="font-medium text-sm">Nenhum dispositivo selecionado</p>
            <p className="text-xs mt-1">Selecione um terminal à esquerda para carregar o cockpit de operações.</p>
          </div>
        )}
      </div>
    </div>
  );
}