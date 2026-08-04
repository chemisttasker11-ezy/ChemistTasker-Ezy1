FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ARG VITE_RECAPTCHA_SITE_KEY
ARG VITE_Maps_API_KEY

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY} \
    VITE_Maps_API_KEY=${VITE_Maps_API_KEY}

COPY shared-core /shared-core

COPY frontend_web/package*.json ./
RUN npm install

COPY scripts /scripts
COPY frontend_web/ ./

RUN mkdir -p /env && \
    printf 'VITE_API_URL=%s\nVITE_RECAPTCHA_SITE_KEY=%s\nVITE_Maps_API_KEY=%s\n' \
    "$VITE_API_URL" \
    "$VITE_RECAPTCHA_SITE_KEY" \
    "$VITE_Maps_API_KEY" \
    > /env/web.prod.env

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend_web/nginx-spa.conf /etc/nginx/conf.d/default.conf