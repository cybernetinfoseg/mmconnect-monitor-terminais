import React, { useState } from 'react';
import { Shield, Users, MapPin, DoorOpen, UserCheck, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

// Importar as páginas existentes como componentes embutidos
import ControloAcesso from './ControloAcesso';
import Mapa from './Mapa';
import ZonasAcesso from './ZonasAcesso';
import Visitantes from './Visitantes';
import Utilizadores from './Utilizadores';

const TABS = [
  { id: 'controlo',     label: 'Controlo de Portas',      icon: Shield,    desc: 'Comandos remotos de portas e terminais' },
  { id: 'biometricos',  label: 'Utilizadores Biométricos', icon: Users,     desc: 'Credenciais e sincronização com terminais' },
  { id: 'zonas',        label: 'Zonas de Acesso',          icon: DoorOpen,  desc: 'Áreas restritas e regras de acesso' },
  { id: 'visitantes',   label: 'Visitantes',               icon: UserCheck, desc: 'Registos de entrada e badges temporários' },
  { id: 'mapa',         label: 'Mapa de Terminais',        icon: MapPin,    desc: 'Planta baixa interativa' },
];

export default function AcessoHub() {
  const [activeTab, setActiveTab] = useState('controlo');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 w-full">
      {/* Header */}
      <div className="border-b border-slate-700/60 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          {/* Título */}
          <div className="flex items-center gap-3 pt-4 pb-2">
            <div className="p-2 bg-blue-900/60 border border-blue-700/50 rounded-xl shrink-0">
              <Monitor className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Controlo de Acesso</h1>
              <p className="text-xs text-slate-400">Gestão centralizada de acessos, zonas, visitantes e planta</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 overflow-x-auto pb-0 scrollbar-none">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all shrink-0',
                    active
                      ? 'border-blue-400 text-blue-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Conteúdo — cada tab renderiza a sua página original sem header próprio */}
      <div className="w-full">
        {activeTab === 'controlo' && (
          <div className="[&>div>div>div:first-child]:hidden">
            {/* Esconde o header interno da ControloAcesso pois já temos o hub */}
            <ControloAcessoInner />
          </div>
        )}
        {activeTab === 'biometricos' && <UtilizadoresWrapper />}
        {activeTab === 'zonas' && <ZonasWrapper />}
        {activeTab === 'visitantes' && <VisitantesWrapper />}
        {activeTab === 'mapa' && <MapaWrapper />}
      </div>
    </div>
  );
}

// Wrappers leves — apenas montam o componente existente com ajustes de fundo
function ControloAcessoInner() {
  return <ControloAcesso />;
}

function UtilizadoresWrapper() {
  return (
    <div className="bg-slate-50 min-h-screen">
      <Utilizadores />
    </div>
  );
}

function ZonasWrapper() {
  return (
    <div className="bg-slate-50 min-h-screen">
      <ZonasAcesso />
    </div>
  );
}

function VisitantesWrapper() {
  return (
    <div className="bg-slate-50 min-h-screen">
      <Visitantes />
    </div>
  );
}

function MapaWrapper() {
  return (
    <div className="bg-slate-50 min-h-screen">
      <Mapa />
    </div>
  );
}