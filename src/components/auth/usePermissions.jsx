// Permission resolution helper — RBAC v2.0
// Roles: super_admin (plataforma), admin (tenant), operator (operação), viewer (consulta)

import { 
  LayoutDashboard, Monitor, AlertTriangle, Tv, Bell, Shield, Settings,
  ClipboardList, Wrench, MapPin, Users, Share2, Building2, Briefcase,
  TrendingUp, Activity, UserCheck,
} from 'lucide-react';

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Visualizador',
};

export const ROLE_COLORS = {
  super_admin: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300',
  admin: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
  operator: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
  viewer: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
};

// Módulos da sidebar — cada módulo e item pode ter roles específicas
export const NAV_MODULES = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['super_admin', 'admin', 'operator', 'viewer'],
    items: [
      { name: 'Executivo', page: 'DashboardExecutivo', icon: TrendingUp },
      { name: 'Operacional', page: 'Dashboard', icon: LayoutDashboard },
      { name: 'Técnico', page: 'DashboardTecnico', icon: Activity, roles: ['super_admin', 'admin'] },
    ]
  },
  {
    label: 'Monitoramento',
    icon: Monitor,
    roles: ['super_admin', 'admin', 'operator', 'viewer'],
    items: [
      { name: 'Terminais', page: 'Terminais', icon: Monitor },
      { name: 'Mapa', page: 'Mapa', icon: MapPin },
      { name: 'Incidentes', page: 'Incidents', icon: AlertTriangle },
      { name: 'Alertas', page: 'Alertas', icon: Bell },
      { name: 'Modo TV', page: 'TVMode', icon: Tv },
    ]
  },
  {
    label: 'Operações',
    icon: Briefcase,
    roles: ['super_admin', 'admin', 'operator'],
    items: [
      { name: 'Recursos Humanos', page: 'RH', icon: Briefcase },
      { name: 'Controlo de Acesso', page: 'AcessoHub', icon: Shield },
      { name: 'Visitantes', page: 'Visitantes', icon: UserCheck },
    ]
  },
  {
    label: 'Integrações',
    icon: Share2,
    roles: ['super_admin', 'admin'],
    items: [
      { name: 'Agentes', page: 'AgentesLocais', icon: Wrench },
      { name: 'Exportação', page: 'ExportacaoMarcacoes', icon: Share2, roles: ['super_admin', 'admin'] },
    ]
  },
  {
    label: 'Administração',
    icon: Settings,
    roles: ['super_admin', 'admin'],
    items: [
      { name: 'Tenants', page: 'Tenants', icon: Building2, roles: ['super_admin'] },
      { name: 'Sites', page: 'Sites', icon: MapPin, roles: ['super_admin', 'admin'] },
      { name: 'Usuários', page: 'Utilizadores', icon: Users },
      { name: 'API Keys', page: 'Administracao', icon: Shield, roles: ['super_admin'] },
      { name: 'Auditoria', page: 'Auditoria', icon: ClipboardList, roles: ['super_admin', 'admin'] },
      { name: 'Configurações', page: 'Configuracoes', icon: Settings, roles: ['super_admin', 'admin'] },
    ]
  },
];

// Mobile bottom nav items — role-filtered at runtime
export const BOTTOM_NAV_ITEMS = [
  { name: 'Início', page: 'DashboardExecutivo', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { name: 'Terminais', page: 'Terminais', icon: Monitor, roles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { name: 'RH', page: 'RH', icon: Briefcase, roles: ['super_admin', 'admin', 'operator'] },
  { name: 'Agentes', page: 'AgentesLocais', icon: Wrench, roles: ['super_admin', 'admin'] },
];

const ALL_PAGES = [
  'Dashboard', 'TVMode', 'Terminais', 'Mapa', 'History',
  'Incidents', 'Alertas', 'Manutencao', 'Agendamentos', 'Relatorios',
  'Auditoria', 'Configuracoes', 'Administracao',
  'Utilizadores', 'Marcacoes', 'ExportacaoMarcacoes',
  'Presenca', 'GestaoHorarios', 'GestaoAusencias', 'ControloAcesso', 'RelatorioPresencaDiaria',
  'RH', 'FichaColaborador', 'GestaoContratos', 'GestaoFeriasRH',
  'HorasExtra', 'BancoHoras', 'MapaAssiduidade',
  'Payroll', 'Recibos',
  'ZonasAcesso', 'Visitantes', 'AcessoHub',
  'RelatorioMovimentos', 'AlertasCompliance', 'JustificacaoFaltas',
  'GestAoBaixas', 'GestaoDesempenho', 'GestaoFormacao', 'DocumentosColaborador',
  'FichaSalarial', 'CustosDepartamentos', 'Adiantamentos', 'Organigrama',
  'ColaboradorPerfil', 'DashboardRHExecutivo', 'RelatorioAbsentismo',
  'DashboardExecutivo', 'DashboardTecnico', 'AgentesLocais',
  'Tenants', 'Sites',
];

// Páginas RESTRITAS para cada role (acumulativo: super_admin vê tudo)
const ROLE_RESTRICTED_PAGES = {
  viewer: [
    'Administracao', 'Configuracoes', 'Auditoria', 'Utilizadores',
    'RH', 'FichaColaborador', 'GestaoContratos', 'GestaoFeriasRH',
    'HorasExtra', 'BancoHoras', 'MapaAssiduidade', 'Payroll', 'Recibos',
    'GestaoFormacao', 'DocumentosColaborador', 'FichaSalarial',
    'CustosDepartamentos', 'Adiantamentos', 'Organigrama',
    'ExportacaoMarcacoes', 'AgentesLocais', 'Tenants', 'Sites',
    'Manutencao', 'Agendamentos', 'DashboardTecnico',
  ],
  operator: [
    'Administracao', 'Configuracoes', 'Auditoria',
    'ExportacaoMarcacoes', 'AgentesLocais', 'Tenants', 'Sites',
    'DashboardTecnico',
  ],
  admin: [
    'Tenants',
  ],
  super_admin: [],
};

export function resolvePermissions(user) {
  const role = user?.role || 'viewer';

  const restricted = ROLE_RESTRICTED_PAGES[role] || [];
  const paginas_permitidas = ALL_PAGES.filter(p => !restricted.includes(p));

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isOperator = role === 'operator' || isAdmin;
  const isViewer = true;

  return {
    role,
    isSuperAdmin,
    isAdmin,
    isOperator,
    isViewer,
    paginas_permitidas,
    // Flags de funcionalidade
    pode_editar_terminais: !['viewer'].includes(role),
    pode_configurar_alertas: isAdmin,
    pode_gerir_tenants: isSuperAdmin,
    pode_gerir_usuarios: isAdmin,
    pode_ver_rh: isOperator,
    pode_exportar: isAdmin,
    pode_configurar_sistema: isAdmin,
    limite_terminais: user?.limite_terminais ?? (isSuperAdmin ? 999 : 10),
    tenant_id: user?.tenant_id || null,
  };
}

// Helper: filtra módulos da NAV com base no role do utilizador
export function filterNavModules(modules, userRole) {
  return modules
    .filter(mod => {
      const allowed = mod.roles || ['super_admin'];
      return allowed.includes(userRole);
    })
    .map(mod => ({
      ...mod,
      items: mod.items.filter(item => {
        const allowed = item.roles || mod.roles || ['super_admin'];
        return allowed.includes(userRole);
      })
    }))
    .filter(mod => mod.items.length > 0);
}