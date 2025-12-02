# Passdoo Desktop

Desktop application for Passdoo password manager, built with [Tauri](https://tauri.app/) for macOS and Windows.

![Passdoo Desktop](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![License](https://img.shields.io/badge/license-Proprietary-red)

## Features

- 🔐 **Secure Authentication** - Device code flow for seamless login
- 📂 **Organized Passwords** - Personal and Shared password tabs
- 👥 **Client Grouping** - Passwords organized by client/partner
- 📋 **Quick Copy** - One-click copy for usernames and passwords
- 🎨 **Modern UI** - Clean bordeaux-themed interface
- 🖥️ **Cross-platform** - Native apps for macOS and Windows

## Screenshots

<p align="center">
  <img src="docs/screenshot.png" alt="Passdoo Desktop Screenshot" width="400">
</p>

## Installation

### macOS

1. Download `Passdoo_x.x.x_aarch64.dmg` (Apple Silicon) or `Passdoo_x.x.x_x64.dmg` (Intel) from [Releases](https://github.com/balduz84/Passdoo-desktop/releases)
2. Open the DMG file
3. Drag Passdoo to Applications folder
4. Open Passdoo from Applications

### Windows

1. Download `Passdoo_x.x.x_x64-setup.exe` from [Releases](https://github.com/balduz84/Passdoo-desktop/releases)
2. Run the installer
3. Follow the installation wizard
4. Launch Passdoo from Start Menu

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

```bash
# Clone the repository
git clone https://github.com/balduz84/Passdoo-desktop.git
cd Passdoo-desktop

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build

```bash
# Build for production
npm run tauri build
```

Build outputs will be in `src-tauri/target/release/bundle/`.

## Tech Stack

- **Frontend**: Vanilla JavaScript, CSS
- **Backend**: Rust with Tauri 2.0
- **Build**: Vite
- **API**: Odoo REST API with Bearer token authentication

## Configuration

The app connects to the Passdoo server at `portal.novacs.net`. This is configured in `src/main.js`.

## Authentication Flow

1. App generates a 6-character device code
2. User opens browser to authenticate
3. User enters the device code on the web portal
4. App polls for authentication completion
5. Upon success, app receives access token

## License

Proprietary - © 2024 Novacs Srl. All rights reserved.

## Support

For support, contact [support@novacs.net](mailto:support@novacs.net)
