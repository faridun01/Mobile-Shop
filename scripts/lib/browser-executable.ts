import { existsSync } from 'node:fs';

export function browserExecutable(): string {
  const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find((value): value is string => Boolean(value && existsSync(value)));
  if (!found) throw new Error('Chrome/Chromium не найден. Укажите путь в CHROME_PATH.');
  return found;
}
