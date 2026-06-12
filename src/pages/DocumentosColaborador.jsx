import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileText, Lock, Download, Trash2 } from 'lucide-react';

export default function DocumentosColaborador() {
  const [newDoc, setNewDoc] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data: documentos = [] } = useQuery({
    queryKey: ['documentos'],
    queryFn: () => base44.entities.DocumentoColaborador.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_docs'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DocumentoColaborador.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documentos'] })
  });

  const filtered = documentos.filter(d => d.colaborador_nome?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Documentos de Colaboradores</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Upload Documento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Carregar Documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <select value={newDoc.colaborador_id || ''} onChange={(e) => { const c = colaboradores.find(x => x.id === e.target.value); setNewDoc({ ...newDoc, colaborador_id: e.target.value, colaborador_nome: c?.nome, enrollid: c?.enrollid }); }} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select value={newDoc.tipo || ''} onChange={(e) => setNewDoc({ ...newDoc, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Tipo de documento...</option>
                  <option value="contrato">Contrato</option>
                  <option value="certificado">Certificado</option>
                  <option value="diploma">Diploma</option>
                  <option value="atestado">Atestado</option>
                  <option value="outro">Outro</option>
                </select>
                <input type="text" placeholder="Descrição" value={newDoc.descricao || ''} onChange={(e) => setNewDoc({ ...newDoc, descricao: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-600">Clique para selecionar arquivo</p>
                </div>
                <Button className="w-full">Carregar Documento</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <input
          placeholder="Buscar colaborador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-6 w-full px-3 py-2 border rounded-md"
        />

        <div className="grid gap-4">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4 flex-1">
                    <FileText className="h-10 w-10 text-slate-400 shrink-0 mt-1" />
                    <div>
                      <h3 className="font-semibold text-slate-900">{d.descricao || d.tipo}</h3>
                      <p className="text-sm text-slate-600">{d.colaborador_nome}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(d.data_upload).toLocaleDateString('pt-PT')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.confidencial && <Lock className="h-4 w-4 text-slate-400" />}
                    <Badge className="bg-slate-100 text-slate-700">{d.tipo}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}