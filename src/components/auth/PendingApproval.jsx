import React from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PendingApproval({ user }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-5 bg-amber-100 rounded-full">
            <Clock className="h-12 w-12 text-amber-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Aguardando Aprovação</h1>
          <p className="text-slate-500">
            A sua conta está registada, mas ainda não foi aprovada por um administrador.
          </p>
          {user?.email && (
            <p className="text-sm text-slate-400 font-mono bg-slate-100 px-3 py-1 rounded-full inline-block">
              {user.email}
            </p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-left space-y-1">
          <p className="font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" /> O que acontece agora?
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700">
            <li>Um administrador será notificado do seu registo</li>
            <li>Após a aprovação, terá acesso ao sistema</li>
            <li>Recarregue a página depois de aprovado</li>
          </ul>
        </div>

        <Button
          variant="outline"
          onClick={() => base44.auth.logout()}
          className="gap-2 text-slate-500"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}