# syntax=docker/dockerfile:1

ARG PYTHON_VERSION=3.13.2
FROM python:${PYTHON_VERSION}-slim as base

# Переменные окружения для Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# ========================================
# СЛОЙ 1: Системные зависимости (кешируется при каждой сборке)
# ========================================
RUN apt-get update && \
    apt-get install -y \
        curl \
        --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# ========================================  
# СЛОЙ 2: Python зависимости (кешируется пока не меняется requirements.txt)
# ========================================
# Сначала копируем ТОЛЬКО requirements.txt
COPY requirements.txt .

# Обновляем pip и устанавливаем зависимости
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ========================================
# СЛОЙ 3: Создание пользователя (кешируется)
# ========================================
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    appuser

# ========================================
# СЛОЙ 4: Код приложения (пересобирается при изменении кода)
# ========================================
# Переключаемся на непривилегированного пользователя
USER appuser

# Копируем весь код приложения
COPY --chown=appuser:appuser . .

# ========================================
# СЛОЙ 5: Запуск (не кешируется)
# ========================================
EXPOSE 6323

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "6323"]
