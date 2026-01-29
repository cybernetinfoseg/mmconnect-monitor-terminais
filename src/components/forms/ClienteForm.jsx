import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Save, X } from 'lucide-react';

export default function ClienteForm({ open, onClose, cliente, onSave, isLoading }) {
  const [form, setForm] = useState({
    nome: '',
    cnpj: '',
    contato_nome: '',
    contato_email: '',
    contato_telefone: '',
    endereco: '',
    cidade: '',
    estado: '',
    ativo: true,
    observacoes: ''
  });

  useEffect(() => {
    if (cliente) {
      setForm(cliente);
    } else {
      setForm({
        nome: '',
        cnpj: '',
        contato_nome: '',
        contato_email: '',
        contato_telefone: '',
        endereco: '',
        cidade: '',
        estado: '',
        ativo: true,
        observacoes: ''
      });
    }
  }, [cliente, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-500" />
            {cliente ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Empresa *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({...form, nome: e.target.value})}
                placeholder="Nome do cliente"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={form.cnpj}
                onChange={(e) => setForm({...form, cnpj: e.target.value})}
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-slate-500 mb-3">Contato Principal</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contato_nome">Nome</Label>
                <Input
                  id="contato_nome"
                  value={form.contato_nome}
                  onChange={(e) => setForm({...form, contato_nome: e.target.value})}
                  placeholder="Nome do contato"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contato_email">Email</Label>
                <Input
                  id="contato_email"
                  type="email"
                  value={form.contato_email}
                  onChange={(e) => setForm({...form, contato_email: e.target.value})}
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contato_telefone">Telefone</Label>
                <Input
                  id="contato_telefone"
                  value={form.contato_telefone}
                  onChange={(e) => setForm({...form, contato_telefone: e.target.value})}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-slate-500 mb-3">Endereço</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={form.endereco}
                  onChange={(e) => setForm({...form, endereco: e.target.value})}
                  placeholder="Rua, número, bairro"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={form.cidade}
                    onChange={(e) => setForm({...form, cidade: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Input
                    id="estado"
                    value={form.estado}
                    onChange={(e) => setForm({...form, estado: e.target.value})}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={form.observacoes}
              onChange={(e) => setForm({...form, observacoes: e.target.value})}
              placeholder="Notas adicionais sobre o cliente"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              <Switch
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(checked) => setForm({...form, ativo: checked})}
              />
              <Label htmlFor="ativo">Cliente ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}