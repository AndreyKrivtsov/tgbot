FROM node:20.18.3 AS base

RUN apt-get update && apt-get upgrade

FROM base AS install-image
WORKDIR /app
COPY pullImage.sh .
RUN bash pullImage.sh

FROM install-image AS install-app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm i
RUN npm run postinstall

FROM install-app AS build-app
COPY . .
RUN npm run prebuild
RUN npm run build

ENTRYPOINT [ "npm", "run", "start:build" ]