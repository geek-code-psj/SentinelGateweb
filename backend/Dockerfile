FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src/ ./src/
COPY backend/bootstrap.js .
EXPOSE 8080
CMD ["node", "src/server.js"]
