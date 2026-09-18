FROM node:22-alpine AS build

WORKDIR /app

COPY shared-core /shared-core

COPY frontend_web/package*.json ./
RUN npm install

COPY frontend_web/ ./

ARG VITE_PUBLIC_SITE_ENABLED=0
ARG VITE_API_URL=/api
ENV VITE_PUBLIC_SITE_ENABLED=$VITE_PUBLIC_SITE_ENABLED
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend_web/nginx-spa.conf /etc/nginx/conf.d/default.conf
