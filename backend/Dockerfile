FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY knexfile.js ./

# Copy migrations
COPY src/migrations ./src/migrations

RUN mkdir -p /app/data /app/logs

EXPOSE 3000

CMD ["node", "dist/index.js"]