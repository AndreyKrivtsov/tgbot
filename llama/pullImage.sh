#!/bin/bash

echo "[pullImage.sh] Installing node-llama-cpp"
echo "[pullImage.sh] npm i -g node-llama-cpp"
npm i -g node-llama-cpp

echo "[pullImage.sh] Pulling image"
echo '[pullImage.sh] npx --no node-llama-cpp pull --dir ./models "hf:Vikhrmodels/Vikhr-Gemma-2B-instruct-GGUF:Q4_K"'
npx --no node-llama-cpp pull --dir ./models "hf:Vikhrmodels/Vikhr-Gemma-2B-instruct-GGUF:Q4_K"