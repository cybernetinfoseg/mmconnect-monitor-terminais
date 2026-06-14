import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Search, Loader2, Download, Eye, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const estadoCfg = {
  emitido:   { label: 'Emitido',   cls: 'bg-blue-100 text-blue-700' },
  entregue:  { label: 'Entregue',  cls: 'bg-emerald-100 text-emerald-700' },
  anulado:   { label: 'Anulado',   cls: 'bg-red-100 text-red-600' },
};

function fmt(v) { return `${(v || 0).toFixed(2)} €`; }

function ReciboHTML({ r }) {
  const mesStr = r.mes ? MESES[r.mes - 1] : '';
  return (
    <div className="bg-white p-8 text-sm font-sans max-w-[700px] mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900">RECIBO DE VENCIMENTO</h1>
          <p className="text-slate-500 text-xs mt-1">Nº {r.numero_recibo}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Data de emissão: <strong>{r.data_emissao ? format(parseISO(r.data_emissao), 'dd/MM/yyyy') : '—'}</strong></p>
          <p>Período: <strong>{mesStr} {r.ano}</strong></p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6 text-xs">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Trabalhador</p>
          <p className="font-bold text-slate-800">{r.colaborador_nome}</p>
          <p className="text-slate-600">Cargo: {r.cargo || '—'}</p>
          <p className="text-slate-600">Departamento: {r.departamento || '—'}</p>
          <p className="text-slate-600">Admissão: {r.data_admissao ? format(parseISO(r.data_admissao), 'dd/MM/yyyy') : '—'}</p>
          <p className="text-slate-600">NIF: {r.nif_colaborador || '—'}</p>
          <p className="text-slate-600">NISS: {r.niss_colaborador || '—'}</p>
        </div>
      </div>

      {/* Remunerações */}
      <table className="w-full text-xs mb-4 border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="text-left px-3 py-2 font-semibold text-slate-600 border border-slate-200">Descrição</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-600 border border-slate-200">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border border-slate-200">
            <td className="px-3 py-1.5">Salário Base</td>
            <td className="px-3 py-1.5 text-right">{fmt(r.salario_base)}</td>
          </tr>
          {(r.subsidio_alimentacao || 0) > 0 && (
            <tr className="border border-slate-200">
              <td className="px-3 py-1.5">Subsídio de Alimentação ({r.subsidio_alimentacao_tipo === 'cartao_refeicao' ? 'Cartão' : 'Dinheiro'})</td>
              <td className="px-3 py-1.5 text-right">{fmt(r.subsidio_alimentacao)}</td>
            </tr>
          )}
          {(r.outros_subsidios || 0) > 0 && (
            <tr className="border border-slate-200">
              <td className="px-3 py-1.5">{r.descricao_outros_subsidios || 'Outros Subsídios'}</td>
              <td className="px-3 py-1.5 text-right">{fmt(r.outros_subsidios)}</td>
            </tr>
          )}
          {(r.horas_extra_valor || 0) > 0 && (
            <tr className="border border-slate-200">
              <td className="px-3 py-1.5">Horas Suplementares</td>
              <td className="px-3 py-1.5 text-right">{fmt(r.horas_extra_valor)}</td>
            </tr>
          )}
          {(r.faltas_valor || 0) > 0 && (
            <tr className="border border-slate-200 text-red-600">
              <td className="px-3 py-1.5">Desconto Faltas ({r.faltas_dias || 0} dia(s))</td>
              <td className="px-3 py-1.5 text-right">- {fmt(r.faltas_valor)}</td>
            </tr>
          )}
          {(r.outros_descontos || 0) > 0 && (
            <tr className="border border-slate-200 text-red-600">
              <td className="px-3 py-1.5">{r.descricao_outros_descontos || 'Outros Descontos'}</td>
              <td className="px-3 py-1.5 text-right">- {fmt(r.outros_descontos)}</td>
            </tr>
          )}
          <tr className="bg-slate-50 border border-slate-200 font-semibold">
            <td className="px-3 py-2">Remuneração Bruta</td>
            <td className="px-3 py-2 text-right">{fmt(r.remuneracao_bruta)}</td>
          </tr>
        </tbody>
      </table>

      {/* Descontos */}
      <table className="w-full text-xs mb-6 border-collapse">
        <thead>
          <tr className="bg-red-50">
            <th className="text-left px-3 py-2 font-semibold text-red-700 border border-slate-200">Descontos Obrigatórios</th>
            <th className="text-right px-3 py-2 font-semibold text-red-700 border border-slate-200">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border border-slate-200">
            <td className="px-3 py-1.5">Segurança Social ({(r.taxa_ss_trabalhador || 11).toFixed(2)}%)</td>
            <td className="px-3 py-1.5 text-right text-red-600">- {fmt(r.valor_ss_trabalhador)}</td>
          </tr>
          {(r.valor_irs || 0) > 0 && (
            <tr className="border border-slate-200">
              <td className="px-3 py-1.5">Retenção IRS ({(r.taxa_irs || 0).toFixed(2)}%)</td>
              <td className="px-3 py-1.5 text-right text-red-600">- {fmt(r.valor_irs)}</td>
            </tr>
          )}
          {(r.outros_descontos_obrigatorios || 0) > 0 && (
            <tr className="border border-slate-200">
              <td className="px-3 py-1.5">Outros Descontos Obrigatórios</td>
              <td className="px-3 py-1.5 text-right text-red-600">- {fmt(r.outros_descontos_obrigatorios)}</td>
            </tr>
          )}
          <tr className="bg-red-50 border border-slate-200 font-semibold text-red-700">
            <td className="px-3 py-2">Total Descontos</td>
            <td className="px-3 py-2 text-right">- {fmt(r.total_descontos)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="bg-green-50 border-2 border-green-400 rounded-xl px-8 py-4 text-center">
          <p className="text-xs text-green-700 font-medium">VALOR LÍQUIDO A RECEBER</p>
          <p className="text-2xl font-bold text-green-700">{fmt(r.remuneracao_liquida)}</p>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-400">
        <p>Documento gerado automaticamente</p>
        <p>{r.numero_recibo}</p>
      </div>
    </div>
  );
}

export default function Recibos() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const now = new Date();
  const [ano, setAno] = useState('all');
  const [mes, setMes] = useState('all');
  const [previewRecibo, setPreviewRecibo] = useState(null);
  const printRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = ['admin', 'super_admin'].includes(currentUser?.role);

  const { data: recibos = [], isLoading } = useQuery({
    queryKey: ['recibos'],
    queryFn: () => base44.entities.ReciboVencimento.list('-ano,-mes', 1000),
    enabled: !!currentUser,
  });

  const marcarEntregue = useMutation({
    mutationFn: (id) => base44.entities.ReciboVencimento.update(id, { estado: 'entregue' }),
    onSuccess: () => { queryClient.invalidateQueries(['recibos']); toast.success('Marcado como entregue'); },
  });

  const anos = [...new Set(recibos.map(r => String(r.ano)))].sort().reverse();

  const filtered = useMemo(() => recibos.filter(r => {
    if (ano !== 'all' && String(r.ano) !== ano) return false;
    if (mes !== 'all' && String(r.mes) !== mes) return false;
    if (search && !r.colaborador_nome?.toLowerCase().includes(search.toLowerCase()) && !r.numero_recibo?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [recibos, ano, mes, search]);

  const handlePrint = (r) => {
    setPreviewRecibo(r);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl"><FileText className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Recibos de Vencimento</h1>
              <p className="text-xs text-slate-500">{filtered.length} recibo(s) · gerados automaticamente ao processar salários</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { v: recibos.length, label: 'Total emitidos', color: 'text-blue-600' },
            { v: recibos.filter(r => r.estado === 'emitido').length, label: 'Por entregar', color: 'text-amber-600' },
            { v: recibos.filter(r => r.estado === 'entregue').length, label: 'Entregues', color: 'text-emerald-600' },
          ].map((k, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4">
                <p className={cn('text-2xl font-bold', k.color)}>{k.v}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Pesquisar nome ou nº recibo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
          </div>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="bg-white w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="bg-white w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>Nenhum recibo encontrado. Os recibos são gerados na página de Payroll.</p>
          </CardContent></Card>
        ) : (
          <Card className="bg-white border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Nº Recibo</th>
                  <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                  <th className="text-center px-3 py-3 text-xs uppercase font-semibold text-slate-500">Período</th>
                  <th className="text-right px-3 py-3 text-xs uppercase font-semibold text-slate-500">Bruto</th>
                  <th className="text-right px-3 py-3 text-xs uppercase font-semibold text-slate-500 text-green-700">Líquido</th>
                  <th className="text-center px-3 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                  <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.numero_recibo}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.colaborador_nome}</p>
                      {r.cargo && <p className="text-[10px] text-slate-400">{r.cargo}</p>}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-600">
                      {r.mes ? MESES[r.mes - 1] : '—'} {r.ano}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700">{fmt(r.remuneracao_bruta)}</td>
                    <td className="px-3 py-3 text-right font-bold text-green-600">{fmt(r.remuneracao_liquida)}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge className={cn('text-xs', estadoCfg[r.estado]?.cls)}>{estadoCfg[r.estado]?.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setPreviewRecibo(r)}>
                          <Eye className="h-3 w-3" />Ver
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handlePrint(r)}>
                          <Printer className="h-3 w-3" />Imprimir
                        </Button>
                        {isAdmin && r.estado === 'emitido' && (
                          <Button size="sm" className="h-7 px-2 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => marcarEntregue.mutate(r.id)}>
                            <FileText className="h-3 w-3" />Entregue
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewRecibo} onOpenChange={open => !open && setPreviewRecibo(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          {previewRecibo && <ReciboHTML r={previewRecibo} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}