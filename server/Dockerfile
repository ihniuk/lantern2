FROM node:20-alpine

# Install network tools
RUN apk add --no-cache nmap nmap-scripts iputils arp-scan openssl samba-client

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
