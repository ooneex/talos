export const hexToRgba = (hex: string, alpha?: number): string | null => {
  const match = hex.trim().replace(/^#/, "");

  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(match)) {
    return null;
  }

  const expand = (value: string): string =>
    value.length <= 4
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  const full = expand(match);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  let a = 1;
  if (alpha !== undefined) {
    if (alpha < 0 || alpha > 1 || Number.isNaN(alpha)) {
      return null;
    }
    a = alpha;
  } else if (full.length === 8) {
    a = Number.parseInt(full.slice(6, 8), 16) / 255;
  }

  const roundedAlpha = Math.round(a * 1000) / 1000;

  return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
};
