import React, { useState } from 'react';
import { Shield, MapPin, DoorOpen, UserCheck, Monitor, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Importar as páginas existentes como componentes embutidos
import ControloAcesso from './ControloAcesso';
import Mapa from './Mapa';
import ZonasAcesso from './ZonasAcesso';
import Visitantes from './Visitantes';
import RelatoriMovimentos from './RelatoriMovimentos';

const TABS = [
{ id: 'controlo', label: 'Controlo de Portas', icon: Shield, desc: 'Comandos remotos de portas e terminais' },
{ id: 'zonas', label: 'Zonas de Acesso', icon: DoorOpen, desc: 'Áreas restritas e regras de acesso' },
{ id: 'visitantes', label: 'Visitantes', icon: UserCheck, desc: 'Registos de entrada e badges temporários' },
{ id: 'mapa', label: 'Mapa de Terminais', icon: MapPin, desc: 'Planta baixa interativa' },
{ id: 'movimentos', label: 'Relatório Movimentos', icon: BarChart3, desc: 'Trilho completo de acessos por pessoa ou terminal' }];


export default function AcessoHub() {
  const [activeTab, setActiveTab] = useState('controlo');

  return (
    <div className="min-h-screen bg-slate-50 w-full">
      {/* Header */}
      <div className="w-full max-w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
        <div className="mx-auto px-3 sm:px-6 max-w-full">
          {/* Título */}
          <div className="flex items-center gap-3 pt-4 pb-2">
            <div className="p-2 bg-slate-900 rounded-xl shrink-0">
              <Monitor className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Controlo de Acesso</h1>
              <p className="text-xs text-slate-500">Gestão centralizada de acessos, zonas, visitantes e planta</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-center text-muted-foreground flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all shrink-0',
                    active ?
                    'border-slate-900 text-slate-900' :
                    'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}>
                  
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>);

            })}
          </div>
        </div>
      </div>

      {/* Conteúdo — cada tab renderiza a sua página original sem header próprio */}
      <div className="w-full">
        {activeTab === 'controlo' &&
        <div className="[&>div>div>div:first-child]:hidden">
            {/* Esconde o header interno da ControloAcesso pois já temos o hub */}
            <ControloAcessoInner />
          </div>
        }
        {activeTab === 'zonas' && <ZonasWrapper />}
        {activeTab === 'visitantes' && <VisitantesWrapper />}
        {activeTab === 'mapa' && <MapaWrapper />}
        {activeTab === 'movimentos' && <RelatoriMovimentosWrapper />}
      </div>
    </div>);

}

// Wrappers leves — apenas montam o componente existente com ajustes de fundo
function ControloAcessoInner() {
  return <ControloAcesso />;
}

function ZonasWrapper() {
  return <ZonasAcesso />;
}

function VisitantesWrapper() {
  return <Visitantes />;
}

function MapaWrapper() {
  return <Mapa />;
}

function RelatoriMovimentosWrapper() {
  return <RelatoriMovimentos />;
}