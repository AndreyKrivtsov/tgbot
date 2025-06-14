# AntiSpam Service

Сервис определения спама для телеграм бота.

## Запуск

Сервис интегрирован в общую инфраструктуру проекта.

**Для запуска используйте:**
```bash
cd ../infrastructure
./start.sh
```

## API

После запуска API доступен по адресу: http://localhost:6323/docs

## Разработка

Для локальной разработки:
```bash
# Установить зависимости
pip install -r requirements.txt

# Запустить локально
uvicorn app:app --host 0.0.0.0 --port 6323 --reload
``` 