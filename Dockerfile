FROM node:20-alpine

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the application source.
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]