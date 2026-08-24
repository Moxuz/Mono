FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY swagger.json ./swagger.json

# Run as the unprivileged image user; logs remain writable by the app.
RUN mkdir -p logs && chown -R node:node /app
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# KafkaJS 2.2.4 schedules a negative zero-throttle timeout on Node 24
# (upstream compatibility warning; Kafka connectivity remains enabled).
CMD ["node", "--disable-warning=TimeoutNegativeWarning", "src/server.js"]
