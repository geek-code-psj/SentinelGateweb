FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
COPY bootstrap.js .
EXPOSE 3001
CMD ["node", "src/server.js"]
