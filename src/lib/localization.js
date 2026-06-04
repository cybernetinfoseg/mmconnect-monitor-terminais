// Portugal localization configuration
import { formatDistanceToNow } from 'date-fns';
import pt from 'date-fns/locale/pt';

export const PT_LOCALE = 'pt-PT';

// Format date as DD/MM/YYYY — uses browser locale (respects user timezone via toLocaleDateString)
export function formatDatePT(date, timezone) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('pt-PT', timezone ? { timeZone: timezone } : undefined);
}

// Format date and time as DD/MM/YYYY HH:mm — timezone-aware
export function formatDateTimePT(date, timezone) {
  if (!date) return '';
  return new Date(date).toLocaleString('pt-PT', {
    ...(timezone ? { timeZone: timezone } : {}),
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Format time as HH:mm:ss — timezone-aware
export function formatTimePT(date, timezone) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('pt-PT', {
    ...(timezone ? { timeZone: timezone } : {}),
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Format relative time (e.g., "há 2 horas")
export function formatDistancePT(date) {
  if (!date) return '';
  return formatDistanceToNow(new Date(date), { locale: pt, addSuffix: true });
}

// Format number with comma as decimal separator
export function formatNumberPT(num, decimals = 0) {
  if (num === null || num === undefined) return '';
  return num.toFixed(decimals).replace('.', ',');
}

// Format currency in EUR with PT locale
export function formatCurrencyPT(amount) {
  return new Intl.NumberFormat(PT_LOCALE, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

// Get month name in Portuguese
export function getMonthNamePT(monthIndex) {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return months[monthIndex] || '';
}

// Get day name in Portuguese
export function getDayNamePT(dayIndex) {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return days[dayIndex] || '';
}

// Configure date-fns as default for Portugal
export const ptBRLocale = pt;