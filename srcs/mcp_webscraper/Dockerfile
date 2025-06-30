# ── srcs/mcp_webscraper/Dockerfile ──
FROM node:20-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# <-- Change this line:
CMD ["node", "index.js"]
