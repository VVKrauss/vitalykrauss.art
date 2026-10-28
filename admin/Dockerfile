FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/client.mjs src/config.mjs ./src/
COPY scripts/build.mjs ./scripts/
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4174 AUTH_DATABASE_PATH=/app/.data/auth.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node seed ./seed
COPY --chown=node:node scripts/setup.mjs scripts/healthcheck.mjs ./scripts/
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 4174
CMD ["node", "src/server.mjs"]
