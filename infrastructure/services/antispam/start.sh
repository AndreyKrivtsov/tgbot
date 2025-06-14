#!/bin/bash

# NOTE: Этот скрипт используется внутри Docker контейнера
# Для запуска сервиса используйте: ../infrastructure/start.sh

uvicorn app:app --host 0.0.0.0 --port 6323