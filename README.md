# 🖱️ gSomnia Click dApp

<p align="center">
  <img src="./public/hero.png" alt="gSomnia Click dApp Screenshot" />
</p>

**gSomnia Click** is a fun and interactive Web3 game on the Somnia Network Testnet. Click the button, rack up on-chain clicks, and climb the leaderboard!

---

## 🚀 Table of Contents
- [🖱️ gSomnia Click dApp](#️-gsomnia-click-dapp)
  - [🚀 Table of Contents](#-table-of-contents)
  - [✨ Features](#-features)
  - [🛠️ Tech Stack](#️-tech-stack)
  - [⚡ Getting Started](#-getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [🔗 Connecting to Somnia Network Testnet](#-connecting-to-somnia-network-testnet)
  - [📜 Smart Contract](#-smart-contract)
  - [🔄 Leaderboard Updates](#-leaderboard-updates)
  - [🤝 Contributing](#-contributing)
  - [📄 License](#-license)
  - [🙏 Acknowledgments](#-acknowledgments)

---

## ✨ Features
- **Interactive Click**: Tap to increment your on-chain counter.  
- **Live Leaderboard**: See the top clickers, powered by real blockchain data.  
- **Profile Stats**: Check your personal click count and rank.  
- **Wallet Ready**: Connect seamlessly with MetaMask.  
- **Immersive Audio**: Enjoy click sound effects and background tracks.  
- **Responsive UI**: Works beautifully on both desktop and mobile.  
- **Automated Updates**: Leaderboard data refreshes hourly via GitHub Actions.

---

## 🛠️ Tech Stack
| Layer                | Technology                            |
|----------------------|------------------------------------   |
| Frontend             | React.js, Custom CSS (Glassmorphism)  |
| Blockchain           | Solidity (Somnia Network Testnet)     |
| Web3 Integration     | ethers.js v6                          |
| Wallet               | MetaMask                              |
| Notifications        | react-toastify                        |
| CI/CD                | GitHub Actions                        |

---

## ⚡ Getting Started

### Prerequisites
- **Node.js ≥ v16**  
- **MetaMask** browser extension  
- **STT tokens** for gas (grab from the [Somnia Network](https://testnet.somnia.network/)

### Installation
```bash
git clone https://github.com/lrmn7/gsomnia-click.git
cd gsomnia-click
npm install
npm start
```
Open your browser at `http://localhost:3000` to launch the app.

---

## 🔗 Connecting to Somnia Network Testnet

Click the “Add Network” button to auto-configure, or manually add:
- **Network Name**: Somnia Network Testnet  
- **RPC URL**: https://dream-rpc.somnia.network  
- **Chain ID**: 0xc488 (hex) / 50312 (dec)  
- **Currency**: STT  
- **Explorer**: https://shannon-explorer.somnia.network  

---

## 📜 Smart Contract

📝 **Address**: `0xe811f7919844359f022c346516cae450346f5492`  
Tracks:
- **Global Clicks**: Total across all users.  
- **User Clicks**: Individual counts.  
- **Leaderboard Data**: Sorted ranking.

**Key Functions**:
```solidity
function click() external;
function getLeaderboard() external view returns (address[] memory, uint256[] memory);
```

---

## 🔄 Leaderboard Updates

Automated hourly via GitHub Actions:
1. **Script**: `updateLeaderboard.js` fetches on-chain data.  
2. **Output**: `public/leaderboard.json` with timestamp.  
3. **Frontend**: Displays live data & “Last updated” info.

To trigger manually:
```bash
npm run update-leaderboard
```

---

## 🤝 Contributing

We welcome contributions!  
1. Fork the repo  
2. Create a branch: `git checkout -b feature/your-feature`  
3. Commit: `git commit -m "Add your feature"`  
4. Push: `git push origin feature/your-feature`  
5. Open a Pull Request

Please adhere to the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 📄 License

© 2025 L RMN — see the [LICENSE](./LICENSE) file.

---

## 🙏 Acknowledgments

- **Somnia Network** for the Testnet environment.  
- All community contributors for feedback and code enhancements.  
