const TELEGRAM_MARKDOWN_SPECIALS = /([_*`\[])/g;

export function escapeTelegramMarkdown(text: string): string {
  return text.replace(TELEGRAM_MARKDOWN_SPECIALS, "\\$1");
}
