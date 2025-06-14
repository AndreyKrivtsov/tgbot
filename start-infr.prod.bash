#!/usr/bin/env bash

cd "$(dirname "$0")/infrastructure" || exit 1

OS_TYPE="$(uname -s)"

if [[ "$OS_TYPE" =~ ^(MINGW|CYGWIN|MSYS) ]]; then
  echo "Detected Windows. Using docker-compose..."
  docker-compose -f docker-compose.production.yml up --build
elif [[ "$OS_TYPE" == "Linux" ]]; then
  echo "Detected Linux. Using docker compose..."
  docker compose -f docker-compose.production.yml up --build
else
  echo "Unsupported OS: $OS_TYPE"
  exit 1
fi
