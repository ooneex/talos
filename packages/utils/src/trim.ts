export const trim = (text: string, char = " "): string => {
  if ([".", "[", "]", "(", ")", "+", "*", "^", "$", "?", "/", "\\"].includes(char)) {
    char = `\\${char}`;
  }

  const reg = new RegExp(`^${char}+|${char}+$`, "g");
  return text.replace(reg, "");
};
