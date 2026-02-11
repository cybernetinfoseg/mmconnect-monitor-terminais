import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_BASE = 'https://api.timeaccess.pt:7260/api/User';
const CLIENTE_CLOUD = 'TimeCloud';
const NOME_USUARIO = 'Administrador';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Buscar terminais da API TimeAccess
        const response = await fetch(
            `${API_BASE}/getterminais?clienteCloud=${CLIENTE_CLOUD}&nome=${NOME_USUARIO}`
        );

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const terminaisAPI = await response.json();

        // Buscar clientes existentes
        const clientes = await base44.asServiceRole.entities.Cliente.list();
        
        // Mapear terminais da API para o modelo do sistema
        const terminaisAtualizados = [];
        
        for (const terminalAPI of terminaisAPI) {
            // Encontrar ou criar cliente
            let cliente = clientes.find(c => c.nome === terminalAPI.cliente);
            if (!cliente && terminalAPI.cliente) {
                cliente = await base44.asServiceRole.entities.Cliente.create({
                    nome: terminalAPI.cliente,
                    ativo: true
                });
            }

            // Verificar se terminal já existe
            const terminaisExistentes = await base44.asServiceRole.entities.Terminal.filter({
                nome: terminalAPI.nome
            });

            const terminalData = {
                nome: terminalAPI.nome || 'Sem nome',
                descricao: terminalAPI.descricao || '',
                cliente_id: cliente?.id || null,
                cliente_nome: cliente?.nome || terminalAPI.cliente || '',
                local: terminalAPI.local || '',
                ip_local: terminalAPI.ip || '',
                ip_publico: terminalAPI.ipPublico || '',
                dns: terminalAPI.dns || '',
                porta: terminalAPI.porta || 80,
                metodo_conexao: terminalAPI.dns ? 'dns' : (terminalAPI.ipPublico ? 'ip_publico' : 'ip_local'),
                protocolo: 'http',
                status: terminalAPI.online ? 'online' : 'offline',
                ultimo_ping: terminalAPI.ultimoPing || new Date().toISOString(),
                segundos_sem_ping: terminalAPI.segundosSemPing || 0,
                latencia_ms: terminalAPI.latencia || 0,
                fabricante: terminalAPI.fabricante || '',
                modelo: terminalAPI.modelo || '',
                numero_serie: terminalAPI.numeroSerie || '',
                monitoramento_ativo: true,
                notificar_offline: true
            };

            if (terminaisExistentes.length > 0) {
                // Atualizar existente
                await base44.asServiceRole.entities.Terminal.update(
                    terminaisExistentes[0].id,
                    terminalData
                );
                terminaisAtualizados.push({ ...terminalData, id: terminaisExistentes[0].id, action: 'updated' });
            } else {
                // Criar novo
                const novoTerminal = await base44.asServiceRole.entities.Terminal.create(terminalData);
                terminaisAtualizados.push({ ...terminalData, id: novoTerminal.id, action: 'created' });
            }
        }

        return Response.json({
            success: true,
            total: terminaisAPI.length,
            terminais: terminaisAtualizados,
            created: terminaisAtualizados.filter(t => t.action === 'created').length,
            updated: terminaisAtualizados.filter(t => t.action === 'updated').length
        });

    } catch (error) {
        return Response.json({ 
            error: error.message,
            details: error.stack 
        }, { status: 500 });
    }
});