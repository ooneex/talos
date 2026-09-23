const LATIN1_NAMES = [
  "nbsp",
  "iexcl",
  "cent",
  "pound",
  "curren",
  "yen",
  "brvbar",
  "sect",
  "uml",
  "copy",
  "ordf",
  "laquo",
  "not",
  "shy",
  "reg",
  "macr",
  "deg",
  "plusmn",
  "sup2",
  "sup3",
  "acute",
  "micro",
  "para",
  "middot",
  "cedil",
  "sup1",
  "ordm",
  "raquo",
  "frac14",
  "frac12",
  "frac34",
  "iquest",
  "Agrave",
  "Aacute",
  "Acirc",
  "Atilde",
  "Auml",
  "Aring",
  "AElig",
  "Ccedil",
  "Egrave",
  "Eacute",
  "Ecirc",
  "Euml",
  "Igrave",
  "Iacute",
  "Icirc",
  "Iuml",
  "ETH",
  "Ntilde",
  "Ograve",
  "Oacute",
  "Ocirc",
  "Otilde",
  "Ouml",
  "times",
  "Oslash",
  "Ugrave",
  "Uacute",
  "Ucirc",
  "Uuml",
  "Yacute",
  "THORN",
  "szlig",
  "agrave",
  "aacute",
  "acirc",
  "atilde",
  "auml",
  "aring",
  "aelig",
  "ccedil",
  "egrave",
  "eacute",
  "ecirc",
  "euml",
  "igrave",
  "iacute",
  "icirc",
  "iuml",
  "eth",
  "ntilde",
  "ograve",
  "oacute",
  "ocirc",
  "otilde",
  "ouml",
  "divide",
  "oslash",
  "ugrave",
  "uacute",
  "ucirc",
  "uuml",
  "yacute",
  "thorn",
  "yuml",
];

const LEGACY_ENTITIES: Record<string, string> = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  COPY: "©",
  REG: "®",
};

for (const [offset, name] of LATIN1_NAMES.entries()) {
  LEGACY_ENTITIES[name] = String.fromCharCode(160 + offset);
}

const NAMED_ENTITIES: Record<string, string> = {
  ...LEGACY_ENTITIES,
  apos: "'",
  OElig: "Œ",
  oelig: "œ",
  Scaron: "Š",
  scaron: "š",
  Yuml: "Ÿ",
  fnof: "ƒ",
  circ: "ˆ",
  tilde: "˜",
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Epsilon: "Ε",
  Zeta: "Ζ",
  Eta: "Η",
  Theta: "Θ",
  Iota: "Ι",
  Kappa: "Κ",
  Lambda: "Λ",
  Mu: "Μ",
  Nu: "Ν",
  Xi: "Ξ",
  Omicron: "Ο",
  Pi: "Π",
  Rho: "Ρ",
  Sigma: "Σ",
  Tau: "Τ",
  Upsilon: "Υ",
  Phi: "Φ",
  Chi: "Χ",
  Psi: "Ψ",
  Omega: "Ω",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigmaf: "ς",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  thetasym: "ϑ",
  upsih: "ϒ",
  piv: "ϖ",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200C",
  zwj: "\u200D",
  lrm: "\u200E",
  rlm: "\u200F",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  bull: "•",
  hellip: "…",
  permil: "‰",
  prime: "′",
  Prime: "″",
  lsaquo: "‹",
  rsaquo: "›",
  oline: "‾",
  frasl: "⁄",
  euro: "€",
  image: "ℑ",
  weierp: "℘",
  real: "ℜ",
  trade: "™",
  TRADE: "™",
  alefsym: "ℵ",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  crarr: "↵",
  lArr: "⇐",
  uArr: "⇑",
  rArr: "⇒",
  dArr: "⇓",
  hArr: "⇔",
  forall: "∀",
  part: "∂",
  exist: "∃",
  empty: "∅",
  nabla: "∇",
  isin: "∈",
  notin: "∉",
  ni: "∋",
  prod: "∏",
  sum: "∑",
  minus: "−",
  lowast: "∗",
  radic: "√",
  prop: "∝",
  infin: "∞",
  ang: "∠",
  and: "∧",
  or: "∨",
  cap: "∩",
  cup: "∪",
  int: "∫",
  there4: "∴",
  sim: "∼",
  cong: "≅",
  asymp: "≈",
  ne: "≠",
  equiv: "≡",
  le: "≤",
  ge: "≥",
  sub: "⊂",
  sup: "⊃",
  nsub: "⊄",
  sube: "⊆",
  supe: "⊇",
  oplus: "⊕",
  otimes: "⊗",
  perp: "⊥",
  sdot: "⋅",
  lceil: "⌈",
  rceil: "⌉",
  lfloor: "⌊",
  rfloor: "⌋",
  lang: "⟨",
  rang: "⟩",
  loz: "◊",
  spades: "♠",
  clubs: "♣",
  hearts: "♥",
  diams: "♦",
  check: "✓",
  cross: "✗",
  star: "☆",
  starf: "★",
  phone: "☎",
  female: "♀",
  male: "♂",
  sharp: "♯",
  flat: "♭",
  natural: "♮",
  NewLine: "\n",
  Tab: "\t",
  excl: "!",
  num: "#",
  dollar: "$",
  percnt: "%",
  lpar: "(",
  rpar: ")",
  ast: "*",
  plus: "+",
  comma: ",",
  period: ".",
  sol: "/",
  colon: ":",
  semi: ";",
  equals: "=",
  quest: "?",
  commat: "@",
  lsqb: "[",
  lbrack: "[",
  bsol: "\\",
  rsqb: "]",
  rbrack: "]",
  Hat: "^",
  lowbar: "_",
  grave: "`",
  lcub: "{",
  lbrace: "{",
  verbar: "|",
  vert: "|",
  rcub: "}",
  rbrace: "}",
  hyphen: "‐",
  dash: "‐",
  nbhy: "\u2011",
};

/**
 * Code points 0x80-0x9F are remapped to their Windows-1252 meaning, as required by the HTML spec
 */
const WINDOWS_1252: Record<number, number> = {
  128: 0x20ac,
  130: 0x201a,
  131: 0x0192,
  132: 0x201e,
  133: 0x2026,
  134: 0x2020,
  135: 0x2021,
  136: 0x02c6,
  137: 0x2030,
  138: 0x0160,
  139: 0x2039,
  140: 0x0152,
  142: 0x017d,
  145: 0x2018,
  146: 0x2019,
  147: 0x201c,
  148: 0x201d,
  149: 0x2022,
  150: 0x2013,
  151: 0x2014,
  152: 0x02dc,
  153: 0x2122,
  154: 0x0161,
  155: 0x203a,
  156: 0x0153,
  158: 0x017e,
  159: 0x0178,
};

const LONGEST_LEGACY_NAME = Math.max(...Object.keys(LEGACY_ENTITIES).map((name) => name.length));

const decodeCodePoint = (codePoint: number): string => {
  if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return "\uFFFD";
  }
  return String.fromCodePoint(WINDOWS_1252[codePoint] ?? codePoint);
};

const isAlphanumeric = (char: string | undefined): boolean => char !== undefined && /[a-zA-Z0-9]/.test(char);

const decodeNumeric = (input: string, start: number): [string, number] | null => {
  const isHex = input[start + 2] === "x" || input[start + 2] === "X";
  const digitsStart = start + (isHex ? 3 : 2);
  const pattern = isHex ? /[0-9a-fA-F]/ : /[0-9]/;
  let end = digitsStart;

  while (end < input.length && pattern.test(input[end] as string)) {
    end++;
  }

  if (end === digitsStart) {
    return null;
  }

  const codePoint = Number.parseInt(input.slice(digitsStart, end), isHex ? 16 : 10);
  if (input[end] === ";") {
    end++;
  }

  return [decodeCodePoint(codePoint), end];
};

const decodeNamed = (input: string, start: number, inAttribute: boolean): [string, number] | null => {
  let end = start + 1;
  while (isAlphanumeric(input[end])) {
    end++;
  }

  const name = input.slice(start + 1, end);
  if (input[end] === ";") {
    const decoded = NAMED_ENTITIES[name];
    if (decoded !== undefined) {
      return [decoded, end + 1];
    }
  }

  for (let length = Math.min(name.length, LONGEST_LEGACY_NAME); length > 0; length--) {
    const decoded = LEGACY_ENTITIES[name.slice(0, length)];
    if (decoded === undefined) {
      continue;
    }

    const next = input[start + 1 + length];
    if (inAttribute && (isAlphanumeric(next) || next === "=")) {
      return null;
    }

    return [decoded, start + 1 + length];
  }

  return null;
};

/**
 * Decode HTML character references (named and numeric) in a text or attribute value
 */
export const decodeEntities = (input: string, inAttribute = false): string => {
  let index = input.indexOf("&");
  if (index === -1) {
    return input;
  }

  let result = input.slice(0, index);

  while (index !== -1) {
    const decoded = input[index + 1] === "#" ? decodeNumeric(input, index) : decodeNamed(input, index, inAttribute);
    let next: number;

    if (decoded) {
      result += decoded[0];
      next = decoded[1];
    } else {
      result += "&";
      next = index + 1;
    }

    index = input.indexOf("&", next);
    result += input.slice(next, index === -1 ? undefined : index);
  }

  return result;
};

export const escapeText = (input: string): string =>
  input.replace(/[&<>\u00A0]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&nbsp;";
  });

export const escapeAttribute = (input: string): string =>
  input.replace(/[&"\u00A0]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === '"') return "&quot;";
    return "&nbsp;";
  });
