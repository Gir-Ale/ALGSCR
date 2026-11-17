FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy frontend
COPY public/ ./public/

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server/index.js"]
