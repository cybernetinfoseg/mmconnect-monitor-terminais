import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, Save, X, Network, Settings, Info } from 'lucide-react';

export default function TerminalForm({ open, onClose, terminal, clientes, onSave, isLoading }) {
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    cliente_id: '',
    cliente_nome: '',
    local: '',
    ip_local: '',
    ip_publico: '',
    dns: '',
    porta: 80,
    metodo_conexao: 'ip_local',
    protocolo: 'http',
    timeout_segundos: 30,
    intervalo_ping: 60,
    mac_address: '',
    modelo: '',
    fabricante: '',
    numero_serie: '',
    firmware_versao: '',
    monitoramento_ativo: true,
    notificar_offline: true,
    status: 'unknown'
  });

  useEffect(() => {
    if (terminal) {
      setForm({...form, ...terminal});
    } else {
      setForm({
        nome: '',
        descricao: '',
        cliente_id: '',
        cliente_nome: '',
        local: '',
        ip_local: '',
        ip_publico: '',
        dns: '',
        porta: 80,
        metodo_conexao: 'ip_local',
        protocolo: 'http',
        timeout_segundos: 30,
        intervalo_ping: 60,
        mac_address: '',
        modelo: '',
        fabricante: '',
        numero_serie: '',
        firmware_versao: '',
        monitoramento_ativo: true,
        notificar_offline: true,
        status: 'unknown'
      });
    }
  }, [terminal, open]);

  const handleClienteChange = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    setForm({
      ...form,
      cliente_id: clienteId,
      cliente_nome: cliente?.nome || ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-emerald-500" />
            {terminal ? 'Editar Terminal' : 'Novo Terminal'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                Básico
              </TabsTrigger>
              <TabsTrigger value="network" className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Rede
              </TabsTrigger>
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuração
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Terminal *</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm({...form, nome: e.target.value})}
                    placeholder="BIO-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente_id">Cliente *</Label>
                  <Select 
                    value={form.cliente_id} 
                    onValueChange={handleClienteChange}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((cliente) => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="local">Localização</Label>
                <Input
                  id="local"
                  value={form.local}
                  onChange={(e) => setForm({...form, local: e.target.value})}
                  placeholder="Ex: Recepção Principal, Portaria A"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={form.descricao}
                  onChange={(e) => setForm({...form, descricao: e.target.value})}
                  placeholder="Descrição detalhada do terminal"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fabricante">Fabricante</Label>
                  <Input
                    id="fabricante"
                    value={form.fabricante}
                    onChange={(e) => setForm({...form, fabricante: e.target.value})}
                    placeholder="Ex: Henry"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modelo">Modelo</Label>
                  <Input
                    id="modelo"
                    value={form.modelo}
                    onChange={(e) => setForm({...form, modelo: e.target.value})}
                    placeholder="Ex: Hexa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero_serie">Nº Série</Label>
                  <Input
                    id="numero_serie"
                    value={form.numero_serie}
                    onChange={(e) => setForm({...form, numero_serie: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firmware_versao">Firmware</Label>
                  <Input
                    id="firmware_versao"
                    value={form.firmware_versao}
                    onChange={(e) => setForm({...form, firmware_versao: e.target.value})}
                    placeholder="v1.2.3"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="network" className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-slate-700 mb-2">Método de Conexão</h4>
                <p className="text-sm text-slate-500">
                  Defina como o sistema irá se conectar ao terminal para monitoramento.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ip_local">IP Local</Label>
                  <Input
                    id="ip_local"
                    value={form.ip_local}
                    onChange={(e) => setForm({...form, ip_local: e.target.value})}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ip_publico">IP Público</Label>
                  <Input
                    id="ip_publico"
                    value={form.ip_publico}
                    onChange={(e) => setForm({...form, ip_publico: e.target.value})}
                    placeholder="200.100.50.25"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dns">DNS Dinâmico</Label>
                  <Input
                    id="dns"
                    value={form.dns}
                    onChange={(e) => setForm({...form, dns: e.target.value})}
                    placeholder="terminal1.no-ip.org"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="porta">Porta</Label>
                  <Input
                    id="porta"
                    type="number"
                    value={form.porta}
                    onChange={(e) => setForm({...form, porta: parseInt(e.target.value) || 80})}
                    placeholder="80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metodo_conexao">Método Preferencial</Label>
                  <Select 
                    value={form.metodo_conexao} 
                    onValueChange={(v) => setForm({...form, metodo_conexao: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ip_local">IP Local</SelectItem>
                      <SelectItem value="ip_publico">IP Público</SelectItem>
                      <SelectItem value="dns">DNS Dinâmico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protocolo">Protocolo</Label>
                  <Select 
                    value={form.protocolo} 
                    onValueChange={(v) => setForm({...form, protocolo: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">HTTP</SelectItem>
                      <SelectItem value="https">HTTPS</SelectItem>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="icmp">ICMP (Ping)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mac_address">MAC Address</Label>
                <Input
                  id="mac_address"
                  value={form.mac_address}
                  onChange={(e) => setForm({...form, mac_address: e.target.value})}
                  placeholder="00:1A:2B:3C:4D:5E"
                />
              </div>
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timeout_segundos">Timeout (segundos)</Label>
                  <Input
                    id="timeout_segundos"
                    type="number"
                    value={form.timeout_segundos}
                    onChange={(e) => setForm({...form, timeout_segundos: parseInt(e.target.value) || 30})}
                    min={5}
                    max={300}
                  />
                  <p className="text-xs text-slate-500">
                    Tempo máximo de espera por resposta
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intervalo_ping">Intervalo de Ping (segundos)</Label>
                  <Input
                    id="intervalo_ping"
                    type="number"
                    value={form.intervalo_ping}
                    onChange={(e) => setForm({...form, intervalo_ping: parseInt(e.target.value) || 60})}
                    min={10}
                    max={600}
                  />
                  <p className="text-xs text-slate-500">
                    Frequência de verificação do terminal
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="monitoramento_ativo">Monitoramento Ativo</Label>
                    <p className="text-xs text-slate-500">
                      Habilitar monitoramento em tempo real
                    </p>
                  </div>
                  <Switch
                    id="monitoramento_ativo"
                    checked={form.monitoramento_ativo}
                    onCheckedChange={(checked) => setForm({...form, monitoramento_ativo: checked})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notificar_offline">Notificar Offline</Label>
                    <p className="text-xs text-slate-500">
                      Enviar alerta quando terminal ficar offline
                    </p>
                  </div>
                  <Switch
                    id="notificar_offline"
                    checked={form.notificar_offline}
                    onCheckedChange={(checked) => setForm({...form, notificar_offline: checked})}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
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