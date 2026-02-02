# Lantern II - Modern Network Scanner & Speed Monitor

Lantern II is a powerful, containerised network scanning and monitoring application. It discovers devices on your local subnet, tracks their uptime status, monitors your internet connection quality, and provides detailed insights via a sleek, modern React interface.

## 🚀 Key Features

### 📡 Network Scanning
*   **Host Discovery**: Automatically scans your configured subnet (e.g., `192.168.1.0/24`) to find connected devices.
*   **Real-time Status**: Tracks device online/offline status with an event timeline and uptime history graph.
*   **Smart Recognition**:
    *   **Port Scanning**: Checks for common open ports.
    *   **OS Detection**: Attempts to identify the operating system.
    *   **MAC Vendor Lookup**: Automatically identifies device manufacturers.
*   **Device Customization**:
    *   **Edit Details**: Manually override Name, Vendor, Type, and Icon for any device.
    *   **Data Persistence**: Custom details are saved and remembered.

### 🔔 Notification Center
*   **In-App Alerts**: A dedicated notification drawer (Bell Icon) tracks important network events.
*   **Smart Grouping**: "First Scan" results are grouped to avoid notification spam.
*   **Event Types**:
    *   **New Device**: Instant alert when a new device joins the network.
    *   **IP Change**: Notifies you if a known device changes its IP address.
    *   **Speed Drop**: Alerts if internet speed drops >20% below your 7-day average.
    *   **Device Status**: (Optional) track Online/Offline status for specific critical devices.

### ⚡ Internet Speed Monitor
*   **Automated Testing**: Configurable background speed tests (via Ookla).
*   **Performance Analytics**: Visualize Download, Upload, and Ping trends over 24h.
*   **Historical Data**: Track ISP reliability and average speeds over time.
*   **Next Run Indicator**: Know exactly when the next test is scheduled.

### 💾 Data Management
*   **CSV Export/Import**: Backup your device list or migrate data between instances.
*   **Auto-Backups**: Daily JSON backups of your device database.

## 🛠️ Technology Stack

*   **Frontend**: React, Vite, TailwindCSS, Recharts, Lucide Icons.
*   **Backend**: Node.js, Express, Prisma ORM.
*   **Database**: SQLite (persisted locally).
*   **Infrastructure**: Docker, Nmap.

## 🐳 Quick Start

### Prerequisites

*   Docker & Docker Compose installed on your machine.
*   *Note*: For best results (especially ARP scanning), run on a Linux host with `network_mode: host`.

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

*   **Scanner**: Set IP Range (CIDR), Scan Interval, and DNS Server.
*   **Speed Monitor**: Set Test Interval (default 60 mins).
*   **Notifications**: Toggle global alerts for New Devices and Speed Drops.

## 📂 Project Structure

```
├── client/         # React Frontend
│   ├── src/
│   └── Dockerfile
├── server/         # Node.js Backend
│   ├── src/
│   │   ├── services/  # Core Logic (Scanner, SpeedTest, Notifications)
│   │   └── routes/    # API Endpoints
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
    *   Data is saved to `./data/dev.db`. Use "Clear Data" in Settings to reset.

## 📄 License

MIT License.
