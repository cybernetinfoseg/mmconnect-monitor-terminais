/**
 * Biblioteca de cálculo de horas — Código do Trabalho PT
 *
 * Trabalho noturno (art. 223º e 266º CT): período 22h–07h → +25% sobre hora normal
 * Horas suplementares (art. 268º CT):
 *   ≤ 100h/ano: dia útil 1ª h +25%, seguintes +37.5%; descanso/feriado +50%
 *   > 100h/ano: dia útil 1ª h +50%, seguintes +75%; descanso/feriado +100%
 */

/**
 * Converte "HH:MM" numa data Date no dia especificado
 */
export function horaParaDate(hhmm, diaBase) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(diaBase);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Minutos de sobreposição entre [a1,a2] e [b1,b2]
 */
function overlapMin(a1, a2, b1, b2) {
  const start = Math.max(a1, b1);
  const end = Math.min(a2, b2);
  return Math.max(0, end - start);
}

/**
 * Calcula minutos noturnos (22h–07h) num intervalo [inicio, fim] (Date)
 */
export function calcularMinutosNoturnos(inicio, fim) {
  if (!inicio || !fim || fim <= inicio) return 0;
  const startMs = inicio.getTime();
  const endMs = fim.getTime();

  // Período noturno: 22h do mesmo dia → 07h do dia seguinte
  // Pode cruzar meia-noite, então verificamos dois blocos:
  // Bloco 1: 22h do dia de início até 07h do dia seguinte
  // Bloco 2: 22h do dia anterior ao fim até 07h do dia do fim

  let totalMs = 0;
  // Itera dia a dia (máx. 48h de segurança)
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  let cursor = new Date(inicio);
  cursor.setHours(0, 0, 0, 0);

  for (let iter = 0; iter < 3; iter++) {
    // Noturno deste dia: 22h → 07h do dia seguinte
    const notStart = new Date(cursor.getTime() + 22 * ONE_HOUR);
    const notEnd = new Date(cursor.getTime() + ONE_DAY + 7 * ONE_HOUR);
    totalMs += overlapMin(startMs, endMs, notStart.getTime(), notEnd.getTime());
    cursor = new Date(cursor.getTime() + ONE_DAY);
    if (cursor.getTime() > endMs) break;
  }

  return Math.round(totalMs / 60000);
}

/**
 * Dado um array de marcações de um colaborador num dia,
 * calcula horas trabalhadas, horas extra e horas noturnas.
 *
 * @param {Array} marcacoes - marcações ordenadas por timestamp
 * @param {Object} horario - entidade Horario com hora_entrada, hora_saida, hora_saida_almoco, hora_entrada_almoco, horas_diarias, tolerancia_minutos
 * @param {number} horasExtraAcumuladasAno - total de horas extra já acumuladas no ano (para aplicar tabela correta)
 * @returns {Object} resumo
 */
export function calcularDia(marcacoes, horario, horasExtraAcumuladasAno = 0) {
  if (!marcacoes || marcacoes.length === 0) {
    return {
      minutosPresenca: 0,
      minutosEfetivos: 0,
      minutosExtra: 0,
      minutosNoturnos: 0,
      minutosAtraso: 0,
      minutosAlmoco: 0,
      pares: [],
      status: 'sem_marcacao',
    };
  }

  // Ordenar por timestamp
  const sorted = [...marcacoes].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Construir pares entrada/saída
  // Estratégia: alternar entrada-saída
  const pares = [];
  let i = 0;
  while (i < sorted.length) {
    const m = sorted[i];
    // entrada explícita ou primeiro registo
    if (m.tipo === 'entrada' || pares.length === 0) {
      const entrada = new Date(m.timestamp);
      // Procurar saída correspondente
      let saida = null;
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].tipo === 'saida') {
          saida = new Date(sorted[j].timestamp);
          i = j;
          break;
        }
      }
      pares.push({ entrada, saida });
    }
    i++;
  }

  // Se o último par não tem saída, o colaborador ainda está dentro
  const aindaDentro = pares.length > 0 && pares[pares.length - 1].saida === null;
  if (aindaDentro) {
    // Usar hora atual como saída estimada para o cálculo em tempo real
    pares[pares.length - 1].saida = new Date();
    pares[pares.length - 1].estimado = true;
  }

  // Calcular minutos de presença total (soma dos pares)
  let minutosPresenca = 0;
  let minutosNoturnos = 0;
  pares.forEach(par => {
    if (par.entrada && par.saida) {
      const diff = (par.saida - par.entrada) / 60000;
      minutosPresenca += diff;
      minutosNoturnos += calcularMinutosNoturnos(par.entrada, par.saida);
    }
  });

  // Calcular pausa almoço (se horário define)
  let minutosAlmoco = 0;
  if (horario?.hora_saida_almoco && horario?.hora_entrada_almoco && pares.length > 0) {
    const diaBase = pares[0].entrada;
    const saidaAlm = horaParaDate(horario.hora_saida_almoco, diaBase);
    const entradaAlm = horaParaDate(horario.hora_entrada_almoco, diaBase);
    if (saidaAlm && entradaAlm && entradaAlm > saidaAlm) {
      minutosAlmoco = (entradaAlm - saidaAlm) / 60000;
    }
  }

  // Minutos efetivos = presença - pausa (mínimo 0)
  const minutosEfetivos = Math.max(0, minutosPresenca - minutosAlmoco);

  // Horas diárias esperadas
  const horasDiarias = horario?.horas_diarias || 8;
  const minutosEsperados = horasDiarias * 60;

  // Minutos extra
  const minutosExtra = Math.max(0, minutosEfetivos - minutosEsperados);

  // Cálculo de atraso (diferença entre hora de entrada real e prevista)
  let minutosAtraso = 0;
  if (horario?.hora_entrada && pares.length > 0) {
    const entradaPrevista = horaParaDate(horario.hora_entrada, pares[0].entrada);
    const tolerancia = (horario?.tolerancia_minutos || 10);
    const diff = (pares[0].entrada - entradaPrevista) / 60000;
    if (diff > tolerancia) minutosAtraso = Math.round(diff - tolerancia);
  }

  // Multiplicadores horas extra (art. 268º CT)
  // Acima de 100h/ano acumuladas
  const limiteTabela1 = 100 * 60; // em minutos
  const tabela2 = horasExtraAcumuladasAno * 60 >= limiteTabela1;

  let fatorPrimeiraHora, fatorHorasSeguintes;
  if (tabela2) {
    fatorPrimeiraHora = 1.50;
    fatorHorasSeguintes = 1.75;
  } else {
    fatorPrimeiraHora = 1.25;
    fatorHorasSeguintes = 1.375;
  }

  // Horas noturnas: +25% (art. 266º CT)
  const fatorNoturno = 1.25;

  return {
    minutosPresenca: Math.round(minutosPresenca),
    minutosEfetivos: Math.round(minutosEfetivos),
    minutosExtra: Math.round(minutosExtra),
    minutosNoturnos: Math.round(minutosNoturnos),
    minutosAtraso,
    minutosAlmoco: Math.round(minutosAlmoco),
    pares,
    aindaDentro,
    fatorPrimeiraHora,
    fatorHorasSeguintes,
    fatorNoturno,
    status: minutosPresenca === 0 ? 'sem_marcacao' : aindaDentro ? 'dentro' : 'saiu',
  };
}

/**
 * Formata minutos como "Xh Ym"
 */
export function fmtMin(min) {
  if (min == null || isNaN(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}