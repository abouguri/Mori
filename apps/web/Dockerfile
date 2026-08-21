FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/web/scripts apps/web/scripts
COPY packages/renderer/package.json packages/renderer/package.json
RUN npm install

COPY . .

CMD ["npm", "run", "dev", "--workspace=apps/web", "--", "-H", "0.0.0.0"]
