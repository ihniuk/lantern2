FROM node:20-alpine

# Install network tools
# Install network tools and speedtest CLI
# Python3 and Scapy for Kill Switch (ARP Spoofing)
RUN apk add --no-cache nmap nmap-scripts iputils arp-scan openssl samba-client curl python3 py3-pip tcpdump \
    && pip3 install scapy --break-system-packages \
    && curl -s https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz | tar xz -C /usr/bin speedtest

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
