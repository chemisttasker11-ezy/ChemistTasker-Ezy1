FROM node:22-alpine AS build

WORKDIR /app

COPY shared-core /shared-core

COPY frontend_web/package*.json ./
RUN npm install

COPY frontend_web/ ./

ARG VITE_PUBLIC_SITE_ENABLED=0
ARG VITE_API_URL=/api
ARG VITE_Maps_API_KEY=
ARG VITE_RECAPTCHA_SITE_KEY=
ARG REQUIRE_WEB_INTEGRATIONS=0
ENV VITE_PUBLIC_SITE_ENABLED=$VITE_PUBLIC_SITE_ENABLED
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_Maps_API_KEY=$VITE_Maps_API_KEY
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY
RUN if [ "$REQUIRE_WEB_INTEGRATIONS" = "1" ]; then \
      test -n "$VITE_Maps_API_KEY" && \
      test -n "$VITE_RECAPTCHA_SITE_KEY"; \
    fi && npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend_web/nginx-spa.conf /etc/nginx/conf.d/default.conf
