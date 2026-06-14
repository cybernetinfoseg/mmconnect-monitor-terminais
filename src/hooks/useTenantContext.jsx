// useTenantContext — Reusable tenant context for v2.0 multi-tenant platform
// Provides currentUser, permissions, tenant_id, and helpers for filtering
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { resolvePermissions } from '@/components/auth/usePermissions.jsx';

export default function useTenantContext() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const perms = resolvePermissions(currentUser);
  const userTenantId = perms.tenant_id;

  // Helper: filter items by tenant context
  // For super_admin: returns all items
  // For others: filters by tenant_id (requires items to have tenant_id field)
  const filterByTenant = (items = [], tenantField = 'tenant_id') => {
    if (perms.isSuperAdmin || !userTenantId) return items;
    return items.filter(item => item[tenantField] === userTenantId);
  };

  // Helper: filter items that belong to sites in the user's tenant
  const filterBySiteTenant = (items = [], sites = [], siteIdField = 'site_id') => {
    if (perms.isSuperAdmin || !userTenantId) return items;
    const tenantSiteIds = new Set(
      sites.filter(s => s.tenant_id === userTenantId).map(s => s.id)
    );
    return items.filter(item => tenantSiteIds.has(item[siteIdField]));
  };

  return {
    currentUser,
    perms,
    userTenantId,
    isSuperAdmin: perms.isSuperAdmin,
    isAdmin: perms.isAdmin,
    isOperator: perms.isOperator,
    filterByTenant,
    filterBySiteTenant,
  };
}