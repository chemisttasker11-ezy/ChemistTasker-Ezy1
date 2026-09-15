FROM node:22-alpine AS build

WORKDIR /app

COPY shared-core /shared-core

COPY frontend_web/package*.json ./
RUN npm install

COPY scripts /scripts
RUN mkdir -p /env
COPY env/web.prod.env /env/web.prod.env
COPY frontend_web/ ./

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend_web/nginx-spa.conf /etc/nginx/conf.d/default.conf
