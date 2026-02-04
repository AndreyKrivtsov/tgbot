FROM node:22.16.0 AS base

WORKDIR /app

FROM base AS install
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmjs.com/
RUN npm cache clean --force
RUN npm i
COPY . .
RUN npm run migrate
ENV NODE_ENV=production
RUN npm run build
COPY entrypoint.sh ./
ENTRYPOINT ["sh", "./entrypoint.sh"]