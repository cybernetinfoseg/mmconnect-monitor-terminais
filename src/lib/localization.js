// Portugal localization configuration
export const PT_LOCALE = 'pt-PT';

// Format date as DD/MM/YYYY
export function formatDatePT(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Format date and time as DD/MM/YYYY HH:MM
export function formatDateTimePT(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
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