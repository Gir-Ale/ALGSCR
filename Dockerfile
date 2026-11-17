FROM node:20-alpine

WORKDIR /app

# Copy server dependencies
COPY server/package*.json ./server/

# Install dependencies inside the Linux container
RUN cd server && npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy public static frontend
COPY public/ ./public/

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
