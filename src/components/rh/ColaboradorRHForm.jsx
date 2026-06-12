import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function ColaboradorRHForm({ data, onChange, horarios = [] }) {
  const set = (field, value) => onChange({ ...data, [field]: value });

  return (
    <Tabs defaultValue="pessoal" className="w-full">
      <TabsList className="w-full grid grid-cols-4 mb-4">
        <TabsTrigger value="pessoal" className="text-xs">Pessoal</TabsTrigger>
        <TabsTrigger value="profissional" className="text-xs">Profissional</TabsTrigger>
        <TabsTrigger value="fiscal" className="text-xs">Fiscal/Bancário</TabsTrigger>
        <TabsTrigger value="outros" className="text-xs">Outros</TabsTrigger>
      </TabsList>

      {/* Tab Pessoal */}
      <TabsContent value="pessoal" className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome Completo" required>
            <Input value={data.nome || ''} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
          </Field>
          <Field label="Número de Colaborador">
            <Input value={data.numero_colaborador || ''} onChange={e => set('numero_colaborador', e.target.value)} placeholder="COL-001" />
          </Field>
          <Field label="Data de Nascimento">
            <Input type="date" value={data.data_nascimento || ''} onChange={e => set('data_nascimento', e.target.value)} />
          </Field>
          <Field label="Género">
            <Select value={data.genero || 'nao_especificado'} onValueChange={v => set('genero', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_especificado">Não especificado</SelectItem>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Estado Civil">
            <Select value={data.estado_civil || ''} onValueChange={v => set('estado_civil', v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                <SelectItem value="casado">Casado(a)</SelectItem>
                <SelectItem value="uniao_facto">União de Facto</SelectItem>
                <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                <SelectItem value="viuvo">Viúvo(a)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nº Dependentes">
            <Input type="number" min="0" value={data.num_dependentes ?? 0} onChange={e => set('num_dependentes', Number(e.target.value))} />
          </Field>
          <Field label="Nacionalidade">
            <Input value={data.nacionalidade || 'Portuguesa'} onChange={e => set('nacionalidade', e.target.value)} />
          </Field>
          <Field label="País de Residência">
            <Input value={data.pais || 'Portugal'} onChange={e => set('pais', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Email Pessoal">
            <Input type="email" value={data.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </Field>
          <Field label="Telemóvel">
            <Input value={data.telemovel || ''} onChange={e => set('telemovel', e.target.value)} placeholder="+351 9XX XXX XXX" />
          </Field>
          <Field label="Telefone">
            <Input value={data.telefone || ''} onChange={e => set('telefone', e.target.value)} />
          </Field>
        </div>
        <Field label="Morada">
          <Input value={data.morada || ''} onChange={e => set('morada', e.target.value)} placeholder="Rua, número, andar" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Código Postal">
            <Input value={data.codigo_postal || ''} onChange={e => set('codigo_postal', e.target.value)} placeholder="XXXX-XXX" />
          </Field>
          <Field label="Localidade">
            <Input value={data.localidade || ''} onChange={e => set('localidade', e.target.value)} />
          </Field>
        </div>
      </TabsContent>

      {/* Tab Profissional */}
      <TabsContent value="profissional" className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Departamento">
            <Input value={data.departamento || ''} onChange={e => set('departamento', e.target.value)} placeholder="ex: Operações" />
          </Field>
          <Field label="Secção / Equipa">
            <Input value={data.secao || ''} onChange={e => set('secao', e.target.value)} placeholder="ex: Turno A" />
          </Field>
          <Field label="Cargo">
            <Input value={data.cargo || ''} onChange={e => set('cargo', e.target.value)} placeholder="ex: Técnico de Produção" />
          </Field>
          <Field label="Categoria Profissional">
            <Input value={data.categoria_profissional || ''} onChange={e => set('categoria_profissional', e.target.value)} placeholder="ex: Assistente Operacional" />
          </Field>
          <Field label="Nível Salarial">
            <Input value={data.nivel_salarial || ''} onChange={e => set('nivel_salarial', e.target.value)} placeholder="ex: N3" />
          </Field>
          <Field label="Local de Trabalho">
            <Input value={data.local_trabalho || ''} onChange={e => set('local_trabalho', e.target.value)} placeholder="ex: Armazém Lisboa" />
          </Field>
          <Field label="Email Profissional">
            <Input type="email" value={data.email_profissional || ''} onChange={e => set('email_profissional', e.target.value)} />
          </Field>
          <Field label="Horário de Trabalho">
            <Select value={data.horario_id || ''} onValueChange={v => set('horario_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar horário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>— Nenhum —</SelectItem>
                {horarios.map(h => (
                  <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data de Admissão">
            <Input type="date" value={data.data_admissao || ''} onChange={e => set('data_admissao', e.target.value)} />
          </Field>
          <Field label="ID Biométrico (Enrollid)">
            <Input type="number" value={data.enrollid || ''} onChange={e => set('enrollid', Number(e.target.value))} placeholder="Nº no terminal" />
          </Field>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
          <Switch checked={data.ativo !== false} onCheckedChange={v => set('ativo', v)} />
          <span className="text-sm text-slate-700">Colaborador ativo</span>
        </div>
        {data.ativo === false && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Data de Saída">
              <Input type="date" value={data.data_saida || ''} onChange={e => set('data_saida', e.target.value)} />
            </Field>
            <Field label="Motivo de Saída">
              <Select value={data.motivo_saida || ''} onValueChange={v => set('motivo_saida', v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rescisao_acordo">Rescisão por acordo</SelectItem>
                  <SelectItem value="demissao">Demissão</SelectItem>
                  <SelectItem value="despedimento">Despedimento</SelectItem>
                  <SelectItem value="reforma">Reforma</SelectItem>
                  <SelectItem value="fim_contrato">Fim de contrato</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </TabsContent>

      {/* Tab Fiscal */}
      <TabsContent value="fiscal" className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          ⚠️ Estes dados são confidenciais e utilizados para cálculo de salários e retenções fiscais.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="NIF">
            <Input value={data.nif || ''} onChange={e => set('nif', e.target.value)} placeholder="XXXXXXXXX" maxLength={9} />
          </Field>
          <Field label="NISS (Segurança Social)">
            <Input value={data.niss || ''} onChange={e => set('niss', e.target.value)} placeholder="XXXXXXXXXXX" maxLength={11} />
          </Field>
          <Field label="Nº Cartão de Cidadão">
            <Input value={data.num_cartao_cidadao || ''} onChange={e => set('num_cartao_cidadao', e.target.value)} placeholder="XXXXXXXXX XZZX" />
          </Field>
          <Field label="Validade CC">
            <Input type="date" value={data.validade_cc || ''} onChange={e => set('validade_cc', e.target.value)} />
          </Field>
          <Field label="IBAN">
            <Input value={data.iban || ''} onChange={e => set('iban', e.target.value.toUpperCase())} placeholder="PT50 XXXX XXXX XXXX XXXX XXXX X" />
          </Field>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
          <Switch checked={data.deficiencia || false} onCheckedChange={v => set('deficiencia', v)} />
          <span className="text-sm text-slate-700">Deficiência ≥ 60% (afeta retenção IRS)</span>
        </div>
      </TabsContent>

      {/* Tab Outros */}
      <TabsContent value="outros" className="space-y-4">
        <Field label="Observações internas">
          <Textarea
            value={data.observacoes || ''}
            onChange={e => set('observacoes', e.target.value)}
            placeholder="Notas internas sobre este colaborador..."
            rows={4}
          />
        </Field>
      </TabsContent>
    </Tabs>
  );
}