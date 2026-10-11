FROM node:22-alpine AS build
WORKDIR /workspace/frontend_web/landing_next

# The landing app consumes the repository-local shared-core package and its
# preinstall hook builds that package through this repository script. Keep the
# repository root as the Docker build context and preserve its relative layout
# because npm records the local file dependency as ../../shared-core.
COPY scripts/prepare-shared-core.mjs /workspace/scripts/prepare-shared-core.mjs
COPY shared-core /workspace/shared-core
COPY frontend_web/landing_next/package.json ./package.json
COPY frontend_web/landing_next/package-lock.json ./package-lock.json
RUN npm ci --no-audit --no-fund
COPY frontend_web/landing_next/ ./
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
COPY --from=build --chown=node:node /workspace/frontend_web/landing_next/.next/standalone ./
COPY --from=build --chown=node:node /workspace/frontend_web/landing_next/.next/static ./.next/static
COPY --from=build --chown=node:node /workspace/frontend_web/landing_next/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
