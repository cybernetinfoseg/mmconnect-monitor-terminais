import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, startOfWeek, format, addWeeks, subWeeks, getDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const DIAS_HEADER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_DOW   = [1, 2, 3, 4, 5, 6, 0]; // Segunda→Domingo

function parseDias(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// ── Linha de um colaborador numa semana ──────────────────────────────────────
function LinhaColaborador({ colab, horarioMap, escalaDiaMap, weekDays }) {
  const horarioAtual = colab.horario_id ? horarioMap[colab.horario_id] : null;
  const diasAtivos = horarioAtual ? parseDias(horarioAtual.dias_semana) : [];

  return (
    <tr className="border-b border-slate-200 last:border-0">
      <td className="py-1.5 pr-3 font-medium text-slate-800 whitespace-nowrap text-[11px]">
        {colab.nome}
      </td>
      <td className="py-1.5 pr-3 text-slate-400 text-[10px] whitespace-nowrap">
        {horarioAtual
          ? <span style={{ color: horarioAtual.cor || '#8b5cf6' }} className="font-semibold">{horarioAtual.nome}</span>
          : <span className="italic text-slate-300">Sem turno</span>}
      </td>
      {weekDays.map((day, i) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const escala = escalaDiaMap[colab.id]?.[dateStr];
        const dow = getDay(day);

        let cellColor = null;
        let cellLabel = '';
        let cellSub = '';

        if (escala) {
          const tipoColors = { folga: '#94a3b8', ferias: '#f59e0b', feriado: '#3b82f6', extra: '#10b981' };
          const tipoLabels = { folga: 'Folga', ferias: 'Férias', feriado: 'Feriado', extra: 'Extra', normal: '' };
          if (escala.tipo !== 'normal') {
            cellColor = tipoColors[escala.tipo] || '#8b5cf6';
            cellLabel = tipoLabels[escala.tipo] || escala.tipo;
          } else if (escala.horario_id && horarioMap[escala.horario_id]) {
            const h = horarioMap[escala.horario_id];
            const diasH = parseDias(h.dias_semana);
            if (diasH.length === 0 || diasH.includes(dow)) {
              cellColor = h.cor || '#8b5cf6';
              cellLabel = h.hora_entrada + '–' + h.hora_saida;
            }
          } else if (horarioAtual && diasAtivos.includes(dow)) {
            cellColor = horarioAtual.cor || '#8b5cf6';
            cellLabel = horarioAtual.hora_entrada + '–' + horarioAtual.hora_saida;
          }
        } else if (horarioAtual && diasAtivos.includes(dow)) {
          cellColor = horarioAtual.cor || '#8b5cf6';
          cellLabel = horarioAtual.hora_entrada + '–' + horarioAtual.hora_saida;
        }

        return (
          <td key={i} className="py-1.5 px-1 text-center">
            {cellColor ? (
              <span
                className="inline-block rounded px-1 py-0.5 text-white text-[8px] font-semibold leading-tight"
                style={{ backgroundColor: cellColor }}
              >
                {cellLabel}
              </span>
            ) : (
              <span className="text-slate-200 text-[10px]">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ── Bloco de escala individual (impresso para cada colaborador) ───────────────
function BlocoIndividual({ colab, horarioMap, escalaDiaMap, semanas }) {
  const horarioAtual = colab.horario_id ? horarioMap[colab.horario_id] : null;
  const diasAtivos = horarioAtual ? parseDias(horarioAtual.dias_semana) : [];

  return (
    <div className="mb-8 print-block border border-slate-300 rounded-lg overflow-hidden">
      {/* Cabeçalho do colaborador */}
      <div className="bg-slate-100 px-4 py-2 flex items-center gap-3 border-b border-slate-200">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: horarioAtual?.cor || '#8b5cf6' }}
        >
          {colab.nome.charAt(0)}
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm">{colab.nome}</p>
          <p className="text-[10px] text-slate-500">
            #{colab.enrollid}{colab.departamento ? ` · ${colab.departamento}` : ''}{colab.cargo ? ` · ${colab.cargo}` : ''}
          </p>
        </div>
        {horarioAtual && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: horarioAtual.cor || '#8b5cf6' }} />
            <span>Turno: <strong>{horarioAtual.nome}</strong></span>
            <span className="text-slate-400">{horarioAtual.hora_entrada}–{horarioAtual.hora_saida}</span>
          </div>
        )}
      </div>

      {/* Semanas */}
      <div className="p-3 space-y-3">
        {semanas.map(({ weekStart }, wi) => {
          const weekDays = getWeekDays(weekStart);
          return (
            <div key={wi}>
              <p className="text-[10px] font-semibold text-slate-500 mb-1">
                {format(weekDays[0], "d 'de' MMM", { locale: ptBR })} – {format(weekDays[6], "d 'de' MMM yyyy", { locale: ptBR })}
              </p>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr>
                    {DIAS_HEADER.map(d => (
                      <th key={d} className="text-center text-slate-400 font-medium pb-0.5 w-[14.28%]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {weekDays.map((day, i) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const escala = escalaDiaMap[colab.id]?.[dateStr];
                      const dow = getDay(day);

                      let cellColor = null;
                      let cellLabel = '';

                      if (escala) {
                        const tipoColors = { folga: '#94a3b8', ferias: '#f59e0b', feriado: '#3b82f6', extra: '#10b981' };
                        const tipoLabels = { folga: 'Folga', ferias: 'Férias', feriado: 'Feriado', extra: 'Extra' };
                        if (escala.tipo !== 'normal') {
                          cellColor = tipoColors[escala.tipo];
                          cellLabel = tipoLabels[escala.tipo] || escala.tipo;
                        } else if (escala.horario_id && horarioMap[escala.horario_id]) {
                          const h = horarioMap[escala.horario_id];
                          const diasH = parseDias(h.dias_semana);
                          if (diasH.length === 0 || diasH.includes(dow)) {
                            cellColor = h.cor || '#8b5cf6';
                            cellLabel = h.hora_entrada + '–' + h.hora_saida;
                          }
                        } else if (horarioAtual && diasAtivos.includes(dow)) {
                          cellColor = horarioAtual.cor || '#8b5cf6';
                          cellLabel = horarioAtual.hora_entrada + '–' + horarioAtual.hora_saida;
                        }
                      } else if (horarioAtual && diasAtivos.includes(dow)) {
                        cellColor = horarioAtual.cor || '#8b5cf6';
                        cellLabel = horarioAtual.hora_entrada + '–' + horarioAtual.hora_saida;
                      }

                      return (
                        <td key={i} className="text-center px-0.5 py-1">
                          <div className="text-[8px] text-slate-400 mb-0.5">{format(day, 'd/M')}</div>
                          {cellColor ? (
                            <span
                              className="inline-block rounded px-1 py-0.5 text-white text-[8px] font-bold leading-tight"
                              style={{ backgroundColor: cellColor }}
                            >
                              {cellLabel}
                            </span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div className="border-t border-slate-200 px-4 py-1.5 flex justify-between text-[9px] text-slate-400">
        <span>Escala gerada em {format(new Date(), "d 'de' MMMM yyyy", { locale: ptBR })}</span>
        <span>NOC Monitor</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
export default function EscalaImpressao({ colaboradores, horarios, escalaDiaMap, open, onClose, titulo = 'Escala de Trabalho' }) {
  const [numSemanas, setNumSemanas] = useState(2);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [modo, setModo] = useState('massa'); // 'massa' | 'individual'

  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  const semanas = useMemo(() => {
    return Array.from({ length: numSemanas }, (_, i) => ({
      weekStart: addWeeks(weekStart, i),
    }));
  }, [weekStart, numSemanas]);

  const handlePrint = () => {
    const tipoColors = { folga: '#94a3b8', ferias: '#f59e0b', feriado: '#3b82f6', extra: '#10b981' };
    const tipoLabels = { folga: 'Folga', ferias: 'Férias', feriado: 'Feriado', extra: 'Extra' };

    const cellHtml = (colab, day) => {
      const horarioAtual = colab.horario_id ? horarioMap[colab.horario_id] : null;
      const diasAtivos = horarioAtual ? parseDias(horarioAtual.dias_semana) : [];
      const dateStr = format(day, 'yyyy-MM-dd');
      const escala = escalaDiaMap[colab.id]?.[dateStr];
      const dow = getDay(day);
      let color = null, label = '';
      if (escala) {
        if (escala.tipo !== 'normal') {
          color = tipoColors[escala.tipo] || '#8b5cf6';
          label = tipoLabels[escala.tipo] || escala.tipo;
        } else if (escala.horario_id && horarioMap[escala.horario_id]) {
          // Override manual de horário — respeitar os dias_semana do horário override
          const h = horarioMap[escala.horario_id];
          const diasH = parseDias(h.dias_semana);
          if (diasH.length === 0 || diasH.includes(dow)) {
            color = h.cor || '#8b5cf6'; label = h.hora_entrada + '–' + h.hora_saida;
          }
        } else {
          // EscalaDia tipo normal sem horario_id: usar horário base respeitando dias_semana
          if (horarioAtual && diasAtivos.includes(dow)) {
            color = horarioAtual.cor || '#8b5cf6'; label = horarioAtual.hora_entrada + '–' + horarioAtual.hora_saida;
          }
        }
      } else if (horarioAtual && diasAtivos.includes(dow)) {
        color = horarioAtual.cor || '#8b5cf6'; label = horarioAtual.hora_entrada + '–' + horarioAtual.hora_saida;
      }
      return color
        ? `<span style="background:${color};color:#fff;border-radius:3px;padding:1px 4px;font-size:9px;font-weight:600;white-space:nowrap">${label}</span>`
        : `<span style="color:#e2e8f0">—</span>`;
    };

    let body = '';

    if (modo === 'massa') {
      semanas.forEach(({ weekStart: ws }) => {
        const wdays = getWeekDays(ws);
        const label = `${format(wdays[0], "d 'de' MMM", { locale: ptBR })} – ${format(wdays[6], "d 'de' MMM yyyy", { locale: ptBR })}`;
        body += `<div style="margin-bottom:20px;page-break-inside:avoid">
          <h2 style="font-size:11px;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-bottom:8px">Semana: ${label}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:10px">
            <thead><tr style="background:#f1f5f9;border-bottom:1px solid #cbd5e1">
              <th style="text-align:left;padding:4px 6px;min-width:140px">Colaborador</th>
              <th style="text-align:left;padding:4px 6px;min-width:100px">Turno</th>
              ${DIAS_HEADER.map(d => `<th style="text-align:center;padding:4px 4px">${d}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${colaboradores.map(c => {
                const h = c.horario_id ? horarioMap[c.horario_id] : null;
                return `<tr style="border-bottom:1px solid #f1f5f9">
                  <td style="padding:4px 6px;font-weight:600;color:#1e293b">${c.nome}</td>
                  <td style="padding:4px 6px;color:${h?.cor || '#94a3b8'};font-weight:600">${h ? h.nome : '<i style="color:#cbd5e1">Sem turno</i>'}</td>
                  ${wdays.map(day => `<td style="text-align:center;padding:3px 2px">${cellHtml(c, day)}</td>`).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      });
    } else {
      colaboradores.forEach(c => {
        const h = c.horario_id ? horarioMap[c.horario_id] : null;
        body += `<div style="margin-bottom:24px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;page-break-inside:avoid">
          <div style="background:#f8fafc;padding:8px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0">
            <div style="width:28px;height:28px;border-radius:50%;background:${h?.cor || '#8b5cf6'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${c.nome.charAt(0)}</div>
            <div>
              <div style="font-weight:700;color:#1e293b;font-size:12px">${c.nome}</div>
              <div style="font-size:9px;color:#64748b">#${c.enrollid}${c.departamento ? ' · ' + c.departamento : ''}${h ? ' · Turno: ' + h.nome + ' ' + h.hora_entrada + '–' + h.hora_saida : ''}</div>
            </div>
          </div>
          <div style="padding:10px 12px">
            ${semanas.map(({ weekStart: ws }) => {
              const wdays = getWeekDays(ws);
              const rangeLabel = `${format(wdays[0], "d 'de' MMM", { locale: ptBR })} – ${format(wdays[6], "d 'de' MMM yyyy", { locale: ptBR })}`;
              return `<div style="margin-bottom:8px">
                <div style="font-size:9px;font-weight:600;color:#64748b;margin-bottom:4px">${rangeLabel}</div>
                <table style="width:100%;border-collapse:collapse;font-size:9px">
                  <thead><tr>${DIAS_HEADER.map(d => `<th style="text-align:center;color:#94a3b8;font-weight:600;padding-bottom:2px;width:14.28%">${d}</th>`).join('')}</tr></thead>
                  <tbody><tr>${wdays.map(day => `<td style="text-align:center;padding:3px 1px">
                    <div style="font-size:8px;color:#94a3b8">${format(day, 'd/M')}</div>
                    ${cellHtml(c, day)}
                  </td>`).join('')}</tr></tbody>
                </table>
              </div>`;
            }).join('')}
          </div>
          <div style="border-top:1px solid #e2e8f0;padding:4px 12px;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8">
            <span>Gerado em ${format(new Date(), "d/MM/yyyy", { locale: ptBR })}</span><span>NOC Monitor</span>
          </div>
        </div>`;
      });
    }

    const rangeLabel = `${format(semanas[0].weekStart, "d 'de' MMM", { locale: ptBR })}${semanas.length > 1 ? ' – ' + format(addDays(semanas[semanas.length - 1].weekStart, 6), "d 'de' MMM yyyy", { locale: ptBR }) : ''}`;

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${titulo}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; color: #1e293b; padding: 12mm; font-size: 10px; }
        @page { size: A4 portrait; margin: 10mm; }
      </style>
    </head><body>
      <div style="margin-bottom:16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">
        <h1 style="font-size:16px;font-weight:700;color:#0f172a">${titulo}</h1>
        <p style="font-size:10px;color:#64748b;margin-top:2px">${rangeLabel} · ${colaboradores.length} colaborador(es)</p>
      </div>
      ${body}
      <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:6px;text-align:center;font-size:8px;color:#94a3b8">
        NOC Monitor · Gerado em ${format(new Date(), "d/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4 text-violet-500" />
              Imprimir Escala
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Modo */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Formato</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setModo('massa')}
                  className={cn('border rounded-xl p-3 text-left transition-all', modo === 'massa' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <p className="text-xs font-semibold text-slate-800">Tabela geral</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Todos os colaboradores numa tabela por semana</p>
                </button>
                <button

                  onClick={() => setModo('individual')}
                  className={cn('border rounded-xl p-3 text-left transition-all', modo === 'individual' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <p className="text-xs font-semibold text-slate-800">Individual</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Um bloco por colaborador para distribuir</p>
                </button>
              </div>
            </div>

            {/* Período */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Semana de início</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWeekStart(w => subWeeks(w, 1))}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="flex-1 text-center text-sm font-semibold text-slate-700">
                  {format(weekStart, "d MMM yyyy", { locale: ptBR })}
                </span>
                <button
                  onClick={() => setWeekStart(w => addWeeks(w, 1))}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Nº de semanas */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Nº de semanas</label>
              <div className="flex gap-2">
                {[1, 2, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumSemanas(n)}
                    className={cn('flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      numSemanas === n ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                  >
                    {n} sem{n > 1 ? 'anas' : 'ana'}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo */}
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-0.5">
              <p><strong>{colaboradores.length}</strong> colaborador(es) selecionado(s)</p>
              <p>
                {format(weekStart, "d 'de' MMM", { locale: ptBR })} →{' '}
                {format(addDays(addWeeks(weekStart, numSemanas), -1), "d 'de' MMM yyyy", { locale: ptBR })}
              </p>
              <p className="text-slate-400">Formato: {modo === 'massa' ? 'tabela geral' : 'individual (folha por colaborador)'}</p>
            </div>

            <Button className="w-full bg-violet-600 hover:bg-violet-700 gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Imprimir / Guardar PDF
            </Button>
          </div>
        </DialogContent>
    </Dialog>
  );
}