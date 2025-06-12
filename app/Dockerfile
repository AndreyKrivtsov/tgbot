FROM node:20.11.0 AS base

WORKDIR /app

FROM base AS install
COPY package.json package-lock.json ./
RUN npm cache clean --force
RUN npm i
COPY . .
ENV NODE_ENV=production
RUN npm run build
COPY entrypoint.sh ./
ENTRYPOINT ["sh", "./entrypoint.sh"]