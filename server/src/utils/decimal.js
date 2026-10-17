/**
 * Safe decimal arithmetic utilities to avoid JavaScript floating point errors.
 */

export function round(value, decimals = 4) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function toFixedStr(value, decimals = 4) {
  return round(value, decimals).toFixed(decimals);
}

export function add(a, b, decimals = 4) {
  return round(Number(a) + Number(b), decimals);
}

export function subtract(a, b, decimals = 4) {
  return round(Number(a) - Number(b), decimals);
}

export function multiply(a, b, decimals = 4) {
  return round(Number(a) * Number(b), decimals);
}

export function divide(a, b, decimals = 4) {
  if (Number(b) === 0) throw new Error('Division by zero');
  return round(Number(a) / Number(b), decimals);
}

export function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}
