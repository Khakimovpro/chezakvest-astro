// Counts may arrive formatted, e.g. '4 483'.
export function pluralRu(value, forms) {
  const n = Math.abs(Number(String(value).replace(/\s/gu, '')));
  const last = n % 10;
  const lastTwo = n % 100;
  return forms[lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
}
