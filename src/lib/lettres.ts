// Montant en toutes lettres (français), pour contrats et reçus.
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function below100(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const t = Math.floor(n / 10);
  let u = n % 10;
  if (t === 7 || t === 9) u += 10;
  let word = TENS[t];
  if (u === 0) return t === 8 ? 'quatre-vingts' : word;
  if ((u === 1 || u === 11) && t < 8) word += ' et';
  return `${word}-${below100(u)}`.replace(' et-', ' et ');
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(h === 1 ? 'cent' : `${UNITS[h]} cent${r === 0 ? 's' : ''}`);
  if (r > 0) parts.push(below100(r));
  return parts.join(' ');
}

export function enLettres(amount: number): string {
  let n = Math.floor(Math.abs(amount));
  if (n === 0) return 'zéro dinar';
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9); n %= 1e9;
  const millions = Math.floor(n / 1e6); n %= 1e6;
  const thousands = Math.floor(n / 1000); n %= 1000;
  if (billions) parts.push(`${below1000(billions)} milliard${billions > 1 ? 's' : ''}`);
  if (millions) parts.push(`${below1000(millions)} million${millions > 1 ? 's' : ''}`);
  if (thousands) parts.push(thousands === 1 ? 'mille' : `${below1000(thousands).replace(/(cent|vingt)s$/, '$1')} mille`);
  if (n) parts.push(below1000(n));
  const txt = parts.join(' ');
  const de = n === 0 && thousands === 0 && (millions || billions) ? 'de ' : '';
  return `${txt} ${de}dinar${Math.floor(Math.abs(amount)) > 1 ? 's' : ''} algérien${Math.floor(Math.abs(amount)) > 1 ? 's' : ''}`;
}
