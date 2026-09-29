/** e.g. "10月10日(土) 14:00" */
export function formatJaDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('month')}月${get('day')}日(${get('weekday')}) ${get('hour')}:${get('minute')}`;
}
