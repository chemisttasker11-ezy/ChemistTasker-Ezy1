FROM node:22-alpine AS build
WORKDIR /workspace/frontend_web/landing_next

# The landing app consumes the repository-local shared-core package and its
# preinstall hook builds that package through this repository script. Keep the
# repository root as the Docker build context and preserve its relative layout
# because npm records the local file dependency as ../../shared-core.
COPY scripts/prepare-shared-core.mjs /workspace/scripts/prepare-shared-core.mjs
COPY shared-core /workspace/shared-core
# .npmrc install-links copies local packages (shared-core and ../shared UI)
# before npm runs the root preinstall, so build shared-core first.
RUN npm ci --prefix /workspace/shared-core --ignore-scripts --no-audit --no-fund \
    && npm run build --prefix /workspace/shared-core
COPY frontend_web/shared /workspace/frontend_web/shared
COPY frontend_web/landing_next/package.json ./package.json
COPY frontend_web/landing_next/package-lock.json ./package-lock.json
COPY frontend_web/landing_next/.npmrc ./.npmrc
RUN CT_SHARED_CORE_SKIP_PREPARE=1 npm ci --no-audit --no-fund
COPY frontend_web/landing_next/ ./
ARG NEXT_PUBLIC_SITE_URL=https://chemisttasker.com.au
ARG NEXT_PUBLIC_PLATFORM_URL=https://chemisttasker.com.au
ARG NEXT_PUBLIC_Maps_API_KEY=
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
ARG REQUIRE_WEB_INTEGRATIONS=0
# next.config.ts compiles its fallback rewrites at build time, so the image
# needs the Docker-network addresses here; runtime env alone is too late.
ARG DASHBOARD_INTERNAL_URL=http://frontend:80
ARG PLATFORM_API_URL=http://web:8000/api/v1
ENV DASHBOARD_INTERNAL_URL=$DASHBOARD_INTERNAL_URL
ENV PLATFORM_API_URL=$PLATFORM_API_URL
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
    fi && npm run build \
    && if grep -Eq '127\.0\.0\.1|localhost' .next/routes-manifest.json; then \
      echo "routes-manifest.json contains loopback rewrite destinations" >&2; exit 1; \
    fi

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /workspace/frontend_web/landing_next/.next/standalone ./
COPY --from=build --chown=node:node /workspace/frontend_web/landing_next/.next/static ./frontend_web/landing_next/.next/static
COPY --from=build --chown=node:node /workspace/frontend_web/landing_next/public ./frontend_web/landing_next/public
WORKDIR /app/frontend_web/landing_next
USER node
EXPOSE 3000
CMD ["node", "server.js"]
