# 🔐 Passdoo Desktop

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Passdoo Logo" width="128"/>
</p>

<p align="center">
  <strong>Password Manager for ODOO - Desktop Application</strong><br>
  Access your passwords saved in Passdoo directly from your desktop
</p>

<p align="center">
  <a href="https://portal.novacs.net/passdoo/downloads">📥 Download</a> •
  <a href="#-installation">📖 Installation</a> •
  <a href="#-usage">🚀 Usage</a>
</p>

---

## ✨ Features

- **Secure Authentication** - Device code flow for seamless login
- **Organized Passwords** - Personal and Shared password tabs
- **Client Grouping** - Passwords organized by client/partner with logos
- **Quick Copy** - One-click copy for usernames and passwords
- **Real-time Search** - Quickly search through all your passwords
- **Cross-platform** - Native apps for macOS and Windows

## 🚀 Installation

### Prerequisites

- macOS 10.15+ or Windows 10+
- Account configured on https://portal.novacs.net

### macOS

1. Download the latest version from [Releases](https://github.com/balduz84/Passdoo-desktop/releases)
   - `Passdoo_x.x.x_aarch64.dmg` for Apple Silicon (M1/M2/M3)
   - `Passdoo_x.x.x_x64.dmg` for Intel
2. Open the DMG file
3. Drag Passdoo to Applications folder
4. Open Passdoo from Applications

### Windows

1. Download `Passdoo_x.x.x_x64-setup.exe` from [Releases](https://github.com/balduz84/Passdoo-desktop/releases)
2. Run the installer
3. Follow the installation wizard
4. Launch Passdoo from Start Menu

## 📖 Usage

### First Login

1. Launch the Passdoo application
2. A unique 6-character device code will be displayed
3. Click "Authenticate" to open the web portal
4. Enter the device code on the web portal
5. The app will automatically detect authentication and load your passwords

### Browsing Passwords

- Use the **Personal** and **Shared** tabs to filter passwords
- Passwords are grouped by client/partner
- Click on a client section to expand/collapse
- Use the search bar to find passwords quickly

### Copying Credentials

- Click the copy icon next to username to copy it
- Click the copy icon next to password to copy it
- A confirmation message will appear

## 🔒 Security

- Passwords are stored encrypted in the ODOO database
- Authentication uses secure device code flow
- No passwords are stored locally
- Bearer token authentication for API calls
- Automatic session management

## 🛠️ Development

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

## 🏗️ Tech Stack

- **Frontend**: Vanilla JavaScript, CSS
- **Backend**: Rust with Tauri 2.0
- **Build**: Vite
- **API**: ODOO REST API with Bearer token authentication

## 📝 Notes

- The app connects to the Passdoo server at `portal.novacs.net`
- Designed to work with ODOO 18 Enterprise Edition
- Requires the Passdoo module installed and configured

## 📄 License

Copyright © 2025 NovaCS

All rights reserved.

## 🔗 Useful Links

- [Passdoo Browser Extension](https://github.com/balduz84/Passdoo-browser-extension)
- [Download Page](https://portal.novacs.net/passdoo/downloads)
- [NovaCS](https://www.novacs.net)

## 🤝 Support

For issues or requests, contact NovaCS technical support.
