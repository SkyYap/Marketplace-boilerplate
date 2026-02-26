FROM node:18-alpine

# ─── Install SQLite build tools ───
RUN apk add --no-cache \
    sqlite \
    python3 \
    make \
    g++

WORKDIR /app

# ─── Install dependencies ───
COPY package.json package-lock.json ./
RUN npm ci

# ─── Copy source and build ───
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# ─── Copy JSON data files to dist ───
RUN cp -r src/providers dist/providers

# ─── Clean up build tools ───
RUN apk del python3 make g++

# ─── Runtime config ───
ENV PORT=3000
ENV DATABASE_PATH=/data/db.sqlite
ENV PROOF_PROVIDER=mock
EXPOSE 3000

# ─── Persist database ───
VOLUME ["/data"]

CMD ["node", "dist/server.js"]
