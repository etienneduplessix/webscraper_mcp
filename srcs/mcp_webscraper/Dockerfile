# ./srcs/mcp_webscraper/Dockerfile
FROM node:20.19.3

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && apt-get clean

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
# Install Playwright browsers
RUN npx playwright install --with-deps

COPY . .

EXPOSE 8080

CMD ["npm", "start"]