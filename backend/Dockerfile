FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY bootstrap.js .
EXPOSE 8080
CMD ["node", "src/server.js"]
