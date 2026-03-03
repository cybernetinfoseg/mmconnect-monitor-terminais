import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, UserPlus, Pencil, X, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ALL_PAGES = ['Dashboard', 'Terminais', 'Clientes', 'History', 'Incidents', 'Alertas', 'Configuracoes', 'Administracao'];

const PAGE_LABELS = {
  Dashboard: 'Dashboard',
  Terminais: 'Terminais',
  Clientes: 'Clientes',
  History: 'Histórico',
  Incidents: 'Incidentes',
  Alertas: 'Alertas',
  Configuracoes: 'Configurações',
  Administracao: 'Administração',
};

const EMPTY_FORM = {
  email: '',
  role: 'user',
  paginas_permitidas: ['Dashboard', 'Terminais', 'Incidents'],
  pode_configurar_alertas: false,
  pode_gerenciar_usuarios: false,
};

export default function Administracao() {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.auth.updateMe ? 
      base44.entities.User.update(id, data) :
      base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Permissões atualizadas');
      handleCancel();
    },
    onError: () => toast.error('Erro ao atualizar permissões'),
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      return base44.users.inviteUser(email, role === 'admin' ? 'admin' : 'user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Convite enviado!');
      handleCancel();
    },
    onError: () => toast.error('Erro ao enviar convite'),
  });

  const handleEdit = (user) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      role: user.role || 'user',
      paginas_permitidas: user.paginas_permitidas || ['Dashboard', 'Terminais'],
      pode_configurar_alertas: user.pode_configurar_alertas || false,
      pode_gerenciar_usuarios: user.pode_gerenciar_usuarios || false,
    });
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        data: {
          role: form.role,
          paginas_permitidas: form.paginas_permitidas,
          pode_configurar_alertas: form.pode_configurar_alertas,
          pode_gerenciar_usuarios: form.pode_gerenciar_usuarios,
        },
      });
    } else {
      inviteMutation.mutate({ email: form.email, role: form.role });
    }
  };

  const togglePage = (page) => {
    setForm(prev => ({
      ...prev,
      paginas_permitidas: prev.paginas_permitidas.includes(page)
        ? prev.paginas_permitidas.filter(p => p !== page)
        : [...prev.paginas_permitidas, page],
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 rounded-xl">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Administração</h1>
            <p className="text-sm text-slate-500">Gerencie usuários e permissões do sistema</p>
          </div>
        </div>

        {/* User Management Card */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-slate-600" />
              Gerenciamento de Usuários
            </CardTitle>
            {!showForm && (
              <Button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 gap-2">
                <UserPlus className="h-4 w-4" />
                Adicionar Permissão
              </Button>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Form */}
            {showForm && (
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Email do Usuário</Label>
                    <Input
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="usuario@email.com"
                      disabled={!!editingUser}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={v => setForm(prev => ({ ...prev, role: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="user">Usuário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Páginas Permitidas</Label>
                  <div className="flex flex-wrap gap-3">
                    {ALL_PAGES.map(page => (
                      <label key={page} className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
                        <Checkbox
                          checked={form.paginas_permitidas.includes(page)}
                          onCheckedChange={() => togglePage(page)}
                        />
                        {PAGE_LABELS[page]}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <Checkbox
                      checked={form.pode_configurar_alertas}
                      onCheckedChange={v => setForm(prev => ({ ...prev, pode_configurar_alertas: !!v }))}
                    />
                    Pode Configurar Alertas
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <Checkbox
                      checked={form.pode_gerenciar_usuarios}
                      onCheckedChange={v => setForm(prev => ({ ...prev, pode_gerenciar_usuarios: !!v }))}
                    />
                    Pode Gerenciar Usuários
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleCancel} className="gap-1">
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending || inviteMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 gap-1"
                  >
                    <Check className="h-4 w-4" />
                    {editingUser ? 'Salvar' : 'Enviar Convite'}
                  </Button>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Páginas</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Permissões</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum usuário encontrado</td></tr>
                  ) : users.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge className={cn(
                          "text-xs",
                          user.role === 'admin'
                            ? "bg-purple-100 text-purple-700 border-purple-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        )}>
                          {user.role === 'admin' ? '⊙ Admin' : 'Usuário'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs max-w-xs truncate">
                        {(user.paginas_permitidas || []).map(p => PAGE_LABELS[p] || p).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {user.pode_configurar_alertas && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Alertas</Badge>
                          )}
                          {user.pode_gerenciar_usuarios && (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Usuários</Badge>
                          )}
                          {!user.pode_configurar_alertas && !user.pode_gerenciar_usuarios && (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                          className="h-8 w-8 text-slate-400 hover:text-blue-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}