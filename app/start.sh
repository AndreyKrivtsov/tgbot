#!/bin/bash

# # Перенаправление вывода в файл dockerlog.txt
# exec > >(tee -a dockerlog.txt) 2>&1

# Ребилд и запуск Docker Compose в фоне
docker-compose up -d --build

# Проверка статуса
if [ $? -eq 0 ]; then
    echo "Docker Compose успешно запущен в фоне с ребилдом."
else
    echo "Ошибка при запуске Docker Compose с ребилдом."
    exit 1
fi

# Чтение из файла dockerlog.txt в реальном времени
tail -f dockerlog.txt &
TAIL_PID=$!

# Обработка выхода из скрипта
trap "kill $TAIL_PID" EXIT