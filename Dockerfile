FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV BIND_HOST=0.0.0.0
ENV PORT=4020

EXPOSE 4020

CMD ["node", "src/app.js"]
