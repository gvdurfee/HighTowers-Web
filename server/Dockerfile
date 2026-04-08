# Portable runtime for NM Wing / any Docker host — same image Fly.io, Render, or wing IT can run.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js sentinelHubImagery.js ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "index.js"]
