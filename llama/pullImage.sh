#!/bin/bash

echo "[pullImage.sh] Installing node-llama-cpp"
echo "[pullImage.sh] npm i -g node-llama-cpp"
npm i -g node-llama-cpp

echo "[pullImage.sh] Pulling image"
echo '[pullImage.sh] npx --no node-llama-cpp pull --dir ./models "hf:mradermacher/Llama-3.2-1B-Instruct-Uncensored-GGUF:Q8_0"'
npx --no node-llama-cpp pull --dir ./models "hf:mradermacher/Llama-3.2-1B-Instruct-Uncensored-GGUF:Q8_0"