/**
 * Role-based permission system
 *
 * All authenticated users have access to their own data in all pages.
 * Mensagens and Administracao are admin-only.
 * Admin sees all data from all users.
 */

export const ROLE_LABELS = {
  admin: 'Administrador',
  user: 'Utilizador',
};

export const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  user: 'bg-blue-100 text-blue-700 border-blue-200',
};

// Pages every authenticated user can access (with own data)
const USER_PAGES = [
  'Dashboard',
  'TVMode',
  'Terminais',
  'Clientes',
  'History',
  'Incidents',
  'Alertas',
  'Manutencao',
  'Relatorios',
  'Auditoria',
  'Configuracoes',
];

// Extra pages only for admins
const ADMIN_ONLY_PAGES = ['Mensagens', 'Administracao'];

/**
 * Returns resolved permissions for a user.
 */
export function resolvePermissions(user) {
  if (!user) {
    return {
      role: 'user',
      isAdmin: false,
      canEdit: false,
      paginas_permitidas: [],
      pode_configurar_alertas: false,
      pode_gerenciar_usuarios: false,
      pode_editar_terminais: false,
      pode_editar_clientes: false,
      limite_terminais: 0,
    };
  }

  const role = user.role || 'user';

  if (role === 'admin') {
    return {
      role: 'admin',
      isAdmin: true,
      canEdit: true,
      paginas_permitidas: [...USER_PAGES, ...ADMIN_ONLY_PAGES],
      pode_configurar_alertas: true,
      pode_gerenciar_usuarios: true,
      pode_editar_terminais: true,
      pode_editar_clientes: true,
      limite_terminais: 9999,
    };
  }

  // Regular users: access all standard pages with their own data
  return {
    role,
    isAdmin: false,
    canEdit: true,
    paginas_permitidas: USER_PAGES,
    pode_configurar_alertas: true,
    pode_gerenciar_usuarios: false,
    pode_editar_terminais: true,
    pode_editar_clientes: true,
    limite_terminais: user.limite_terminais ?? 50,
  };
}