FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm install --workspace=client

COPY client ./client

RUN npm run build --workspace=client

FROM nginx:alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
