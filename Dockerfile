FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

ENV DEMO_MODE=true
ENV VITE_DEMO_MODE=true
RUN npm run build

ENV NODE_ENV=production
ENV LOGIN_OPEN=true

EXPOSE 4000
CMD ["node", "server/app.js"]
