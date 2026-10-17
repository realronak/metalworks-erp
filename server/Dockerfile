FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install --workspace=server --omit=dev

COPY server ./server

EXPOSE 5000

CMD ["npm", "run", "start", "--workspace=server"]
