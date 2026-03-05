const TELEGRAM_SAFE_CHUNK = 3800;

export function toPlainTelegramText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, ""),
    )
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[_`]/g, "")
    .trim();
}

export function splitTelegramText(text: string, maxLen = TELEGRAM_SAFE_CHUNK): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    parts.push(text.slice(i, i + maxLen));
  }
  return parts;
}
