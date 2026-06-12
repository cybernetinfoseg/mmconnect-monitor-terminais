import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote, Plus, Search, ChevronLeft, ChevronRight, Loader2,
  CheckCircle2, Clock, CreditCard, Pencil, Trash2, FileText, Eye
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function calcular(form) {
  const sb = parseFloat(form.salario_base) || 0;
  const sa = parseFloat(form.subsidio_alimentacao) || 0;
  const os = parseFloat(form.outros_subsidios) || 0;
  const he = parseFloat(form.horas_extra_valor) || 0;
  const fv = parseFloat(form.faltas_valor) || 0;
  const od = parseFloat(form.outros_descontos) || 0;
  // Subsídio alimentação em cartão não entra no bruto sujeito a SS/IRS
  const saCartao = form.subsidio_alimentacao_tipo === 'cartao_refeicao' ? sa : 0;
  const saDinheiro = form.subsidio_alimentacao_tipo !== 'cartao_refeicao' ? sa : 0;
  const bruto = sb + saDinheiro + os + he - fv - od;
  const taxaSS = parseFloat(form.taxa_ss_trabalhador) || 11;
  const taxaIRS = parseFloat(form.taxa_irs) || 0;
  const taxaSSEmp = parseFloat(form.taxa_ss_entidade) || 23.75;
  const vSS = parseFloat(((sb + saDinheiro + os + he - fv - od) * taxaSS / 100).toFixed(2));
  const baseIRS = bruto - vSS;
  const vIRS = parseFloat((baseIRS * taxaIRS / 100).toFixed(2));
  const outrosOb = parseFloat(form.outros_descontos_obrigatorios) || 0;
  const totalDesc = vSS + vIRS + outrosOb;
  const liquido = bruto - totalDesc + saCartao;
  const vSSEmp = parseFloat(((sb + saDinheiro + os + he - fv) * taxaSSEmp / 100).toFixed(2));
  const custoEmp = sb + saDinheiro + os + he - fv + od + vSSEmp + saCartao;
  return {
    remuneracao_bruta: parseFloat(bruto.toFixed(2)),
    valor_ss_trabalhador: vSS,
    valor_irs: vIRS,
    total_descontos: parseFloat(totalDesc.toFixed(2)),
    remuneracao_liquida: parseFloat(liquido.toFixed(2)),
    valor_ss_entidade: vSSEmp,
    custo_total_empresa: parseFloat(custoEmp.toFixed(2)),
  };
}

const estadoCfg = {
  rascunho:  { label: 'Rascunho',   cls: 'bg-slate-100 text-slate-600' },
  processado:{ label: 'Processado', cls: 'bg-blue-100 text-blue-700' },
  pago:      { label: 'Pago',       cls: 'bg-emerald-100 text-emerald-700' },
};

export default function Payroll() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const now = new Date();
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [calcPreview, setCalcPreview] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = currentUser?.role === 'admin';

  const qKey = ['payroll', ano, mes];

  const { data: processamentos = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => base44.entities.ProcessamentoSalario.filter({ ano: Number(ano), mes: Number(mes) }, 'colaborador_nome', 500),
    enabled: !!currentUser,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-payroll'],
    queryFn: () => base44.entities.Colaborador.filter({ ativo: true }, 'nome', 500),
    enabled: !!currentUser,
  });

  const { data: contratos = [] } = useQuery({
    queryKey: ['contratos-payroll'],
    queryFn: () => base44.entities.Contrato.filter({ estado: 'ativo' }, 'colaborador_id', 500),
    enabled: !!currentUser,
  });

  const contratoMap = useMemo(() => {
    const m = {};
    contratos.forEach(c => { if (!m[c.colaborador_id]) m[c.colaborador_id] = c; });
    return m;
  }, [contratos]);

  const setF = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    setCalcPreview(calcular(next));
  };

  const openNew = (col) => {
    const ct = contratoMap[col.id];
    const base = {
      colaborador_id: col.id,
      colaborador_nome: col.nome,
      enrollid: col.enrollid,
      salario_base: ct?.salario_base || 0,
      subsidio_alimentacao: ct?.subsidio_alimentacao || 0,
      subsidio_alimentacao_tipo: ct?.subsidio_alimentacao_tipo || 'cartao_refeicao',
      outros_subsidios: ct?.outros_subsidios || 0,
      descricao_outros_subsidios: ct?.descricao_outros_subsidios || '',
      horas_extra_valor: 0, horas_extra_minutos: 0,
      faltas_dias: 0, faltas_valor: 0,
      outros_descontos: 0, descricao_outros_descontos: '',
      taxa_ss_trabalhador: 11, taxa_irs: 0,
      outros_descontos_obrigatorios: 0,
      taxa_ss_entidade: 23.75,
      estado: 'rascunho',
    };
    setForm(base); setCalcPreview(calcular(base));
    setEditItem(null); setDialogOpen(true);
  };

  const openEdit = (p) => {
    setForm({ ...p }); setCalcPreview(calcular(p));
    setEditItem(p); setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const calc = calcular(form);
      const payload = { ...form, ...calc, ano: Number(ano), mes: Number(mes), owner_email: currentUser?.email };
      if (editItem) return base44.entities.ProcessamentoSalario.update(editItem.id, payload);
      return base44.entities.ProcessamentoSalario.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries(qKey); setDialogOpen(false); toast.success('Processamento guardado'); },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcessamentoSalario.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(qKey); toast.success('Processamento eliminado'); },
  });

  const marcarPagoMutation = useMutation({
    mutationFn: (id) => base44.entities.ProcessamentoSalario.update(id, { estado: 'pago', data_pagamento: new Date().toLocaleDateString('en-CA') }),
    onSuccess: () => { queryClient.invalidateQueries(qKey); toast.success('Marcado como pago'); },
  });

  const gerarReciboMutation = useMutation({
    mutationFn: async (p) => {
      const col = colaboradores.find(c => c.id === p.colaborador_id);
      const seq = String(processamentos.filter(x => x.recibo_gerado).length + 1).padStart(3, '0');
      const num = `RV-${ano}-${seq}`;
      await base44.entities.ReciboVencimento.create({
        processamento_id: p.id,
        colaborador_id: p.colaborador_id, colaborador_nome: p.colaborador_nome, enrollid: p.enrollid,
        numero_recibo: num, ano: Number(ano), mes: Number(mes),
        data_emissao: new Date().toLocaleDateString('en-CA'),
        nif_colaborador: col?.nif, niss_colaborador: col?.niss,
        cargo: col?.cargo, departamento: col?.departamento,
        data_admissao: col?.data_admissao,
        salario_base: p.salario_base, subsidio_alimentacao: p.subsidio_alimentacao,
        subsidio_alimentacao_tipo: p.subsidio_alimentacao_tipo,
        outros_subsidios: p.outros_subsidios, descricao_outros_subsidios: p.descricao_outros_subsidios,
        horas_extra_valor: p.horas_extra_valor, horas_extra_minutos: p.horas_extra_minutos,
        faltas_dias: p.faltas_dias, faltas_valor: p.faltas_valor,
        outros_descontos: p.outros_descontos, descricao_outros_descontos: p.descricao_outros_descontos,
        remuneracao_bruta: p.remuneracao_bruta,
        valor_ss_trabalhador: p.valor_ss_trabalhador, taxa_ss_trabalhador: p.taxa_ss_trabalhador,
        valor_irs: p.valor_irs, taxa_irs: p.taxa_irs,
        outros_descontos_obrigatorios: p.outros_descontos_obrigatorios,
        total_descontos: p.total_descontos, remuneracao_liquida: p.remuneracao_liquida,
        estado: 'emitido', owner_email: currentUser?.email,
      });
      await base44.entities.ProcessamentoSalario.update(p.id, { recibo_gerado: true, estado: 'processado' });
    },
    onSuccess: () => { queryClient.invalidateQueries(qKey); toast.success('Recibo emitido com sucesso'); },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const filtered = processamentos.filter(p => !search || p.colaborador_nome?.toLowerCase().includes(search.toLowerCase()));

  const totalBruto = filtered.reduce((s, p) => s + (p.remuneracao_bruta || 0), 0);
  const totalLiquido = filtered.reduce((s, p) => s + (p.remuneracao_liquida || 0), 0);
  const totalCusto = filtered.reduce((s, p) => s + (p.custo_total_empresa || 0), 0);
  const totalPendente = filtered.filter(p => p.estado !== 'pago').length;

  const colSemProcessamento = colaboradores.filter(col => !processamentos.find(p => p.colaborador_id === col.id));

  const fmt = (v) => `${(v || 0).toFixed(2)} €`;
  const anos = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-xl"><Banknote className="h-5 w-5 text-green-600" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Processamento Salarial</h1>
              <p className="text-xs text-slate-500">Cálculo de remunerações — {MESES[Number(mes) - 1]} {ano}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="bg-white w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="bg-white w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>{anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { v: filtered.length, label: 'Processados', color: 'text-slate-700' },
            { v: fmt(totalBruto), label: 'Total Bruto', color: 'text-slate-700' },
            { v: fmt(totalLiquido), label: 'Total Líquido', color: 'text-green-600' },
            { v: fmt(totalCusto), label: 'Custo Empresa', color: 'text-red-500' },
          ].map((k, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4">
                <p className={cn('text-xl font-bold', k.color)}>{k.v}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Colaboradores sem processamento */}
        {isAdmin && colSemProcessamento.length > 0 && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                {colSemProcessamento.length} colaborador(es) sem processamento em {MESES[Number(mes)-1]}
              </p>
              <div className="flex flex-wrap gap-2">
                {colSemProcessamento.slice(0, 10).map(col => (
                  <Button key={col.id} size="sm" variant="outline" className="h-7 text-xs border-amber-300 hover:bg-amber-100"
                    onClick={() => openNew(col)}>
                    <Plus className="h-3 w-3 mr-1" />{col.nome}
                  </Button>
                ))}
                {colSemProcessamento.length > 10 && <span className="text-xs text-amber-600 self-center">+{colSemProcessamento.length - 10} mais</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400">
            <Banknote className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>Nenhum processamento para {MESES[Number(mes)-1]} {ano}</p>
          </CardContent></Card>
        ) : (
          <Card className="bg-white border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                  <th className="text-right px-3 py-3 text-xs uppercase font-semibold text-slate-500">Base</th>
                  <th className="text-right px-3 py-3 text-xs uppercase font-semibold text-slate-500">Bruto</th>
                  <th className="text-right px-3 py-3 text-xs uppercase font-semibold text-slate-500">SS+IRS</th>
                  <th className="text-right px-3 py-3 text-xs uppercase font-semibold text-slate-500 text-green-700">Líquido</th>
                  <th className="text-center px-3 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                  <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{p.colaborador_nome}</p>
                      {p.data_pagamento && <p className="text-[10px] text-slate-400">Pago: {format(parseISO(p.data_pagamento), 'dd/MM/yyyy')}</p>}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">{fmt(p.salario_base)}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-800">{fmt(p.remuneracao_bruta)}</td>
                    <td className="px-3 py-3 text-right text-red-500">{fmt((p.valor_ss_trabalhador || 0) + (p.valor_irs || 0))}</td>
                    <td className="px-3 py-3 text-right font-bold text-green-600">{fmt(p.remuneracao_liquida)}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge className={cn('text-xs', estadoCfg[p.estado]?.cls)}>{estadoCfg[p.estado]?.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>}
                        {isAdmin && p.estado !== 'pago' && (
                          <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => marcarPagoMutation.mutate(p.id)}>
                            <CheckCircle2 className="h-3 w-3" />Pago
                          </Button>
                        )}
                        {isAdmin && !p.recibo_gerado && p.estado !== 'rascunho' && (
                          <Button size="sm" className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => gerarReciboMutation.mutate(p)}>
                            <FileText className="h-3 w-3" />Recibo
                          </Button>
                        )}
                        {p.recibo_gerado && <Badge className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 gap-1"><FileText className="h-2.5 w-2.5" />Emitido</Badge>}
                        {isAdmin && p.estado === 'rascunho' && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">Totais ({filtered.length})</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-slate-600">{fmt(filtered.reduce((s,p)=>s+(p.salario_base||0),0))}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-slate-800">{fmt(totalBruto)}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-red-500">{fmt(filtered.reduce((s,p)=>s+(p.valor_ss_trabalhador||0)+(p.valor_irs||0),0))}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-green-600">{fmt(totalLiquido)}</td>
                  <td colSpan={2} className="px-3 py-3 text-right text-xs text-slate-400">Custo empresa: <strong className="text-slate-600">{fmt(totalCusto)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )}
      </div>

      {/* Dialog Processamento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Processamento' : 'Novo Processamento'} — {form.colaborador_nome}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Remunerações */}
            <div className="col-span-2">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Remunerações</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Salário Base (€)</Label>
              <Input type="number" step="0.01" value={form.salario_base || ''} onChange={e => setF('salario_base', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Subsídio Alimentação (€/dia)</Label>
              <div className="flex gap-2">
                <Input type="number" step="0.01" value={form.subsidio_alimentacao || ''} onChange={e => setF('subsidio_alimentacao', e.target.value)} />
                <Select value={form.subsidio_alimentacao_tipo || 'cartao_refeicao'} onValueChange={v => setF('subsidio_alimentacao_tipo', v)}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartao_refeicao">Cartão</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Outros Subsídios (€)</Label>
              <Input type="number" step="0.01" value={form.outros_subsidios || ''} onChange={e => setF('outros_subsidios', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Horas Extra a Pagar (€)</Label>
              <Input type="number" step="0.01" value={form.horas_extra_valor || ''} onChange={e => setF('horas_extra_valor', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Desconto Faltas (€)</Label>
              <Input type="number" step="0.01" value={form.faltas_valor || ''} onChange={e => setF('faltas_valor', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Outros Descontos (€)</Label>
              <Input type="number" step="0.01" value={form.outros_descontos || ''} onChange={e => setF('outros_descontos', e.target.value)} />
            </div>

            {/* Taxas */}
            <div className="col-span-2 pt-2">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Taxas</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Taxa SS Trabalhador (%)</Label>
              <Input type="number" step="0.01" value={form.taxa_ss_trabalhador ?? 11} onChange={e => setF('taxa_ss_trabalhador', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Taxa IRS (%)</Label>
              <Input type="number" step="0.01" value={form.taxa_irs ?? 0} onChange={e => setF('taxa_irs', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Outros Desc. Obrigatórios (€)</Label>
              <Input type="number" step="0.01" value={form.outros_descontos_obrigatorios || ''} onChange={e => setF('outros_descontos_obrigatorios', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Taxa SS Entidade (%)</Label>
              <Input type="number" step="0.01" value={form.taxa_ss_entidade ?? 23.75} onChange={e => setF('taxa_ss_entidade', e.target.value)} />
            </div>

            {/* Preview */}
            <div className="col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-3">Simulação</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                {[
                  { l: 'Remuneração Bruta', v: calcPreview.remuneracao_bruta, c: 'text-slate-800' },
                  { l: 'SS Trabalhador', v: calcPreview.valor_ss_trabalhador, c: 'text-red-500' },
                  { l: 'Retenção IRS', v: calcPreview.valor_irs, c: 'text-red-500' },
                  { l: 'Total Descontos', v: calcPreview.total_descontos, c: 'text-red-600 font-semibold' },
                  { l: '💚 Líquido', v: calcPreview.remuneracao_liquida, c: 'text-green-600 font-bold' },
                  { l: 'SS Empresa', v: calcPreview.valor_ss_entidade, c: 'text-slate-500' },
                  { l: 'Custo Total Empresa', v: calcPreview.custo_total_empresa, c: 'text-slate-700 font-semibold' },
                ].map((x, i) => (
                  <div key={i}><span className="text-slate-500 text-xs">{x.l}: </span><span className={cn('text-xs', x.c)}>{fmt(x.v)}</span></div>
                ))}
              </div>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Observações</Label>
              <Textarea value={form.observacoes || ''} onChange={e => setF('observacoes', e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}