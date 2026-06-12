import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';

export default function Organigrama() {
  const [expandido, setExpandido] = useState({});

  const { data: organigramas = [] } = useQuery({
    queryKey: ['organigrama'],
    queryFn: () => base44.entities.Organigrama.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_org'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const raiz = useMemo(() => {
    return organigramas.filter(o => !o.gestor_id).sort((a, b) => b.nivel - a.nivel);
  }, [organigramas]);

  const construirArvore = (id, nivel = 0) => {
    const subordinados = organigramas.filter(o => o.gestor_id === id);
    return subordinados.sort((a, b) => a.nome.localeCompare(b.nome));
  };

  const toggle = (id) => {
    setExpandido(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const OrgNode = ({ node }) => {
    const subordinados = construirArvore(node.colaborador_id);
    const temSubordinados = subordinados.length > 0;

    return (
      <div key={node.id}>
        <div className="flex items-center gap-2 py-2 px-4 bg-slate-50 rounded-lg mb-1 hover:bg-slate-100 cursor-pointer group">
          {temSubordinados ? (
            <button onClick={() => toggle(node.id)} className="p-1">
              {expandido[node.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-6" />
          )}
          <Users className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm text-slate-900">{node.nome}</p>
            <p className="text-xs text-slate-600">{node.cargo}</p>
          </div>
          <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-700">{node.numero_subordinados || 0} subordinados</span>
        </div>
        {temSubordinados && expandido[node.id] && (
          <div className="ml-6 border-l-2 border-slate-200 pl-4">
            {subordinados.map(sub => <OrgNode key={sub.id} node={sub} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Organigrama da Empresa</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Estrutura Organizacional</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {raiz.length > 0 ? (
                raiz.map(node => <OrgNode key={node.id} node={node} />)
              ) : (
                <p className="text-slate-600">Nenhuma estrutura organizacional definida</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Estatísticas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600">Total de Posições</p>
                <p className="text-2xl font-bold">{organigramas.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Departamentos</p>
                <p className="text-2xl font-bold">{new Set(organigramas.map(o => o.departamento)).size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}