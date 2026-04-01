FROM node:20-alpine
RUN apk add --no-cache openssl openssl-dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
COPY prisma ./prisma/
RUN npx prisma generate
RUN npm run build || true
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/app.js"]
