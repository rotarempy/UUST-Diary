// Native builds set the official endpoint before this script.
window.LECTURES_SCHEDULE_CONFIG = window.LECTURES_SCHEDULE_CONFIG || {
  staticOnly: true,
  endpoint: new URL('./data/schedule/', location.href).href,
  bootstrapWeek: 7
};
