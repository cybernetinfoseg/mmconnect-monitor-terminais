import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = null; // Set this if you configure VAPID keys in secrets

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

export default function PushNotificationManager() {
  const [state, setState] = useState('idle'); // idle | requesting | subscribed | denied | unsupported
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'denied') { setState('denied'); return; }
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (reg) {
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        if (sub) { setState('subscribed'); return; }
      }
    }
    setState('idle');
  }

  async function subscribe() {
    if (!('serviceWorker' in navigator)) {
      toast.error('Notificações push não suportadas neste browser.');
      return;
    }
    setLoading(true);
    try {
      // Register SW if not already done
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
      }

      if (!reg) {
        // Fallback: use Notification API without push
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setState('subscribed');
          toast.success('Notificações do browser ativadas!');
        } else {
          setState('denied');
          toast.error('Permissão de notificações negada.');
        }
        setLoading(false);
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState('denied');
        toast.error('Permissão de notificações negada.');
        setLoading(false);
        return;
      }

      let subscription;
      if (VAPID_PUBLIC_KEY) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } else {
        // Without VAPID, use browser's default
        subscription = await reg.pushManager.subscribe({ userVisibleOnly: true }).catch(() => null);
      }

      if (subscription) {
        const json = subscription.toJSON();
        await base44.functions.invoke('pushNotify', {
          action: 'subscribe',
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh || '',
          auth: json.keys?.auth || '',
        });
      }

      setState('subscribed');
      toast.success('Notificações push ativadas!');
    } catch (err) {
      console.error(err);
      // Fallback to browser Notification API
      const perm = await Notification.requestPermission().catch(() => 'denied');
      if (perm === 'granted') {
        setState('subscribed');
        toast.success('Notificações do browser ativadas!');
      } else {
        toast.error('Não foi possível ativar notificações push.');
        setState('idle');
      }
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (reg) {
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        if (sub) {
          await base44.functions.invoke('pushNotify', {
            action: 'unsubscribe',
            endpoint: sub.endpoint,
          });
          await sub.unsubscribe();
        }
      }
      setState('idle');
      toast.success('Notificações desativadas.');
    } catch (err) {
      toast.error('Erro ao desativar notificações.');
    } finally {
      setLoading(false);
    }
  }

  if (state === 'unsupported') return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={state === 'subscribed' ? unsubscribe : subscribe}
      disabled={loading || state === 'denied'}
      title={
        state === 'subscribed' ? 'Desativar notificações push'
        : state === 'denied' ? 'Permissão negada pelo browser'
        : 'Ativar notificações push'
      }
      className={
        state === 'subscribed'
          ? 'border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
          : state === 'denied'
          ? 'border-red-300 text-red-500 cursor-not-allowed'
          : 'border-slate-300 text-slate-600'
      }
    >
      {state === 'subscribed'
        ? <><BellRing className="h-4 w-4 mr-1.5" /> Push Ativo</>
        : state === 'denied'
        ? <><BellOff className="h-4 w-4 mr-1.5" /> Push Bloqueado</>
        : <><Bell className="h-4 w-4 mr-1.5" /> Ativar Push</>
      }
    </Button>
  );
}