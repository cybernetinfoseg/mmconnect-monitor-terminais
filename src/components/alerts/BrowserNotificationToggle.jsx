import React, { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function BrowserNotificationToggle() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  const handleRequest = async () => {
    if (!('Notification' in window)) {
      toast.error('Seu navegador não suporta notificações push');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      toast.success('Notificações push ativadas!');
      new Notification('NOC Monitor', {
        body: 'Notificações push ativadas com sucesso.',
        icon: '/favicon.ico',
      });
    } else {
      toast.error('Permissão negada para notificações push');
    }
  };

  if (permission === 'unsupported') return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRequest}
      className={permission === 'granted'
        ? 'border-emerald-300 text-emerald-700 bg-emerald-50 gap-2'
        : 'gap-2 text-slate-600'
      }
    >
      {permission === 'granted' ? (
        <><Bell className="h-4 w-4" /> Push ativo</>
      ) : (
        <><BellOff className="h-4 w-4" /> Ativar Push</>
      )}
    </Button>
  );
}