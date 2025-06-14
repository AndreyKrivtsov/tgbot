#!/bin/bash

echo "[pullImage.sh] Installing node-llama-cpp"
echo "[pullImage.sh] npm i -g node-llama-cpp"
npm i -g node-llama-cpp

echo "[pullImage.sh] Pulling image"
echo '[pullImage.sh] npx --no node-llama-cpp pull --dir ./models "hf:bartowski/gemma-2-2b-it-abliterated-GGUF:Q6_K_L"'
npx --no node-llama-cpp pull --dir ./models "hf:bartowski/gemma-2-2b-it-abliterated-GGUF:Q6_K_L"