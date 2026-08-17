# TechReboot'26: Queue Management System (QMS)

**QueueCraft** is a comprehensive, multi-module queue management system designed to optimize student-staff interactions at educational institutions. It features a real-time dashboard for staff, mobile-friendly student queueing, and a robust admin interface for configuration and analytics.

## ✨ Features

### 👩‍🏫 Staff Module (Dashboard)
*   **Real-time Queue Management**: Instantly pull and serve the next token.
*   **Token Actions**: Complete, hold, or skip tokens with immediate feedback.
*   **Status Control**: Open or close the counter to control queue access.
*   **Live Metrics**: Track current serving token, wait times, and session statistics.
*   **Socket Sync**: Instant updates across all connected devices.

### 👨‍🎓 Student Module
*   **Get Token**: Request a ticket for a specific service (Printer, Librarian, etc.).
*   **Queue Tracking**: View real-time position in the queue.
*   **Service Details**: Check assigned service counter and operating hours.
*   **Responsive UI**: Seamless experience on mobile and desktop.

### 🛡️ Admin Module
*   **Service Configuration**: Define services and assign them to specific counters.
*   **Counter Management**: Add, edit, or delete service counters.
*   **Staff Management**: Onboard and manage staff users.
*   **User Control**: Manage both staff and student user accounts.

## 🚀 Getting Started

### Prerequisites
*   **Node.js**: v16.x or higher
*   **NPM**: v8.x or higher

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd TR01
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Application

Start the development server:

```bash
npm run server
```

The application will be accessible at:
*   **Student Portal**: `http://localhost:3000`
*   **Staff Dashboard**: `http://localhost:3000/staff`
*   **Admin Portal**: `http://localhost:3000/admin`

## 🤝 Contributing
Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.