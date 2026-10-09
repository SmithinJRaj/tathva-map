FROM node:22-bookworm-slim
# better-sqlite3 and @node-rs/argon2 are native; keep a toolchain in case no
# prebuilt binary matches this platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
