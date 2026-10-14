// Default: local serve.py forwards exactly the official POST requests, without an API key.
// For static hosting, configure your own proxy URL here. Direct requests need the source's CORS permission.
window.LECTURES_SCHEDULE_CONFIG = window.LECTURES_SCHEDULE_CONFIG || {
  endpoint: location.protocol === 'file:' ? 'https://isu.uust.ru/module/schedule/schedule_2024_script.php' : new URL('schedule-source', location.href).href,
  bootstrapWeek: 7,
  sourcePage: 'https://uust.ru/schedule/'
};
