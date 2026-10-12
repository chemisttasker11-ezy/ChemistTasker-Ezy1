FROM node:22-alpine AS build
WORKDIR /repo
COPY shared-core/package*.json ./shared-core/
RUN npm ci --prefix shared-core --ignore-scripts --no-audit --no-fund
COPY shared-core/ ./shared-core/
RUN npm run build --prefix shared-core
COPY scripts/prepare-shared-core.mjs ./scripts/prepare-shared-core.mjs
COPY frontend_web/shared/ ./frontend_web/shared/
COPY frontend_web/landing_next/package*.json frontend_web/landing_next/.npmrc ./frontend_web/landing_next/
RUN CT_SHARED_CORE_SKIP_PREPARE=1 npm ci --prefix frontend_web/landing_next --no-audit --no-fund
COPY frontend_web/landing_next/ ./frontend_web/landing_next/
WORKDIR /repo/frontend_web/landing_next
ARG NEXT_PUBLIC_SITE_URL=https://chemisttasker.com.au
ARG NEXT_PUBLIC_PLATFORM_URL=https://chemisttasker.com.au
ARG NEXT_PUBLIC_Maps_API_KEY=
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
ARG REQUIRE_WEB_INTEGRATIONS=0
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_PLATFORM_URL=$NEXT_PUBLIC_PLATFORM_URL
ENV NEXT_PUBLIC_Maps_API_KEY=$NEXT_PUBLIC_Maps_API_KEY
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN if [ "$REQUIRE_WEB_INTEGRATIONS" = "1" ]; then \
      test -n "$NEXT_PUBLIC_SITE_URL" && \
      test -n "$NEXT_PUBLIC_PLATFORM_URL" && \
      test -n "$NEXT_PUBLIC_Maps_API_KEY" && \
      test -n "$NEXT_PUBLIC_RECAPTCHA_SITE_KEY"; \
    fi && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /repo/frontend_web/landing_next/.next/standalone ./
COPY --from=build --chown=node:node /repo/frontend_web/landing_next/.next/static ./frontend_web/landing_next/.next/static
COPY --from=build --chown=node:node /repo/frontend_web/landing_next/public ./frontend_web/landing_next/public
USER node
EXPOSE 3000
CMD ["node", "frontend_web/landing_next/server.js"]
