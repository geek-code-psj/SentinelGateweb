FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src/ ./src/
COPY backend/bootstrap.js .
EXPOSE 3001
CMD ["node", "src/server.js"]