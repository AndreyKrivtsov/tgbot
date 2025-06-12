# Frontend React Application

Эта папка предназначена для React приложения админ панели.

## Планируемая структура:

```
frontend/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── Dashboard/
│   │   ├── Settings/
│   │   └── Statistics/
│   ├── hooks/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── index.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Технологии:

- **React 18** с TypeScript
- **Vite** для сборки
- **TailwindCSS** для стилей
- **React Query** для API запросов
- **Zustand** для состояния
- **React Hook Form** для форм

## Интеграция с Telegram WebApp:

- Telegram WebApp SDK
- Адаптивный дизайн под мобильные устройства
- Темизация под Telegram
- Haptic Feedback
- Главная кнопка Telegram

## Билд:

После сборки файлы будут копироваться в `../static/` для раздачи через Fastify.

## Команды:

```bash
# Разработка
npm run dev

# Сборка в production
npm run build

# Копирование в static папку
npm run deploy
```
