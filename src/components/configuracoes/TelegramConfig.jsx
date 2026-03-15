import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';

export default function TelegramConfig() {
    const [botToken, setBotToken] = useState('');
    const [chatId, setChatId] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null); // null | 'ok' | 'error'
    const [testMsg, setTestMsg] = useState('');

    useEffect(() => {
        base44.auth.me().then(user => {
            if (user?.telegram_bot_token) setBotToken(user.telegram_bot_token);
            if (user?.telegram_chat_id) setChatId(user.telegram_chat_id);
        }).catch(() => {});
    }, []);

    const handleSave = async () => {
        setSaving(true);
        await base44.auth.updateMe({ telegram_bot_token: botToken.trim(), telegram_chat_id: chatId.trim() });
        setSaving(false);
    };

    const handleTest = async () => {
        if (!botToken || !chatId) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await base44.functions.invoke('telegramNotify', {
                bot_token: botToken.trim(),
                chat_id: chatId.trim(),
                message: '🟢 <b>NOC Monitor</b> — Teste de notificação Telegram configurado com sucesso!',
            });
            if (res.data?.success) {
                setTestResult('ok');
                setTestMsg('Mensagem enviada com sucesso!');
            } else {
                setTestResult('error');
                setTestMsg(res.data?.error || 'Erro desconhecido');
            }
        } catch (e) {
            setTestResult('error');
            setTestMsg(e.message);
        }
        setTesting(false);
    };

    const handleClear = async () => {
        setBotToken('');
        setChatId('');
        setTestResult(null);
        await base44.auth.updateMe({ telegram_bot_token: '', telegram_chat_id: '' });
    };

    return (
        <Card className="border-slate-200">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#229ED9]" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.668l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.891z"/>
                    </svg>
                    Notificações Telegram
                </CardTitle>
                <p className="text-xs text-slate-500">Configure o seu bot para receber alertas de terminais offline no grupo/canal.</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                    <p className="font-semibold">Como configurar:</p>
                    <p>1. Crie um bot via <span className="font-mono">@BotFather</span> no Telegram e copie o token.</p>
                    <p>2. Adicione o bot ao seu grupo/canal como <b>administrador</b>.</p>
                    <p>3. Obtenha o Chat ID do grupo via <span className="font-mono">@userinfobot</span> ou envie uma mensagem e consulte <span className="font-mono">getUpdates</span>.</p>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Bot Token</Label>
                    <div className="relative">
                        <Input
                            type={showToken ? 'text' : 'password'}
                            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                            value={botToken}
                            onChange={e => setBotToken(e.target.value)}
                            className="pr-9 font-mono text-xs"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Chat ID do Grupo/Canal</Label>
                    <Input
                        placeholder="-1001234567890"
                        value={chatId}
                        onChange={e => setChatId(e.target.value)}
                        className="font-mono text-xs"
                    />
                </div>

                {testResult && (
                    <div className={`flex items-center gap-2 text-xs p-2 rounded-lg ${testResult === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {testResult === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                        {testMsg}
                    </div>
                )}

                <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
                        {saving ? 'A guardar...' : 'Guardar'}
                    </Button>
                    <Button onClick={handleTest} disabled={testing || !botToken || !chatId} variant="outline" size="sm" className="gap-1.5">
                        <Send className="h-3.5 w-3.5" />
                        {testing ? 'A testar...' : 'Testar'}
                    </Button>
                    {(botToken || chatId) && (
                        <Button onClick={handleClear} variant="ghost" size="sm" className="text-slate-400 hover:text-red-500">
                            Remover
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}