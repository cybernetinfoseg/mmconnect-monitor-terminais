import React, { useState, useRef, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Camera, CreditCard, Fingerprint, KeyRound, User, Building2, Briefcase, Mail, Hash, Shield, ScanFace, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTimmyCapabilities, getSupportedBioTypes, ALL_BIO_TYPES } from '@/lib/timmyModels';

/**
 * Formulário completo de colaborador para terminais Timmy (Face ID + Biometria).
 * Adapta os campos de biometria disponíveis com base nos modelos dos terminais selecionados.
 */
export default function ColaboradorForm({ formData, setFormData, terminals, selectedTerminals, setSelectedTerminals, filteredDialogTerminals, isAdmin, appUsers, filterDialogTerminalOwner, setFilterDialogTerminalOwner }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const setField = (key, value) => setFormData(f => ({ ...f, [key]: value }));

  // Calcular capacidades combinadas dos terminais selecionados
  const terminalCapabilities = useMemo(() => {
    const selectedT = terminals.filter(t => selectedTerminals.includes(t.id) && t.tipo_conexao === 'websocket_cloud');
    if (!selectedT.length) return null;
    // União das capacidades de todos os terminais selecionados
    const caps = selectedT.map(t => getTimmyCapabilities(t.modelo));
    const allBackupnums = new Set(caps.flatMap(c => c.supportedBackupnums));
    const hasFace = caps.some(c => c.hasFace);
    const hasFP = caps.some(c => c.hasFingerprint);
    const models = [...new Set(caps.map(c => c.name))];
    return { allBackupnums, hasFace, hasFP, models };
  }, [terminals, selectedTerminals]);

  // Tipos biométricos disponíveis: se há terminais Timmy selecionados, filtrar pelas capacidades
  const BIOMETRIC_TYPES = useMemo(() => {
    if (!terminalCapabilities) return ALL_BIO_TYPES;
    return ALL_BIO_TYPES.filter(bt => terminalCapabilities.allBackupnums.has(bt.value));
  }, [terminalCapabilities]);

  const selectedBioTypes = (() => {
    try { return JSON.parse(formData.bio_types || '[]'); } catch { return []; }
  })();

  const toggleBioType = (val) => {
    const cur = selectedBioTypes;
    const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val];
    setField('bio_types', JSON.stringify(next));
  };

  const toggleTerminal = (tid) =>
    setSelectedTerminals(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]);

  // Camera for Face ID capture
  const openCamera = async () => {
    setCameraError('');
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setCameraError('Câmara não disponível: ' + e.message);
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setField('foto_url', dataUrl);
    closeCamera();
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setField('foto_url', ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      {/* Secção: Identificação */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">Identificação</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">ID de Inscrição (EnrollID) *</Label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input type="number" placeholder="Ex: 1001" className="pl-8" value={formData.enrollid || ''} onChange={e => setField('enrollid', Number(e.target.value))} />
            </div>
            <p className="text-xs text-slate-400">ID único no terminal biométrico</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nome Completo *</Label>
            <Input placeholder="Nome do colaborador" value={formData.nome || ''} onChange={e => setField('nome', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
            <Input type="email" placeholder="email@empresa.com" value={formData.email || ''} onChange={e => setField('email', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Telemóvel</Label>
            <Input placeholder="+351 9xx xxx xxx" value={formData.telefone || ''} onChange={e => setField('telefone', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Secção: Organização */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">Organização</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Departamento</Label>
            <Input placeholder="RH, TI, Produção..." value={formData.departamento || ''} onChange={e => setField('departamento', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Briefcase className="h-3 w-3" /> Cargo</Label>
            <Input placeholder="Engenheiro, Operador..." value={formData.cargo || ''} onChange={e => setField('cargo', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> Privilégio no Terminal</Label>
            <Select value={String(formData.privilege ?? 0)} onValueChange={v => setField('privilege', Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Utilizador Normal</SelectItem>
                <SelectItem value="14">Administrador do Terminal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nº Crachá / Funcionário</Label>
            <Input placeholder="Opcional" value={formData.numero_cracha || ''} onChange={e => setField('numero_cracha', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Secção: Credenciais Biométricas (Timmy) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Fingerprint className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">Credenciais Biométricas (Timmy Face ID)</span>
        </div>
        {terminalCapabilities && (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-3">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700">
              <span className="font-semibold">Terminais selecionados: </span>
              {terminalCapabilities.models.join(', ')} — 
              {terminalCapabilities.hasFace && ' 😊 Face ID'}
              {terminalCapabilities.hasFP && ' 🖐️ Impressão Digital'}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500 mb-3">Selecione os tipos de acesso configurados neste colaborador</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {BIOMETRIC_TYPES.map(bt => (
            <button
              key={bt.value}
              type="button"
              onClick={() => toggleBioType(bt.value)}
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all',
                selectedBioTypes.includes(bt.value)
                  ? 'bg-teal-50 border-teal-400 text-teal-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              )}
            >
              <span className="text-base">{bt.icon}</span>
              <span className="truncate">{bt.label}</span>
            </button>
          ))}
        </div>

        {/* Campos condicionais por tipo selecionado */}
        <div className="space-y-3">
          {selectedBioTypes.includes(11) && (
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Nº Cartão RFID</Label>
              <Input placeholder="Número do cartão (decimal ou hex)" value={formData.card || ''} onChange={e => setField('card', e.target.value)} />
              <p className="text-xs text-slate-400">Introduza o número impresso no cartão</p>
            </div>
          )}
          {selectedBioTypes.includes(10) && (
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><KeyRound className="h-3 w-3" /> Senha Numérica</Label>
              <Input type="password" placeholder="Senha numérica (4-8 dígitos)" value={formData.password || ''} onChange={e => setField('password', e.target.value)} />
            </div>
          )}
          {selectedBioTypes.includes(15) && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><ScanFace className="h-3 w-3" /> Foto para Face ID</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={openCamera}>
                  <Camera className="h-3.5 w-3.5" /> Usar Câmara
                </Button>
                <label className="cursor-pointer">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                    <span><ScanFace className="h-3.5 w-3.5" /> Upload Foto</span>
                  </Button>
                  <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
              {cameraOpen && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-black relative">
                  {cameraError ? (
                    <div className="p-4 text-center text-red-400 text-xs">{cameraError}</div>
                  ) : (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-48 object-cover" />
                      <div className="flex gap-2 p-2 bg-black/70 absolute bottom-0 left-0 right-0">
                        <Button size="sm" className="flex-1 bg-teal-600 hover:bg-teal-700 text-xs" onClick={capturePhoto}>
                          <Camera className="h-3.5 w-3.5 mr-1" /> Capturar
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs border-white/30 text-white hover:bg-white/10" onClick={closeCamera}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {formData.foto_url && (
                <div className="relative inline-block">
                  <img src={formData.foto_url} alt="Face ID" className="h-20 w-20 object-cover rounded-lg border border-teal-200" />
                  <button type="button" onClick={() => setField('foto_url', '')} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                  <Badge className="mt-1 bg-teal-100 text-teal-700 border-teal-200 text-xs block text-center">Face ID pronto</Badge>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Secção: Validade e Controlo */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">Validade e Controlo de Acesso</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Data de Início de Acesso</Label>
            <Input type="date" value={formData.data_inicio || ''} onChange={e => setField('data_inicio', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de Fim de Acesso</Label>
            <Input type="date" value={formData.data_fim || ''} onChange={e => setField('data_fim', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Grupo de Acesso (1-99)</Label>
            <Input type="number" min="1" max="99" placeholder="1" value={formData.grupo_acesso || ''} onChange={e => setField('grupo_acesso', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Horário de Acesso</Label>
            <Select value={formData.horario_acesso || 'all'} onValueChange={v => setField('horario_acesso', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Acesso Total (24h)</SelectItem>
                <SelectItem value="work">Horário de Trabalho</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Secção: Terminais */}
      {terminals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-700">🖥️ Terminais Associados</span>
            <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs">{selectedTerminals.length} selecionado(s)</Badge>
          </div>
          {isAdmin && (
            <Select value={filterDialogTerminalOwner || 'all'} onValueChange={v => { setFilterDialogTerminalOwner(v === 'all' ? '' : v); setSelectedTerminals([]); }}>
              <SelectTrigger className="h-8 w-full text-xs mb-2"><SelectValue placeholder="Filtrar por dono" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os donos</SelectItem>
                {appUsers.map(u => <SelectItem key={u.email} value={u.email}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {filteredDialogTerminals.map(t => (
              <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-3 py-2">
                <input type="checkbox" checked={selectedTerminals.includes(t.id)} onChange={() => toggleTerminal(t.id)} className="rounded" />
                <span className="text-sm flex-1">{t.nome}</span>
                <span className="text-xs text-slate-400">{t.local}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Secção: Observações + Estado */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Observações</Label>
          <Textarea rows={2} placeholder="Notas adicionais..." value={formData.observacoes || ''} onChange={e => setField('observacoes', e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={formData.ativo !== false} onCheckedChange={v => setField('ativo', v)} />
          <Label className="text-sm">Colaborador Ativo</Label>
        </div>
      </div>
    </div>
  );
}