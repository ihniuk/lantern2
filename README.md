# Lantern II - Modern Network Scanner & Speed Monitor

Lantern II is a powerful, containerised network scanning and monitoring application. It discovers devices on your local subnet, tracks their uptime status, monitors your internet connection quality, and provides detailed insights via a sleek, modern React interface.


## 🚀 Features

*   **Host Discovery**: Automatically scans your configured subnet (e.g., `192.168.1.0/24`) to find connected devices.
*   **Real-time Status**: Tracks device online/offline status with an event timeline and uptime history graph.
*   **Internet Speed Monitor**:
    *   **Automated Testing**: Configurable background speed tests (via Ookla).
    *   **Performance Analytics**: Visualize Download, Upload, and Ping trends over 24h.
    *   **Historical Data**: Track ISP reliability and average speeds over time.
    *   **Next Run Indicator**: Know exactly when the next test is scheduled.
*   **Deep Scanning**:
    *   **Port Scanning**: Checks for common open ports.
    *   **OS Detection**: Attempts to identify the operating system of discovered devices.
    *   **MAC Address Vendor Lookup**: Identifies device manufacturers.
*   **Modern UI**:
    *   **Dark Mode**: Sleek Anthracite theme with a toggle.
    *   **Sort & Search**: Filter devices by Name, IP, Vendor, or MAC Address.
    *   **Interactive Table**: Sortable columns and detailed device drawers.
    *   **Live Terminal**: Watch scan logs in real-time.
*   **Management**:
    *   Trigger manual scans or speed tests.
    *   Wake-on-LAN (WOL) support.
    *   Configurable scan and speed test intervals.

## 🛠️ Technology Stack

*   **Frontend**: React, Vite, TailwindCSS, Recharts, Lucide Icons.
*   **Backend**: Node.js, Express, Prisma ORM.
*   **Database**: SQLite (persisted locally).
*   **Infrastructure**: Docker, Nginx, Nmap.

## 🐳 Quick Start

### Prerequisites

*   Docker & Docker Compose installed on your machine.
*   *Note*: For best results (especially ARP scanning), run on a Linux host. Windows/Mac Docker Desktop may have limitations with network discovery due to virtualization.

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/ihniuk/lantern2.git
    cd lantern2
    ```

2.  Start the application:
    ```bash
    docker-compose up --build -d
    ```

3.  Access the UI:
    Open your browser and navigate to `http://localhost:3005`.

## ⚙️ Configuration

Click the **Settings** (gear icon) in the UI to configure:

*   **IP Range**: The CIDR range to scan (Default: `192.168.1.0/24`). *Ensure this matches your local network.*
*   **Speed Test Interval**: Frequency of automatic background speed tests (Default: `15` minutes).
*   **DNS Server**: The DNS server to use for your network (Default: `8.8.8.8`).
*   **Scan Interval**: Frequency of automatic background scans (Default: `15` minutes).

## 📂 Project Structure

```
├── client/         # React Frontend
│   ├── src/
│   └── Dockerfile
├── server/         # Node.js Backend
│   ├── src/
│   ├── prisma/     # Database Schema
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🐛 Troubleshooting

*   **No devices found?**
    *   Verify the **IP Range** in settings matches your specific subnet.
    *   Check if Docker has network access. On Linux, the container uses `network_mode: host`.
*   **Database Issues**:
    *   Data is saved to `./data/dev.db`. If you need to reset, stop the container and delete this file (or use "Clear Data" in Settings).

## 📄 License

MIT License.
