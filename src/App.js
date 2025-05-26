import React, { useState, useEffect, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css"; 
import abi from "./ClickCounterABI.json"; //
import bgMusicFile from "./assets/sounds/somnia-vibes-music.mp3"; //
import clickSoundFile from "./assets/effects/click.mp3"; //
import { Analytics } from "@vercel/analytics/react"; //
import { FaGithub, FaXTwitter } from "react-icons/fa6"; //
import { SiDiscord, SiInstagram, SiOpensea, SiTelegram } from 'react-icons/si';

const CONTRACT_ADDRESS = "0xe811f7919844359f022c346516cae450346f5492"; //
const SOMNIA_CHAIN_ID_HEX = "0xc488"; // Somnia Network (50312) //

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const [totalClicks, setTotalClicks] = useState(0);
  const [myClicks, setMyClicks] = useState(0);

  const [leaderboard, setLeaderboard] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userRank, setUserRank] = useState(null);
  const [totalSystemCheckIns, setTotalSystemCheckIns] = useState(0);
  const [showFullStats, setShowFullStats] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const bgMusicRef = useRef(null);
  const clickAudioRef = useRef(null);

  const [pendingTransactions, setPendingTransactions] = useState(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; //

  const [myTodayClicks, setMyTodayClicks] = useState(0);

  const [didLoadLB, setDidLoadLB] = useState(false);

  const [lastLeaderboardUpdate, setLastLeaderboardUpdate] = useState(null);

  const [checkedInToday, setCheckedInToday] = useState(false);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [checkInStreak, setCheckInStreak] = useState(0);

  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // const [appLoaded, setAppLoaded] = useState(false); // Tampaknya tidak digunakan secara signifikan, bisa dipertimbangkan untuk dihapus

  const [isOnCorrectNetwork, setIsOnCorrectNetwork] = useState(false);

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); //

  const [lastTxTime, setLastTxTime] = useState(0);

  const [showWalletModal, setShowWalletModal] = useState(false);

  const detectWallets = () => { //
    const wallets = [];
    if (window.ethereum) {
      if (window.ethereum.isMetaMask) wallets.push({ name: "MetaMask", provider: window.ethereum, icon: "🦊" }); //
      if (window.ethereum.isCoinbaseWallet) wallets.push({ name: "Coinbase", provider: window.ethereum, icon: "📱" }); //
      if (window.ethereum.isTrust) wallets.push({ name: "Trust", provider: window.ethereum, icon: "🔒" }); //
      if (window.ethereum.isBraveWallet) wallets.push({ name: "Brave", provider: window.ethereum, icon: "🦁" }); //
      if (wallets.length === 0) wallets.push({ name: "Browser Wallet", provider: window.ethereum, icon: "🌐" }); //
    }
    return wallets;
  };

  const openWalletSelector = () => { //
    if (isConnected || isConnecting) return;
    const availableWallets = detectWallets();
    if (availableWallets.length === 0) {
      toast.error("Wallet not found in the browser. Please install MetaMask or another wallet first."); //
      return;
    }
    if (availableWallets.length === 1) {
      connectWallet();
      return;
    }
    setShowWalletModal(true);
  };

  const handleSelectWallet = (selectedProvider) => { //
    window.ethereum = selectedProvider;
    setShowWalletModal(false);
    connectWallet();
  };

  const WalletSelectorModal = () => { //
    if (!showWalletModal) return null;
    const wallets = detectWallets();
    return (
      <div className="modal-overlay">
        <div className="modal-content wallet-modal">
          <div className="modal-header">
            <h2>Pilih Wallet</h2>
            <button className="close-button" onClick={() => setShowWalletModal(false)}>×</button>
          </div>
          <div className="modal-body">
            <div className="wallet-list">
              {wallets.map((wallet, index) => (
                <button key={index} className="wallet-button" onClick={() => handleSelectWallet(wallet.provider)}>
                  <span className="wallet-icon">{wallet.icon}</span>
                  <span className="wallet-name">{wallet.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => { //
    bgMusicRef.current = new Audio(bgMusicFile);
    bgMusicRef.current.loop = true;
    bgMusicRef.current.muted = isMuted;
    clickAudioRef.current = new Audio(clickSoundFile);
    return () => {
      bgMusicRef.current?.pause();
      clickAudioRef.current?.pause();
    };
  }, [isMuted]); // Memindahkan isMuted ke dependency array agar BGM diperbarui saat isMuted berubah

  useEffect(() => { //
    if (!bgMusicRef.current) return;
    bgMusicRef.current.muted = isMuted;
    if (!isMuted) {
      bgMusicRef.current.play().catch((err) => console.log("BGM autoplay blocked:", err));
    } else {
      bgMusicRef.current.pause();
    }
  }, [isMuted]);


  const loadOffChainLeaderboard = async () => { //
    try {
      const res = await fetch("/leaderboard.json");
      if (!res.ok) throw new Error("Failed to fetch leaderboard.json");
      const jsonData = await res.json();
      let leaderboardData = jsonData.data && jsonData.lastUpdate ? jsonData.data : jsonData;
      let lastUpdateTimestamp = jsonData.data && jsonData.lastUpdate ? new Date(jsonData.lastUpdate) : null;
      
      leaderboardData.sort((a, b) => Number(b.clicks) - Number(a.clicks));
      setLeaderboard(leaderboardData);
      setTotalUsers(leaderboardData.length);
      setLastLeaderboardUpdate(lastUpdateTimestamp);

      if (signer) {
        const addr = await signer.getAddress();
        const userIndex = leaderboardData.findIndex((x) => x.user.toLowerCase() === addr.toLowerCase());
        setUserRank(userIndex >= 0 ? userIndex + 1 : null);
      }
      console.log("Off-chain leaderboard loaded!");
    } catch (err) {
      console.error(err);
      toast.error("Unable to load offline leaderboard.");
    }
  };

  const setupNetwork = async (forceCheck = false) => { //
    if (!window.ethereum) {
      toast.error("Please install MetaMask!");
      return false;
    }
    if (!forceCheck && isOnCorrectNetwork) return true;
    try {
      const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
      if (currentChainId !== SOMNIA_CHAIN_ID_HEX) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SOMNIA_CHAIN_ID_HEX }],
          });
        } catch (switchError) {
            // Error code 4902 indicates the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
                try {
                    await addSomniaNetwork(); // Coba tambahkan jaringan
                    // Setelah menambahkan, coba switch lagi secara otomatis
                     await window.ethereum.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: SOMNIA_CHAIN_ID_HEX }],
                    });
                } catch (addError) {
                    toast.error("Please add and switch to Somnia Network manually.");
                    setIsOnCorrectNetwork(false);
                    return false;
                }
            } else {
                toast.error("Please switch to Somnia Network manually.");
                setIsOnCorrectNetwork(false);
                return false;
            }
        }
      }
      setIsOnCorrectNetwork(true);
      return true;
    } catch (err){
      toast.error("Network setup failed.");
      setIsOnCorrectNetwork(false);
      return false;
    }
  };
  
  const loadBlockchainData = async () => { //
    try {
      const prov = new BrowserProvider(window.ethereum);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 15000));
      const sign = await Promise.race([prov.getSigner(), timeoutPromise]);
      const cont = new Contract(CONTRACT_ADDRESS, abi, sign);
      setProvider(prov);
      setSigner(sign);
      setContract(cont);
      const addr = await sign.getAddress();
      const [total, mine] = await Promise.all([
        Promise.race([cont.totalClicks(), timeoutPromise]),
        Promise.race([cont.userClicks(addr), timeoutPromise]),
      ]);
      setTotalClicks(Number(total));
      setMyClicks(Number(mine));
      setIsConnected(true);
      return true;
    } catch (err) {
      console.error("Unable to load data:", err);
      if (err.message && err.message.includes("HTTP request failed")) {
        toast.error("Network connection error. Please try again later.");
      } else if (err.message === "Connection timeout") {
        toast.error("Connection timeout. Please try again later.");
      } else {
        toast.error("Unable to load data. Please check your connection or RPC.");
      }
      return false;
    }
  };

  const loadUserGmData = async () => { //
    if (!signer) {
      setCheckedInToday(false);
      setCheckInStreak(0);
      setTotalCheckIns(0);
      return false;
    }
    try {
      const userAddress = await signer.getAddress();
      const storedCheckedInToday = localStorage.getItem(`checkedInToday_${userAddress}`) === "true";
      let streak = parseInt(localStorage.getItem(`checkInStreak_${userAddress}`)) || 0;
      let total = parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;

      try {
        const cacheKey = `_t=${Date.now()}`;
        const userPrefix = userAddress.substring(2, 4).toLowerCase();
        const userStatsUrl = `/stats/users/${userPrefix}/${userAddress.toLowerCase()}.json?${cacheKey}`;
        const userResponse = await fetch(userStatsUrl, { cache: "no-store" });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          total = userData.totalCheckIns || total; // Ambil dari server jika ada
          streak = userData.currentStreak || userData.maxStreak || streak; // Ambil dari server jika ada

          localStorage.setItem(`totalCheckIns_${userAddress}`, total.toString());
          localStorage.setItem(`checkInStreak_${userAddress}`, streak.toString());
          
          const serverDate = new Date(userData.lastCheckIn);
          const todayDate = new Date();
          const isSameDay = serverDate.getFullYear() === todayDate.getFullYear() &&
                            serverDate.getMonth() === todayDate.getMonth() &&
                            serverDate.getDate() === todayDate.getDate();
          
          if (isSameDay) {
            localStorage.setItem(`checkedInToday_${userAddress}`, "true");
            setCheckedInToday(true);
            setCheckInStreak(streak);
            setTotalCheckIns(total);
            return true;
          } else {
             localStorage.removeItem(`checkedInToday_${userAddress}`); // Reset jika tanggal server beda
             setCheckedInToday(false); // Set false jika belum check-in hari ini menurut server
          }
        }
      } catch (fetchError) {
        console.error("Error fetching user stats, using local storage:", fetchError);
      }
      // Fallback ke local storage jika fetch gagal atau data tidak ada
      setCheckedInToday(storedCheckedInToday);
      setCheckInStreak(streak);
      setTotalCheckIns(total);
      return storedCheckedInToday;

    } catch (error) {
      console.error("Error loading GM data:", error);
      return false;
    }
  };

  const connectWallet = async () => { //
    if (isConnected || isConnecting) return true;
    toast.dismiss();
    setIsConnecting(true);
    try {
      if (bgMusicRef.current && isMuted) { // Hanya mainkan jika sebelumnya muted
        bgMusicRef.current.muted = false;
        setIsMuted(false); // Update state
        try { await bgMusicRef.current.play(); } catch {}
      }
      await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!(await setupNetwork(true))) { // force check network
        setIsConnecting(false);
        return false;
      }
      if (!(await loadBlockchainData())) {
        setIsConnecting(false);
        return false;
      }
      if (!didLoadLB) {
        await loadOffChainLeaderboard();
        setDidLoadLB(true);
      } else if (signer && leaderboard.length > 0) {
        const addr = await signer.getAddress();
        const userIndex = leaderboard.findIndex((entry) => entry.user.toLowerCase() === addr.toLowerCase());
        setUserRank(userIndex >= 0 ? userIndex + 1 : null);
      }
      await loadUserGmData();
      toast.success("Connected successfully! 🎉");
      return true;
    } catch (err) {
      if (err.code === 4001) toast.error("Connection rejected by user"); //
      else toast.error("Connection failed");
      // Kembalikan state mute jika koneksi gagal & BGM sempat di-unmute
      if (bgMusicRef.current && !isMuted) {
          setIsMuted(true);
          bgMusicRef.current.muted = true;
      }
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setSigner(null);
    setProvider(null);
    setContract(null);
    setMyClicks(0);
    setUserRank(null);
    // Reset stats personal lainnya
    setMyTodayClicks(0);
    setCheckedInToday(false);
    setCheckInStreak(0);
    setTotalCheckIns(0);
    if (bgMusicRef.current && !isMuted) { // Matikan musik jika sedang play
        bgMusicRef.current.pause(); // Atau set muted true
        // setIsMuted(true); 
    }
    toast.info("Wallet disconnected.");
  };

  const handleClick = async () => { //
    if (!isConnected || !contract || !signer) {
      toast.error("Please connect your wallet first");
      await connectWallet(); // Coba konek jika belum
      return;
    }
    if (!(await setupNetwork())) return;
    if (!isMuted) {
      clickAudioRef.current.currentTime = 0;
      clickAudioRef.current.play().catch(() => {});
    }
    const now = Date.now();
    const timeSinceLastTx = now - lastTxTime;
    if (timeSinceLastTx < 300) { //
      const waitTime = 300 - timeSinceLastTx;
      toast.info(`Please wait ${Math.ceil(waitTime / 1000)} seconds before next click`);
      await delay(waitTime);
    }
    setLastTxTime(Date.now());
    try {
      const tx = await contract.click();
      setPendingTransactions((prev) => new Set(prev).add(tx.hash));
      setMyClicks((prev) => prev + 1);
      setTotalClicks((prev) => prev + 1);
      const userAddress = await signer.getAddress();
      setMyTodayClicks((prev) => {
        const next = prev + 1;
        localStorage.setItem(`myTodayClicks_${userAddress}`, next.toString());
        return next;
      });
      toast.info(
        <div>Transaction sent! <br />
          <a href={`https://shannon-explorer.somnia.network/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "#FFA500" }}>
            View on Explorer
          </a>
        </div>
      );
      setTimeout(() => {
        setPendingTransactions((prev) => {
          const next = new Set(prev);
          next.delete(tx.hash);
          return next;
        });
      }, 7000); // Perpanjang timeout sedikit
    } catch (err) {
      console.error("Click error:", err);
      if (err.error && err.error.status === 429) toast.warning("Too many requests. Please wait a moment."); //
      else if (err.code === "INSUFFICIENT_FUNDS") toast.error("Not enough STT for gas"); //
      else if (err.code === "ACTION_REJECTED") toast.error("Transaction rejected by user"); //
      else toast.error("An unexpected error occurred during click.");
    }
  };

  useEffect(() => { //
    loadTodayClicksFromLocal();
    loadGmSummaryData();
    // setAppLoaded(true);

    if (!window.ethereum) {
      loadOffChainLeaderboard(); // Muat leaderboard bahkan jika tidak ada ethereum
      setDidLoadLB(true);
      return;
    }

    const autoConnect = async () => {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0 && !isConnecting && !isConnected) {
          setIsConnecting(true); // Set isConnecting di awal
          if (bgMusicRef.current && isMuted) { // Hanya mainkan jika muted
            bgMusicRef.current.muted = false;
            setIsMuted(false);
            try { await bgMusicRef.current.play(); } catch {}
          }
          await window.ethereum.request({ method: "eth_requestAccounts" });
          if (!(await setupNetwork(true))) throw new Error("Network setup failed");
          if (!(await loadBlockchainData())) throw new Error("Blockchain data load failed");
          if (!didLoadLB) {
            await loadOffChainLeaderboard();
            setDidLoadLB(true);
          }
          await loadUserGmData();
          console.log("Connected automatically");
          toast.success("Wallet connected automatically! 🎉");
        } else if (accounts.length === 0 && !didLoadLB) {
            loadOffChainLeaderboard();
            setDidLoadLB(true);
        }
      } catch (error) {
        console.warn("Auto-connect failed:", error.message);
        // Tidak menampilkan toast error untuk auto-connect yang gagal agar tidak mengganggu
        if (bgMusicRef.current && !isMuted) { // Jika BGM sempat di-unmute
            setIsMuted(true);
            bgMusicRef.current.muted = true;
        }
      } finally {
        setIsConnecting(false); // Selalu set false di akhir
      }
    };
    autoConnect();

    const handleChainChange = (_chainId) => { //
      // window.location.reload(); // Cara paling mudah, atau handle state update
      toast.info("Network changed. Re-validating...");
      setIsConnected(false); // Anggap disconnected sementara
      setIsOnCorrectNetwork(false);
      setSigner(null); // Reset signer
      setupNetwork(true).then(correct => {
          if (correct) loadBlockchainData();
          else toast.error("Please switch to Somnia Network.");
      });
    };
    const handleAccountsChange = async (accounts) => { //
      if (accounts.length === 0) {
        setIsConnected(false);
        setSigner(null);
        setMyClicks(0); // Reset data pengguna
        setUserRank(null);
        toast.info("Wallet disconnected or account changed to none.");
      } else {
        toast.info("Account changed. Reloading data...");
        await loadBlockchainData(); // Muat ulang data untuk akun baru
        await loadUserGmData(); // Muat ulang data GM untuk akun baru
      }
    };

    window.ethereum.on("chainChanged", handleChainChange);
    window.ethereum.on("accountsChanged", handleAccountsChange);
    return () => {
      window.ethereum.removeListener("chainChanged", handleChainChange);
      window.ethereum.removeListener("accountsChanged", handleAccountsChange);
    };
  }, [didLoadLB]); // isConnecting, isConnected dependensi dihapus untuk autoConnect


  useEffect(() => { //
    if (signer) {
      loadUserGmData();
      loadTodayClicksFromLocal();
      // Recalculate rank if leaderboard is already loaded
      if (leaderboard.length > 0) {
        const userAddress = signer.address;
        if (userAddress) {
            const index = leaderboard.findIndex(entry => entry.user.toLowerCase() === userAddress.toLowerCase());
            setUserRank(index >=0 ? index + 1 : null);
        }
      }
    } else {
      setCheckedInToday(false);
      setCheckInStreak(0);
      setTotalCheckIns(0);
      setMyTodayClicks(0);
      setUserRank(null); // Pastikan rank juga direset
    }
  }, [signer, leaderboard]); // Tambahkan leaderboard sebagai dependency

  const loadTodayClicksFromLocal = async () => { //
    try {
      const today = new Date().toDateString();
      if (signer) {
        const userAddress = await signer.getAddress();
        const storedDate = localStorage.getItem(`clickDate_${userAddress}`);
        const storedValue = localStorage.getItem(`myTodayClicks_${userAddress}`);
        if (storedDate === today && storedValue) setMyTodayClicks(Number(storedValue));
        else {
          localStorage.setItem(`clickDate_${userAddress}`, today);
          localStorage.setItem(`myTodayClicks_${userAddress}`, "0");
          setMyTodayClicks(0);
        }
      } else setMyTodayClicks(0);
    } catch (err) {
      console.error("Error loading today's clicks:", err);
      setMyTodayClicks(0);
    }
  };

  const loadGmSummaryData = async () => { //
    try {
      const cacheKey = `_t=${Date.now()}`;
      let summaryTotalCheckIns = 0;

      const response = await fetch(`/stats/summary.json?${cacheKey}`, { cache: "no-store" });
      if (response.ok) {
        const summaryData = await response.json();
        if (summaryData.totalCheckIns) {
            summaryTotalCheckIns = summaryData.totalCheckIns;
            setTotalSystemCheckIns(summaryData.totalCheckIns);
        }
      } else {
        console.log("Failed to load Gm summary data from summary.json:", response.status);
      }

      const compatResponse = await fetch(`/checkin_stats.json?${cacheKey}`, { cache: "no-store" }); //
      if (compatResponse.ok) {
        const compatData = await compatResponse.json();
        if (compatData.stats && compatData.stats.totalCheckIns) {
          // Utamakan data dari checkin_stats.json jika lebih besar atau summary.json gagal
          if (compatData.stats.totalCheckIns > summaryTotalCheckIns) {
            setTotalSystemCheckIns(compatData.stats.totalCheckIns);
            summaryTotalCheckIns = compatData.stats.totalCheckIns;
          }
        }
      } else {
         console.log("Failed to load Gm summary data from checkin_stats.json:", compatResponse.status);
      }
      // Update local storage pengguna jika total sistem lebih besar
      if (signer && summaryTotalCheckIns > 0) {
        const userAddress = await signer.getAddress();
        const localTotal = parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;
        if (localTotal < summaryTotalCheckIns) { // Ini seharusnya tidak terjadi jika update dari server sudah benar
            // localStorage.setItem(`totalCheckIns_${userAddress}`, summaryTotalCheckIns.toString());
            // setTotalCheckIns(summaryTotalCheckIns); // Hindari overwrite data check-in individu dengan total sistem
        }
      }
    } catch (error) {
      console.error("Error loading Gm summary data:", error);
    }
  };
  
  const gmToday = async () => { //
    if (!signer) {
      console.error("No connected wallet found for GM.");
      return;
    }
    try {
      const userAddress = await signer.getAddress();
      const todayString = new Date().toDateString();
      const lastCheckInDateString = localStorage.getItem(`lastCheckInDate_${userAddress}`);
      
      let currentStreak = parseInt(localStorage.getItem(`checkInStreak_${userAddress}`)) || 0;
      let currentTotalCheckIns = parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toDateString();

      if (lastCheckInDateString !== todayString) { // Hanya proses jika belum check-in hari ini
        if (lastCheckInDateString === yesterdayString) {
          currentStreak += 1; // Lanjutkan streak
        } else {
          currentStreak = 1; // Reset streak jika melewatkan hari
        }
        currentTotalCheckIns += 1;

        localStorage.setItem(`lastCheckInDate_${userAddress}`, todayString);
        localStorage.setItem(`checkedInToday_${userAddress}`, "true");
        localStorage.setItem(`checkInStreak_${userAddress}`, currentStreak.toString());
        localStorage.setItem(`totalCheckIns_${userAddress}`, currentTotalCheckIns.toString());

        setCheckInStreak(currentStreak);
        setTotalCheckIns(currentTotalCheckIns);
        setCheckedInToday(true);
        // Total system check-ins juga bertambah
        setTotalSystemCheckIns(prev => prev +1);

        // Update myTodayClicks karena check-in juga dianggap klik
        setMyTodayClicks((prev) => {
            const next = prev + 1;
            localStorage.setItem(`myTodayClicks_${userAddress}`, next.toString());
            return next;
        });

        console.log(`GM log saved: streak=${currentStreak}, total=${currentTotalCheckIns}`);
      } else {
          console.log("Already checked in today according to localStorage.");
      }
    } catch (error) {
      console.error("An error occurred while saving GM:", error);
    }
  };

  const renderPendingTxs = () => { //
    const count = pendingTransactions.size;
    return count ? <div className="pending-tx-indicator">{count} pending {count === 1 ? "tx" : "txs"}...</div> : null;
  };

  const totalPages = Math.ceil(leaderboard.length / itemsPerPage); //
  const startIndex = (currentPage - 1) * itemsPerPage; //
  const currentItems = leaderboard.slice(startIndex, startIndex + itemsPerPage); //
  const nextPage = () => currentPage < totalPages && setCurrentPage((p) => p + 1); //
  const prevPage = () => currentPage > 1 && setCurrentPage((p) => p - 1); //

  const addSomniaNetwork = async () => { //
    try {
      if (!window.ethereum) {
        toast.error("Please install MetaMask!");
        return;
      }
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0xc488", //
          chainName: "Somnia Testnet", //
          nativeCurrency: { name: "Somnia Testnet", symbol: "STT", decimals: 18 }, //
          rpcUrls: ["https://dream-rpc.somnia.network"], //
          blockExplorerUrls: ["https://shannon-explorer.somnia.network"], //
        }],
      });
      toast.success("Somnia Testnet added!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add Somnia Testnet");
    }
  };
  
  // Check and Show Check-in Prompt logic
  useEffect(() => { //
    if (!isConnected || !signer || isConnecting || showCheckInModal) return; // Jangan tampilkan jika modal sudah ada atau sedang konek
    
    const check = async () => {
        const hasCheckedIn = await loadUserGmData(); // Ini akan update state checkedInToday
        if (!hasCheckedIn) { // Jika loadUserGmData mengembalikan false (belum checkin menurut server/local)
            const localCheckedIn = localStorage.getItem(`checkedInToday_${await signer.getAddress()}`) === "true";
            if (!localCheckedIn) { // Double check local storage, jika memang belum, tampilkan modal
                 // Cek apakah modal pernah ditampilkan hari ini
                const lastPromptDate = localStorage.getItem(`lastCheckInPromptDate_${await signer.getAddress()}`);
                const todayDateString = new Date().toDateString();
                if (lastPromptDate !== todayDateString) {
                    setShowCheckInModal(true);
                    localStorage.setItem(`lastCheckInPromptDate_${await signer.getAddress()}`, todayDateString);
                }
            } else {
                 setCheckedInToday(true); // Sinkronkan state jika local bilang sudah
            }
        } else {
             setCheckedInToday(true); // Sinkronkan state jika server bilang sudah
        }
    };
    // Beri jeda sebelum memeriksa, untuk memberi waktu loadUserGmData dari auto-connect
    const timer = setTimeout(check, 3000);
    return () => clearTimeout(timer);
  }, [isConnected, signer, isConnecting, showCheckInModal]); // Tambahkan showCheckInModal sebagai dependency

  useEffect(() => { //
    if (checkedInToday) setShowCheckInModal(false);
  }, [checkedInToday]);

  const goToUserRankPage = () => { //
    if (userRank) setCurrentPage(Math.ceil(userRank / itemsPerPage));
  };

  const findUserRankInLeaderboard = () => { //
    if (!signer || !leaderboard.length || !signer.address) return null;
    const index = leaderboard.findIndex((entry) => entry.user.toLowerCase() === signer.address.toLowerCase());
    return index >= 0 ? index + 1 : null;
  };
  
  const renderCheckInModal = () => { //
    if (!showCheckInModal) return null;
    return (
      <div className="modal-overlay">
        <div className="modal-content checkin-modal">
          <div className="modal-header">
            <h2>Daily gSomnia</h2>
            <button className="close-button" onClick={() => setShowCheckInModal(false)}>×</button>
          </div>
          <div className="modal-body">
            <div className="checkin-icon">☀️</div>
            <p>Welcome back! Say gSomnia today to continue your streak!</p>
            <p className="streak-count">Current streak: {checkInStreak} days</p>
          </div>
          <div className="modal-footer">
            <button className="checkin-button" onClick={handleCheckInClick}>Click to gSomnia</button>
          </div>
        </div>
      </div>
    );
  };

  const waitForTransaction = async (tx) => { //
    let retries = 0;
    const maxRetries = 3; // Tingkatkan retries
    const retryDelay = 10000; // Kurangi delay awal
    while (retries < maxRetries) {
      try {
        const receipt = await provider.waitForTransaction(tx.hash, 1, 60000); // Timeout 60 detik untuk provider.waitForTransaction
        if (receipt && receipt.status === 1) return receipt;
        if (receipt && receipt.status !== 1) throw new Error("Transaction failed on-chain");
        // Jika receipt null setelah timeout, akan retry
        throw new Error("Transaction receipt not found after timeout, retrying...");
      } catch (error) {
        retries++;
        console.error(`Transaction wait error (attempt ${retries}/${maxRetries}):`, error);
        if (retries >= maxRetries || (error.message && error.message.includes("Transaction failed on-chain"))) {
          throw error; // Lempar error jika sudah max retries atau gagal permanen
        }
        if (error.message && error.message.includes("HTTP request failed")) {
           console.log(`RPC request failed. Retrying in ${retryDelay * (retries +1) / 1000} seconds...`);
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (retries + 1))); // Exponential backoff sederhana
      }
    }
    throw new Error(`Failed to get transaction receipt after ${maxRetries} attempts`);
  };

  const handleCheckInClick = async () => { //
    if (!isConnected || !contract || !signer) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!(await setupNetwork())) return;
    setShowCheckInModal(false); // Tutup modal segera
    if (!isMuted) {
      clickAudioRef.current.currentTime = 0;
      clickAudioRef.current.play().catch(() => {});
    }
    let txHashForPending;
    try {
      const tx = await contract.click(); // Check-in adalah sebuah klik
      txHashForPending = tx.hash;
      setPendingTransactions((prev) => new Set(prev).add(tx.hash));
      toast.info("gSomnia transaction sent. Waiting for confirmation...");
      const receipt = await waitForTransaction(tx);
      if (receipt.status === 1) {
        await loadBlockchainData(); // Muat ulang data klik
        await gmToday(); // Proses logika GM setelah transaksi berhasil
        toast.success(
          <div>gSomnia recorded! 🌞 Streak: {localStorage.getItem(`checkInStreak_${await signer.getAddress()}`)} days <br />
            <a href={`https://shannon-explorer.somnia.network/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "#FFA500" }}>
              View Transaction
            </a>
          </div>
        );
      } else {
          throw new Error("Transaction failed on-chain.");
      }
    } catch (txError) {
      console.error("Gm error:", txError);
      if (txError.message && txError.message.includes("HTTP request failed")) toast.error("Network connection error. Please try again later.");
      else if (txError.code === "ACTION_REJECTED") toast.error("Gm transaction rejected");
      else if (txError.code === "INSUFFICIENT_FUNDS") toast.error("Not enough STT for gas");
      else toast.error("Gm transaction failed. Please try again.");
    } finally {
        if(txHashForPending) {
            setPendingTransactions((prev) => {
                const next = new Set(prev);
                next.delete(txHashForPending);
                return next;
            });
        }
    }
  };
  
  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="navbar-title">gSomnia Clicks</div>
        <div className="navbar-links">
          {isConnected && signer && (
            <span className="wallet-address text-secondary">
              {signer.address.slice(0, 6)}...{signer.address.slice(-4)}
            </span>
          )}
          <button
            className="connect-button-navbar"
            onClick={isConnected ? handleDisconnect : openWalletSelector}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect Wallet'}
          </button>
          <div className="sound-control-navbar">
            <button
              className="glass-button"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content-area">
        <section className="centered-section stats-panel-centered">
          <div className="stats-header">
            <h2>
              <span>Statistics</span>
              <img src="/clicklogo.png" alt="Stats Logo" width={24} height={24} />
            </h2>
          </div>
          <div className="stats-content">
            <div className="stat-item">
              <span className="text-secondary">Total Somnia Users</span>
              <span className="stat-value text-primary">{totalUsers.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="text-secondary">Total Clicks Collected</span>
              <span className="stat-value text-primary">{totalClicks.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="text-secondary">Total Check-ins Recorded</span>
              <span className="stat-value text-primary">{totalSystemCheckIns.toLocaleString()}</span>
            </div>
            {showFullStats && isConnected && (
              <>
                <div className="stat-item">
                  <span className="text-secondary">Clicks You Made</span>
                  <span className="stat-value text-primary">{myClicks.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                  <span className="text-secondary">Today's Click Count</span>
                  <span className="stat-value text-primary">{myTodayClicks}</span>
                </div>
                <div className="stat-item">
                  <span className="text-secondary">Your Streak</span>
                  <span className="stat-value text-primary">
                    {checkInStreak} days {checkedInToday && "✓"}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="text-secondary">Check-ins You Made</span>
                  <span className="stat-value text-primary">
                    {totalCheckIns > 0 ? totalCheckIns : (checkedInToday ? "1" : "0")}
                  </span>
                </div>
              </>
            )}
          </div>
          {isConnected && (
             <button className="show-more-button" onClick={() => setShowFullStats(!showFullStats)}>
                {showFullStats ? "Show Less" : "Show More Personal Stats"}
             </button>
          )}
           <div className="button-container-below-stats">
              <button className="network-button bottom-btn" onClick={() => window.open("https://testnet.somnia.network/", "_blank")}>
                Explore Somnia Network
              </button>
              <button className="gsomnia-button bottom-btn" onClick={() => window.open("https://quest.somnia.network/", "_blank")}>
                Explore Somnia Quest
              </button>
            </div>
        </section>

        <section className="centered-section click-button-area-centered">
          <div className="click-button-container">
            <button onClick={isConnected ? handleClick : openWalletSelector} className="click-button" disabled={isConnecting || (isConnected && !contract)}>
              {isConnecting && !isConnected ? 'Connecting...' : isConnected ? (contract ? "GSOMNIA" : "Loading Contract...") : "Connect Wallet to Click"}
            </button>
            {renderPendingTxs()}
          </div>
        </section>

        <section className="centered-section leaderboard-panel-centered">
          <div className="leaderboard-header">
            <h2>🏆 Leaderboard</h2>
            {lastLeaderboardUpdate && (
              <div className="last-update text-secondary">
                Snapshot is scheduled for 31-05-25 23:11:58 UTC. 
              </div>
            )}
             { /* Tampilkan rank hanya jika terhubung DAN ada signer */ }
            {isConnected && signer && (
              <div className="user-rank-display">
                <div className="user-rank-position text-primary">
                  #{userRank || findUserRankInLeaderboard() || "N/A"}
                </div>
                <div className="user-rank-clicks text-secondary">
                  {myClicks.toLocaleString()} clicks
                </div>
                {userRank && Math.ceil(userRank / itemsPerPage) !== currentPage && (
                    <button className="go-to-rank-btn small" onClick={goToUserRankPage}>
                      My Rank
                    </button>
                )}
              </div>
            )}
          </div>
          <div className="leaderboard-content">
            <div className="leaderboard-header-columns">
              <div className="rank-header">Rank</div>
              <div className="address-header">Address</div>
              <div className="clicks-header">SomniaClicks</div>
            </div>
            <div className="leaderboard-list">
              {currentItems.map((entry, i) => {
                const idx = startIndex + i;
                const isCurrentUser = signer && entry.user.toLowerCase() === signer?.address?.toLowerCase(); //
                return (
                  <div
                    key={idx + entry.user} // Key lebih unik jika user bisa sama di data yang salah
                    className={["leaderboard-item", idx < 3 ? `top-${idx + 1}` : "", isCurrentUser ? "current-user" : ""].join(" ")}
                  >
                    <div className="rank">#{idx + 1}</div>
                    <div className="address text-secondary">
                      {entry.user.slice(0, 6)}...{entry.user.slice(-4)}
                    </div>
                    <div className="clicks text-primary">
                      {Number(entry.clicks).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
           {totalPages > 1 && (
            <div className="pagination">
                <button className="pagination-btn" onClick={prevPage} disabled={currentPage <= 1}>◀</button>
                <span className="text-secondary">Page {currentPage} of {totalPages}</span>
                <button className="pagination-btn" onClick={nextPage} disabled={currentPage >= totalPages}>▶</button>
            </div>
           )}
        </section>
      </main>

            {/* BAGIAN KOMUNITAS BARU */}
      <section className="community-section">
        <h2 className="community-title">JOIN SOMNIA NETWORK COMMUNITY</h2>
        <div className="social-links-community"> {/* Menggunakan class yang sedikit berbeda untuk menghindari konflik jika .social-links masih ada di tempat lain */}
          <a
            href="https://discord.com/invite/somnia"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
          >
            <SiDiscord />
          </a>
          <a
            href="https://discord.com/invite/somnia"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
          >
            <FaXTwitter />
          </a>
            <a
            href="https://t.me/somnianetwork"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
          >
            <SiTelegram />
          </a>
        </div>
      </section>

      <footer className="footer">
        <p className="text-primary" style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>gSomnia Clicks</p> {/* Baris pertama, bisa ditambahkan style jika perlu */}
        <p className="text-secondary" style={{ fontSize: '0.9rem' }}>Built with 💛 by Somnia Community</p> {/* Baris kedua */}
      </footer>

      {renderCheckInModal()}
      <WalletSelectorModal />
      <ToastContainer position="top-center" theme="dark" newestOnTop />
      <Analytics /> {/* */}
    </div>
  );
}

export default App;