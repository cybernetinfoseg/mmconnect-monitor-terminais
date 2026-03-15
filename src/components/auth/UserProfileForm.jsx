import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserCircle, Phone, MessageSquare, Loader } from 'lucide-react';
import { toast } from 'sonner';

export default function UserProfileForm({ user, onSuccess, isEditMode = false }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: user?.nome || '',
    sobrenome: user?.sobrenome || '',
    telefone: user?.telefone || '',
    motivo_acesso: user?.motivo_acesso || '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.nome.trim() || !form.sobrenome.trim() || !form.telefone.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      // Update user profile
      await base44.auth.updateMe({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        telefone: form.telefone.trim(),
        motivo_acesso: form.motivo_acesso.trim(),
        ...(isEditMode ? {} : { 
          primeiroAcesso: false,
          data_inscricao: new Date().toISOString(),
        }),
      });

      if (!isEditMode) {
        // Notify admin about new user registration (only on first submission)
        await base44.functions.invoke('notifyAdminNewUser', {
          email: user.email,
          nome: form.nome.trim(),
          sobrenome: form.sobrenome.trim(),
          telefone: form.telefone.trim(),
          motivo_acesso: form.motivo_acesso.trim(),
          data_inscricao: new Date().toLocaleString('pt-BR'),
        });
      }

      toast.success(isEditMode ? 'Perfil atualizado com sucesso!' : 'Perfil preenchido com sucesso! Aguarde a aprovação do admin.');
      onSuccess();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar perfil');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="nome" className="text-slate-700 font-medium">
            <span className="flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Primeiro Nome *
            </span>
          </Label>
          <Input
            id="nome"
            value={form.nome}
            onChange={(e) => setForm(prev => ({ ...prev, nome: e.target.value }))}
            placeholder="João"
            required
            className="border-slate-300"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sobrenome" className="text-slate-700 font-medium">
            Sobrenome *
          </Label>
          <Input
            id="sobrenome"
            value={form.sobrenome}
            onChange={(e) => setForm(prev => ({ ...prev, sobrenome: e.target.value }))}
            placeholder="Silva"
            required
            className="border-slate-300"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="telefone" className="text-slate-700 font-medium">
          <span className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Telefone de Contato *
          </span>
        </Label>
        <Input
          id="telefone"
          value={form.telefone}
          onChange={(e) => setForm(prev => ({ ...prev, telefone: e.target.value }))}
          placeholder="+55 11 99999-9999"
          required
          className="border-slate-300"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="motivo" className="text-slate-700 font-medium">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Motivo para Solicitar Acesso
          </span>
        </Label>
        <Textarea
          id="motivo"
          value={form.motivo_acesso}
          onChange={(e) => setForm(prev => ({ ...prev, motivo_acesso: e.target.value }))}
          placeholder="Descreva brevemente por que precisa acessar o sistema..."
          rows={4}
          className="border-slate-300"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2"
      >
        {loading ? (
          <>
            <Loader className="h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          isEditMode ? 'Salvar Alterações' : 'Preencher Perfil e Solicitar Acesso'
        )}
      </Button>
    </form>
  );
}