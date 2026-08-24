FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build ulang CSS admin panel (Tailwind v4) saat image dibuat, biar tidak perlu proses build terpisah.
RUN npm run build:css

EXPOSE 3080

CMD ["node", "server.js"]
