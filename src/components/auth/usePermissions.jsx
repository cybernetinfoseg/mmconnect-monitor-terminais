/**
 * Role-based permission system
 *
 * Roles:
 *  admin  - full access to everything
 *  editor - can view and edit terminals/clients, configure alerts; cannot manage users or access admin/audit
 *  viewer - read-only access to dashboard, terminals, incidents, history
 */

export const ROLE_DEFAULTS = {
  admin: {
    paginas_permitidas: ['Dashboard', 'Terminais', 'Clientes', 'History', 'Incidents', 'Alertas', 'Configuracoes', 'Administracao', 'Auditoria'],
    pode_configurar_alertas: true,
    pode_gerenciar_usuarios: true,
    pode_editar_terminais: true,
    pode_editar_clientes: true,
    limite_terminais: 9999,
  },
  editor: {
    paginas_permitidas: ['Dashboard', 'Terminais', 'Clientes', 'History', 'Incidents', 'Alertas', 'Configuracoes'],
    pode_configurar_alertas: true,
    pode_gerenciar_usuarios: false,
    pode_editar_terminais: true,
    pode_editar_clientes: true,
    limite_terminais: 50,
  },
  viewer: {
    paginas_permitidas: ['Dashboard', 'Terminais', 'History', 'Incidents'],
    pode_configurar_alertas: false,
    pode_gerenciar_usuarios: false,
    pode_editar_terminais: false,
    pode_editar_clientes: false,
    limite_terminais: 0,
  },
};

export const ROLE_LABELS = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
};

export const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  editor: 'bg-blue-100 text-blue-700 border-blue-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * Returns resolved permissions for a user.
 * Individual fields override role defaults if explicitly set on the user record.
 */
export function resolvePermissions(user) {
  if (!user) return { ...ROLE_DEFAULTS.viewer, role: 'viewer', isAdmin: false, isEditor: false, isViewer: true, canEdit: false };

  const role = user.role || 'viewer';
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer;

  return {
    role,
    isAdmin: role === 'admin',
    isEditor: role === 'editor',
    isViewer: role === 'viewer',
    canEdit: role === 'admin' || role === 'editor',
    paginas_permitidas: user.paginas_permitidas?.length
      ? user.paginas_permitidas
      : defaults.paginas_permitidas,
    pode_configurar_alertas:
      user.pode_configurar_alertas != null ? user.pode_configurar_alertas : defaults.pode_configurar_alertas,
    pode_gerenciar_usuarios:
      user.pode_gerenciar_usuarios != null ? user.pode_gerenciar_usuarios : defaults.pode_gerenciar_usuarios,
    pode_editar_terminais:
      user.pode_editar_terminais != null ? user.pode_editar_terminais : defaults.pode_editar_terminais,
    pode_editar_clientes:
      user.pode_editar_clientes != null ? user.pode_editar_clientes : defaults.pode_editar_clientes,
    limite_terminais:
      user.limite_terminais != null ? user.limite_terminais : defaults.limite_terminais,
  };
}