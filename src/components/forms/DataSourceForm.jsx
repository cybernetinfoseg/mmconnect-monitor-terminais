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
import { Database, Save, X, Server, Code, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DataSourceForm({ open, onClose, dataSource, onSave, isLoading }) {
  const [form, setForm] = useState({
    nome: '',
    tipo: 'sqlserver',
    ativo: true,
    host: '',
    porta: 1433,
    database: '',
    username: '',
    api_url: '',
    api_method: 'GET',
    api_headers: '',
    query_terminais: '',
    query_status: '',
    intervalo_sync_segundos: 300,
    mapeamento_campos: ''
  });

  useEffect(() => {
    if (dataSource) {
      setForm({...form, ...dataSource});
    } else {
      setForm({
        nome: '',
        tipo: 'sqlserver',
        ativo: true,
        host: '',
        porta: 1433,
        database: '',
        username: '',
        api_url: '',
        api_method: 'GET',
        api_headers: '',
        query_terminais: '',
        query_status: '',
        intervalo_sync_segundos: 300,
        mapeamento_campos: ''
      });
    }
  }, [dataSource, open]);

  const handleTipoChange = (tipo) => {
    let porta = 1433;
    if (tipo === 'mysql') porta = 3306;
    if (tipo === 'postgresql') porta = 5432;
    if (tipo === 'api_rest' || tipo === 'api_graphql') porta = 443;
    setForm({...form, tipo, porta});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const isDatabase = ['sqlserver', 'mysql', 'postgresql'].includes(form.tipo);
  const isAPI = ['api_rest', 'api_graphql'].includes(form.tipo);

  const defaultQueryExample = `-- Exemplo de query para SQL Server:
SELECT 
  id,
  nome,
  ip_local as ip,
  porta,
  CASE WHEN DATEDIFF(SECOND, ultimo_ping, GETDATE()) > 60 THEN 'offline' ELSE 'online' END as status,
  DATEDIFF(SECOND, ultimo_ping, GETDATE()) as segundos_sem_ping,
  ultimo_ping
FROM terminais
WHERE ativo = 1`;

  const defaultMappingExample = `{
  "id": "id",
  "nome": "nome",
  "ip_local": "ip",
  "porta": "porta",
  "status": "status",
  "segundos_sem_ping": "segundos_sem_ping",
  "ultimo_ping": "ultimo_ping"
}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-purple-500" />
            {dataSource ? 'Editar Fonte de Dados' : 'Nova Fonte de Dados'}
          </DialogTitle>
        </DialogHeader>

        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Importante:</strong> Para conectar a bancos SQL Server externos ou APIs, é necessário 
            habilitar <strong>Backend Functions</strong> nas configurações do app. A senha do banco deve 
            ser configurada como um Secret no dashboard.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="connection" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="connection" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Conexão
              </TabsTrigger>
              <TabsTrigger value="queries" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Queries/Endpoints
              </TabsTrigger>
              <TabsTrigger value="mapping" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Mapeamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connection" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Configuração *</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm({...form, nome: e.target.value})}
                    placeholder="Ex: SQL Server Produção"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Fonte *</Label>
                  <Select value={form.tipo} onValueChange={handleTipoChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sqlserver">SQL Server</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="api_rest">API REST</SelectItem>
                      <SelectItem value="api_graphql">API GraphQL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isDatabase && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="host">Host/Servidor *</Label>
                      <Input
                        id="host"
                        value={form.host}
                        onChange={(e) => setForm({...form, host: e.target.value})}
                        placeholder="servidor.database.windows.net"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="porta">Porta</Label>
                      <Input
                        id="porta"
                        type="number"
                        value={form.porta}
                        onChange={(e) => setForm({...form, porta: parseInt(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="database">Nome do Banco *</Label>
                      <Input
                        id="database"
                        value={form.database}
                        onChange={(e) => setForm({...form, database: e.target.value})}
                        placeholder="nome_do_banco"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">Usuário</Label>
                      <Input
                        id="username"
                        value={form.username}
                        onChange={(e) => setForm({...form, username: e.target.value})}
                        placeholder="usuario_db"
                      />
                      <p className="text-xs text-slate-500">
                        A senha deve ser configurada como Secret
                      </p>
                    </div>
                  </div>
                </>
              )}

              {isAPI && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="api_url">URL da API *</Label>
                    <Input
                      id="api_url"
                      value={form.api_url}
                      onChange={(e) => setForm({...form, api_url: e.target.value})}
                      placeholder="https://api.exemplo.com/v1"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="api_method">Método HTTP</Label>
                      <Select 
                        value={form.api_method} 
                        onValueChange={(v) => setForm({...form, api_method: v})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api_headers">Headers (JSON)</Label>
                      <Input
                        id="api_headers"
                        value={form.api_headers}
                        onChange={(e) => setForm({...form, api_headers: e.target.value})}
                        placeholder='{"Authorization": "Bearer TOKEN"}'
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="intervalo_sync_segundos">Intervalo de Sincronização (segundos)</Label>
                  <Input
                    id="intervalo_sync_segundos"
                    type="number"
                    value={form.intervalo_sync_segundos}
                    onChange={(e) => setForm({...form, intervalo_sync_segundos: parseInt(e.target.value) || 300})}
                    min={60}
                    max={3600}
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <div>
                    <Label htmlFor="ativo">Fonte Ativa</Label>
                    <p className="text-xs text-slate-500">
                      Habilitar sincronização automática
                    </p>
                  </div>
                  <Switch
                    id="ativo"
                    checked={form.ativo}
                    onCheckedChange={(checked) => setForm({...form, ativo: checked})}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="queries" className="space-y-4">
              {isDatabase ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="query_status">Query de Status dos Terminais</Label>
                    <Textarea
                      id="query_status"
                      value={form.query_status}
                      onChange={(e) => setForm({...form, query_status: e.target.value})}
                      placeholder={defaultQueryExample}
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500">
                      Query SQL que retorna o status atual de todos os terminais
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="query_status">Endpoint de Status</Label>
                    <Input
                      id="query_status"
                      value={form.query_status}
                      onChange={(e) => setForm({...form, query_status: e.target.value})}
                      placeholder="/terminais/status"
                    />
                    <p className="text-xs text-slate-500">
                      Endpoint que retorna o status dos terminais (será concatenado com a URL base)
                    </p>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="mapping" className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-700 mb-2">Mapeamento de Campos</h4>
                <p className="text-sm text-slate-500">
                  Configure como os campos do seu banco/API correspondem aos campos do sistema.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mapeamento_campos">Mapeamento JSON</Label>
                <Textarea
                  id="mapeamento_campos"
                  value={form.mapeamento_campos}
                  onChange={(e) => setForm({...form, mapeamento_campos: e.target.value})}
                  placeholder={defaultMappingExample}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500">
                  Formato: {"{"}"campo_sistema": "campo_fonte"{"}"}
                </p>
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