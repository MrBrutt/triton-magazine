// Заглушка firebase-app.js для тестов: настоящий SDK не грузится, в боевой проект запросов нет.
export const SDK_VERSION = 'test';
export function initializeApp(options) { return { name: '[DEFAULT]', options }; }
