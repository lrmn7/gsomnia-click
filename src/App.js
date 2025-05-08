import React, { useState, useEffect, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import abi from "./ClickCounterABI.json";
import bgMusicFile from "./assets/sounds/sleepless-sinec-03.wav";
import clickSoundFile from "./assets/effects/click.mp3";
import { Analytics } from "@vercel/analytics/react";
import { FaGithub, FaXTwitter } from "react-icons/fa6";

const CONTRACT_ADDRESS = "0xe811f7919844359f022c346516cae450346f5492";
const SOMNIA_CHAIN_ID_HEX = "0xc488"; // Somnia Network (50312)

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
  const itemsPerPage = 50;

  const [myTodayClicks, setMyTodayClicks] = useState(0);

  const [didLoadLB, setDidLoadLB] = useState(false);

  const [lastLeaderboardUpdate, setLastLeaderboardUpdate] = useState(null);

  const [checkedInToday, setCheckedInToday] = useState(false);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [checkInStreak, setCheckInStreak] = useState(0);

  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const [appLoaded, setAppLoaded] = useState(false);

  const [isOnCorrectNetwork, setIsOnCorrectNetwork] = useState(false);

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const [lastTxTime, setLastTxTime] = useState(0);

  const [showWalletModal, setShowWalletModal] = useState(false);

  const detectWallets = () => {
    const wallets = [];

    if (window.ethereum) {
      // MetaMask
      if (window.ethereum.isMetaMask)
        wallets.push({
          name: "MetaMask",
          provider: window.ethereum,
          icon: "🦊",
        });

      // Coinbase
      if (window.ethereum.isCoinbaseWallet)
        wallets.push({
          name: "Coinbase",
          provider: window.ethereum,
          icon: "📱",
        });

      // Trust Wallet
      if (window.ethereum.isTrust)
        wallets.push({ name: "Trust", provider: window.ethereum, icon: "🔒" });

      // Brave
      if (window.ethereum.isBraveWallet)
        wallets.push({ name: "Brave", provider: window.ethereum, icon: "🦁" });

      if (wallets.length === 0) {
        wallets.push({
          name: "Browser Wallet",
          provider: window.ethereum,
          icon: "🌐",
        });
      }
    }

    return wallets;
  };

  const openWalletSelector = () => {
    if (isConnected || isConnecting) return;

    const availableWallets = detectWallets();

    if (availableWallets.length === 0) {
      toast.error(
        "Wallet not found in the browser. Please install MetaMask or another wallet first."
      );
      return;
    }

    if (availableWallets.length === 1) {
      connectWallet();
      return;
    }

    setShowWalletModal(true);
  };

  const handleSelectWallet = (provider) => {
    window.ethereum = provider;
    setShowWalletModal(false);
    connectWallet();
  };

  const WalletSelectorModal = () => {
    if (!showWalletModal) return null;

    const wallets = detectWallets();

    return (
      <div className="modal-overlay">
        <div className="modal-content wallet-modal">
          <div className="modal-header">
            <h2>เลือก Wallet</h2>
            <button
              className="close-button"
              onClick={() => setShowWalletModal(false)}
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="wallet-list">
              {wallets.map((wallet, index) => (
                <button
                  key={index}
                  className="wallet-button"
                  onClick={() => handleSelectWallet(wallet.provider)}
                >
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

  useEffect(() => {
    bgMusicRef.current = new Audio(bgMusicFile);
    bgMusicRef.current.loop = true;
    bgMusicRef.current.muted = isMuted;

    clickAudioRef.current = new Audio(clickSoundFile);

    return () => {
      bgMusicRef.current?.pause();
      clickAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!bgMusicRef.current) return;
    bgMusicRef.current.muted = isMuted;
    if (!isMuted) {
      bgMusicRef.current
        .play()
        .catch((err) => console.log("BGM autoplay blocked:", err));
    }
  }, [isMuted]);

  const loadOffChainLeaderboard = async () => {
    try {
      const res = await fetch("/leaderboard.json");
      if (!res.ok) throw new Error("Failed to fetch leaderboard.json");

      const jsonData = await res.json();

      let leaderboardData = [];
      let lastUpdateTimestamp = null;

      if (jsonData.data && jsonData.lastUpdate) {
        leaderboardData = jsonData.data;
        lastUpdateTimestamp = new Date(jsonData.lastUpdate);
      } else {
        leaderboardData = jsonData;
        lastUpdateTimestamp = null;
      }

      leaderboardData.sort((a, b) => Number(b.clicks) - Number(a.clicks));

      setLeaderboard(leaderboardData);
      setTotalUsers(leaderboardData.length);
      setLastLeaderboardUpdate(lastUpdateTimestamp);

      if (signer) {
        try {
          const addr = await signer.getAddress();
          console.log("Current address:", addr);

          const userIndex = leaderboardData.findIndex(
            (x) => x.user.toLowerCase() === addr.toLowerCase()
          );

          console.log("User index in leaderboard:", userIndex);

          if (userIndex >= 0) {
            const rank = userIndex + 1;
            console.log("Setting user rank to:", rank);
            setUserRank(rank);
          } else {
            console.log("User not found in leaderboard, setting rank to null");
            setUserRank(null);
          }
        } catch (error) {
          console.error("Error finding user rank:", error);
          setUserRank(null);
        }
      } else {
        console.log("No signer available, can't determine user rank");
      }

      console.log("Off-chain leaderboard loaded!");
    } catch (err) {
      console.error(err);
      toast.error("Unable to load offline leaderboard.");
    }
  };

  const setupNetwork = async (forceCheck = false) => {
    if (!window.ethereum) {
      toast.error("Please install MetaMask!");
      return false;
    }

    if (!forceCheck && isOnCorrectNetwork) {
      return true;
    }

    try {
      const currentChainId = await window.ethereum.request({
        method: "eth_chainId",
      });
      if (currentChainId !== SOMNIA_CHAIN_ID_HEX) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SOMNIA_CHAIN_ID_HEX }],
          });
        } catch {
          toast.error("Please switch to Somnia Network manually");
          setIsOnCorrectNetwork(false);
          return false;
        }
      }
      setIsOnCorrectNetwork(true);
      return true;
    } catch {
      toast.error("Network setup failed");
      setIsOnCorrectNetwork(false);
      return false;
    }
  };

  const loadBlockchainData = async () => {
    try {
      const prov = new BrowserProvider(window.ethereum);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 15000)
      );

      try {
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
      } catch (timeoutErr) {
        console.error("Connection timeout or RPC error:", timeoutErr);

        if (
          timeoutErr.message &&
          timeoutErr.message.includes("HTTP request failed")
        ) {
          toast.error("Network connection error. Please try again later.");
        } else {
          toast.error("Connection timeout. Please try again later.");
        }

        return false;
      }
    } catch (err) {
      console.error("Unable to load data:", err);
      toast.error("Unable to load data. Please check your connection.");
      return false;
    }
  };

  const loadUserGmData = async () => {
    try {
      const userAddress = await signer?.getAddress();

      if (!userAddress) {
        setCheckedInToday(false);
        setCheckInStreak(0);
        setTotalCheckIns(0);
        return;
      }

      const checkedInToday = localStorage.getItem(
        `checkedInToday_${userAddress}`
      );
      const lastCheckInDate = localStorage.getItem(
        `lastCheckInDate_${userAddress}`
      );

      const streak =
        parseInt(localStorage.getItem(`checkInStreak_${userAddress}`)) || 0;
      const total =
        parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;

      console.log(
        `Checking GM data for user ${userAddress}: streak=${streak}, total=${total}`
      );

      try {
        const cacheKey = `_t=${Date.now()}`;

        const userPrefix = userAddress.substring(2, 4).toLowerCase();
        const userStatsUrl = `/stats/users/${userPrefix}/${userAddress.toLowerCase()}.json?${cacheKey}`;

        console.log(`Trying to load user stats from: ${userStatsUrl}`);

        const userResponse = await fetch(userStatsUrl, {
          cache: "no-store",
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log("Loaded user stats:", userData);

          if (userData.totalCheckIns) {
            console.log(
              `Found user's totalCheckIns in user file: ${userData.totalCheckIns}`
            );
            localStorage.setItem(
              `totalCheckIns_${userAddress}`,
              userData.totalCheckIns.toString()
            );
            setTotalCheckIns(userData.totalCheckIns);
          } else {
            console.log(
              "No totalCheckIns found in user file, using localStorage"
            );
            setTotalCheckIns(total);
          }

          if (userData.currentStreak) {
            console.log(
              `Found user's currentStreak in user file: ${userData.currentStreak}`
            );
            localStorage.setItem(
              `checkInStreak_${userAddress}`,
              userData.currentStreak.toString()
            );
            setCheckInStreak(userData.currentStreak);
          } else if (userData.maxStreak) {
            console.log(
              `Found user's maxStreak in user file: ${userData.maxStreak}`
            );
            localStorage.setItem(
              `checkInStreak_${userAddress}`,
              userData.maxStreak.toString()
            );
            setCheckInStreak(userData.maxStreak);
          } else {
            console.log(
              "No streak info found in user file, using localStorage"
            );
            setCheckInStreak(streak);
          }

          const serverDate = new Date(userData.lastCheckIn);
          const todayDate = new Date();

          const isSameDay =
            serverDate.getFullYear() === todayDate.getFullYear() &&
            serverDate.getMonth() === todayDate.getMonth() &&
            serverDate.getDate() === todayDate.getDate();

          if (isSameDay) {
            console.log("User has checked in today according to user file");
            localStorage.setItem(`checkedInToday_${userAddress}`, "true");
            setCheckedInToday(true);
            return true;
          } else {
            console.log("User has not checked in today according to user file");
            setCheckedInToday(checkedInToday === "true");
          }

          return checkedInToday === "true";
        } else {
          console.log(
            "Failed to load user stats file, using localStorage values only"
          );
          setCheckedInToday(checkedInToday === "true");
          setCheckInStreak(streak);
          setTotalCheckIns(total);

          return checkedInToday === "true";
        }
      } catch (error) {
        console.error("Error loading user stats:", error);
        setCheckedInToday(checkedInToday === "true");
        setCheckInStreak(streak);
        setTotalCheckIns(total);

        return checkedInToday === "true";
      }
    } catch (error) {
      console.error("Error loading GM data:", error);
      return false;
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // Connect Wallet
  // ───────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (isConnected || isConnecting) {
      console.log("Already connected or connecting, skipping connection");
      return true;
    }

    toast.dismiss();

    setIsConnecting(true);

    try {
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = false;
        setIsMuted(false);
        try {
          await bgMusicRef.current.play();
        } catch {}
      }

      await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!(await setupNetwork())) {
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
      } else {
        console.log("Leaderboard already loaded, checking rank directly");
        if (signer && leaderboard.length > 0) {
          try {
            const addr = await signer.getAddress();
            console.log("Finding rank for address in connectWallet:", addr);

            const userIndex = leaderboard.findIndex(
              (entry) => entry.user.toLowerCase() === addr.toLowerCase()
            );

            console.log("User index in connectWallet:", userIndex);

            if (userIndex >= 0) {
              const rank = userIndex + 1;
              console.log("Setting user rank in connectWallet to:", rank);
              setUserRank(rank);
            } else {
              console.log(
                "User not found in existing leaderboard in connectWallet"
              );
              if (myClicks > 0) {
                console.log("User has clicks, adding to temporary leaderboard");
                const tempLeaderboard = [
                  ...leaderboard,
                  { user: addr, clicks: myClicks },
                ];
                tempLeaderboard.sort(
                  (a, b) => Number(b.clicks) - Number(a.clicks)
                );
                const newIndex = tempLeaderboard.findIndex(
                  (entry) => entry.user.toLowerCase() === addr.toLowerCase()
                );
                setLeaderboard(tempLeaderboard);
                setUserRank(newIndex + 1);
              } else {
                setUserRank(null);
              }
            }
          } catch (error) {
            console.error("Error finding user rank in connectWallet:", error);
          }
        }
      }

      await loadUserGmData();

      toast.success("Connected successfully! 🎉");
      return true;
    } catch (err) {
      if (err.code === 4001) toast.error("Connection rejected by user");
      else toast.error("Connection failed");
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClick = async () => {
    try {
      if (!isConnected) {
        await connectWallet();
        return;
      }

      if (!contract || !signer) {
        toast.error("Please connect your wallet first");
        return;
      }

      if (!(await setupNetwork())) return;

      if (!isMuted) {
        clickAudioRef.current.currentTime = 0;
        clickAudioRef.current.play().catch(() => {});
      }

      const now = Date.now();
      const timeSinceLastTx = now - lastTxTime;
      if (timeSinceLastTx < 300) {
        const waitTime = 300 - timeSinceLastTx;
        toast.info(
          `Please wait ${Math.ceil(waitTime / 1000)} seconds before next click`
        );
        await delay(waitTime);
      }

      setLastTxTime(Date.now());

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
        <div>
          Transaction sent!
          <br />
          <a
            href={`https://shannon-explorer.somnia.network/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4fd1c5" }}
          >
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
      }, 30000);
    } catch (err) {
      console.error("Click error:", err);

      if (err.error && err.error.status === 429) {
        toast.warning(
          "Too many requests. Please wait a moment before clicking again."
        );
        await delay(3000);
      } else if (err.code === "INSUFFICIENT_FUNDS") {
        toast.error("Not enough STT for gas");
      } else if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected by user");
      } else {
        toast.error("An unexpected error occurred");
      }
    }
  };

  useEffect(() => {
    loadTodayClicksFromLocal();
    loadGmSummaryData();

    setAppLoaded(true);

    if (!window.ethereum) {
      loadOffChainLeaderboard();
      setDidLoadLB(true);
      return;
    }

    window.ethereum.request({ method: "eth_accounts" }).then((accs) => {
      if (accs.length > 0 && !isConnecting) {
        setIsConnecting(true);

        setShowCheckInModal(false);

        (async () => {
          try {
            if (bgMusicRef.current) {
              bgMusicRef.current.muted = false;
              setIsMuted(false);
              try {
                await bgMusicRef.current.play();
              } catch {}
            }

            await window.ethereum.request({ method: "eth_requestAccounts" });
            if (!(await setupNetwork())) return;
            if (!(await loadBlockchainData())) return;

            if (!didLoadLB) {
              await loadOffChainLeaderboard();
              setDidLoadLB(true);
            }

            await loadUserGmData();

            console.log("Connected automatically");
          } finally {
            setIsConnecting(false);
          }
        })();
      } else {
        loadOffChainLeaderboard();
        setDidLoadLB(true);
      }
    });

    const handleChainChange = (chainId) => {
      if (chainId !== SOMNIA_CHAIN_ID_HEX) {
        setIsConnected(false);
        setIsOnCorrectNetwork(false);
        toast.error("Please switch to Somnia Network");
      } else {
        setIsOnCorrectNetwork(true);
        loadBlockchainData();
      }
    };

    const handleAccountsChange = async (accounts) => {
      if (accounts.length === 0) {
        setIsConnected(false);
      } else {
        await loadBlockchainData();
      }
    };

    window.ethereum.on("chainChanged", handleChainChange);
    window.ethereum.on("accountsChanged", handleAccountsChange);

    return () => {
      window.ethereum.removeListener("chainChanged", handleChainChange);
      window.ethereum.removeListener("accountsChanged", handleAccountsChange);
    };
  }, []);

  useEffect(() => {
    if (signer) {
      loadUserGmData();
      loadTodayClicksFromLocal();
    } else {
      setCheckedInToday(false);
      setCheckInStreak(0);
      setTotalCheckIns(0);
      setMyTodayClicks(0);
    }
  }, [signer]);

  const loadTodayClicksFromLocal = async () => {
    try {
      const today = new Date().toDateString();

      if (signer) {
        const userAddress = await signer.getAddress();
        const storedDate = localStorage.getItem(`clickDate_${userAddress}`);
        const storedValue = localStorage.getItem(
          `myTodayClicks_${userAddress}`
        );

        if (storedDate === today && storedValue) {
          setMyTodayClicks(Number(storedValue));
        } else {
          localStorage.setItem(`clickDate_${userAddress}`, today);
          localStorage.setItem(`myTodayClicks_${userAddress}`, "0");
          setMyTodayClicks(0);
        }
      } else {
        setMyTodayClicks(0);
      }
    } catch (err) {
      console.error("Error loading today's clicks:", err);
      setMyTodayClicks(0);
    }
  };

  const loadGmSummaryData = async () => {
    try {
      const cacheKey = `_t=${Date.now()}`;
      const response = await fetch(`/stats/summary.json?${cacheKey}`, {
        cache: "no-store",
      });

      if (response.ok) {
        const summaryData = await response.json();
        console.log("Loaded Gm summary data:", summaryData);
        if (summaryData.totalCheckIns) {
          setTotalSystemCheckIns(summaryData.totalCheckIns);
        }

        if (summaryData.checkInsToday >= 0) {
          console.log(
            `Setting checkInsToday from server: ${summaryData.checkInsToday}`
          );
        }

        const userAddress = await signer?.getAddress();
        if (userAddress) {
          const localTotal =
            parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;

          if (summaryData.totalCheckIns < summaryData.checkInsToday) {
            console.log(
              `Warning: Server totalCheckIns (${summaryData.totalCheckIns}) is less than checkInsToday (${summaryData.checkInsToday})`
            );
          }

          if (localTotal < summaryData.totalCheckIns) {
            console.log(
              `Updating user totalCheckIns from ${localTotal} to ${summaryData.totalCheckIns}`
            );
            localStorage.setItem(
              `totalCheckIns_${userAddress}`,
              summaryData.totalCheckIns.toString()
            );
            setTotalCheckIns(summaryData.totalCheckIns);
          }
        }

        if (summaryData.maxStreak && userAddress) {
          const localStreak =
            parseInt(localStorage.getItem(`checkInStreak_${userAddress}`)) || 0;
          console.log(
            `Streak info: local=${localStreak}, server max=${summaryData.maxStreak}`
          );
        }
      } else {
        console.log("Failed to load Gm summary data:", response.status);
      }
      try {
        const compatResponse = await fetch(`/checkin_stats.json?${cacheKey}`, {
          cache: "no-store",
        });

        if (compatResponse.ok) {
          const compatData = await compatResponse.json();
          console.log("Loaded compat checkin_stats.json data:", compatData);

          if (compatData.stats) {
            const { totalCheckIns, checkInsToday } = compatData.stats;

            if (totalCheckIns) {
              setTotalSystemCheckIns(totalCheckIns);
              console.log(
                `Updated totalSystemCheckIns from compat file: ${totalCheckIns}`
              );
            }

            if (checkInsToday >= 0) {
              console.log(
                `Setting checkInsToday from compat file: ${checkInsToday}`
              );
            }

            const userAddress = await signer?.getAddress();
            if (userAddress && totalCheckIns) {
              const localTotal =
                parseInt(
                  localStorage.getItem(`totalCheckIns_${userAddress}`)
                ) || 0;
              if (localTotal < totalCheckIns) {
                console.log(
                  `Updating user totalCheckIns from ${localTotal} to ${totalCheckIns} (compat)`
                );
                localStorage.setItem(
                  `totalCheckIns_${userAddress}`,
                  totalCheckIns.toString()
                );
                setTotalCheckIns(totalCheckIns);
              }
            }
          }
        }
      } catch (compatError) {
        console.error("Error loading compat checkin_stats.json:", compatError);
      }
    } catch (error) {
      console.error("Error loading Gm summary data:", error);
    }
  };

  const gmToday = async () => {
    try {
      if (!signer) {
        console.error("No connected wallet found.");
        return;
      }

      const userAddress = await signer.getAddress();
      const today = new Date().toDateString();
      const todayISO = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      localStorage.setItem(`checkedInToday_${userAddress}`, "true");
      localStorage.setItem(`lastCheckInDate_${userAddress}`, today);

      let newStreak = checkInStreak;
      const lastDate = localStorage.getItem(`lastCheckInDate_${userAddress}`);

      if (lastDate !== today) {
        newStreak += 1;
      }

      localStorage.setItem(
        `checkInStreak_${userAddress}`,
        newStreak.toString()
      );
      setCheckInStreak(newStreak);

      let newTotal = totalCheckIns;

      if (!newTotal || newTotal <= 0) {
        newTotal = 1;
        console.log(`Setting initial totalCheckIns to 1`);
      } else {
        if (lastDate !== today) {
          newTotal += 1;
          console.log(`Incrementing totalCheckIns to ${newTotal}`);
        } else {
          console.log(`Not incrementing totalCheckIns, already clicked today`);
        }
      }

      localStorage.setItem(`totalCheckIns_${userAddress}`, newTotal.toString());
      setTotalCheckIns(newTotal);

      setCheckedInToday(true);

      setMyTodayClicks((prev) => prev + 1);

      console.log(
        `GM log saved successfully.: streak=${newStreak}, total=${newTotal}`
      );
    } catch (error) {
      console.error("An error occurred while saving GM:", error);
    }
  };

  const renderPendingTxs = () => {
    const count = pendingTransactions.size;
    return count ? (
      <div className="pending-tx-indicator" key={count}>
        {count} pending {count === 1 ? "transaction" : "transactions"}...
      </div>
    ) : null;
  };

  const totalPages = Math.ceil(leaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = leaderboard.slice(startIndex, startIndex + itemsPerPage);

  const nextPage = () =>
    currentPage < totalPages && setCurrentPage((p) => p + 1);
  const prevPage = () => currentPage > 1 && setCurrentPage((p) => p - 1);

  const addSomniaNetwork = async () => {
    try {
      if (!window.ethereum) {
        toast.error("Please install MetaMask!");
        return;
      }
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xc488",
            chainName: "Somnia Testnet",
            nativeCurrency: {
              name: "Somnia Testnet",
              symbol: "STT",
              decimals: 18,
            },
            rpcUrls: ["https://dream-rpc.somnia.network"],
            blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
          },
        ],
      });
      toast.success("Somnia Testnet added!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add Somnia Testnet");
    }
  };

  const checkAndShowCheckInPrompt = async () => {
    setShowCheckInModal(false);

    if (!isConnected || !signer) return;

    try {
      const hasCheckedIn = await loadUserGmData();

      if (!hasCheckedIn && !checkedInToday) {
        setShowCheckInModal(true);
      }
    } catch (err) {
      console.error("Error in checkAndShowCheckInPrompt:", err);
    }
  };

  useEffect(() => {
    setShowCheckInModal(false);

    if (!isConnected || !signer || isConnecting) return;

    console.log("Preparing to check GM status...");

    let isMounted = true;

    const timer = setTimeout(async () => {
      console.log("Starting to check GM status...");

      try {
        const hasCheckedIn = await loadUserGmData();
        console.log(
          "Check result for hasCheckedIn:",
          hasCheckedIn,
          "checkedInToday:",
          checkedInToday
        );

        if (!isMounted) return;

        if (!hasCheckedIn && !checkedInToday) {
          console.log("Not GM today yet, will display GM window");
          setShowCheckInModal(true);
        } else {
          console.log(
            "Already GM today or data is incorrect, window will not be displayed."
          );
          setShowCheckInModal(false);
        }
      } catch (err) {
        if (!isMounted) return;

        console.error("An error occurred while checking GM:", err);
        setShowCheckInModal(false);
      }
    }, 2000);

    return () => {
      console.log("GM check cancelled.");
      clearTimeout(timer);
      isMounted = false;
    };
  }, [isConnected, signer, isConnecting]);

  useEffect(() => {
    if (checkedInToday) {
      setShowCheckInModal(false);
    }
  }, [checkedInToday]);

  useEffect(() => {
    console.log("Current userRank state:", userRank);
  }, [userRank]);

  const goToUserRankPage = () => {
    if (userRank) {
      const page = Math.ceil(userRank / itemsPerPage);
      setCurrentPage(page);
    }
  };

  const findUserRankInLeaderboard = () => {
    try {
      if (!signer || !leaderboard.length) return null;

      const userAddress = signer.address;
      if (!userAddress) return null;

      const index = leaderboard.findIndex(
        (entry) => entry.user.toLowerCase() === userAddress.toLowerCase()
      );

      if (index >= 0) {
        return index + 1;
      }

      return null;
    } catch (error) {
      console.error("Error finding rank in leaderboard:", error);
      return null;
    }
  };

  const renderUserRank = () => {
    let displayRank = userRank;

    if (isConnected && signer) {
      try {
        if (!displayRank && leaderboard.length > 0) {
          const userAddress = signer.address;
          if (userAddress) {
            const index = leaderboard.findIndex(
              (entry) => entry.user.toLowerCase() === userAddress.toLowerCase()
            );
            if (index >= 0) {
              displayRank = index + 1;

              if (displayRank !== userRank) {
                console.log(`Setting rank from renderUserRank: ${displayRank}`);
                setUserRank(displayRank);
              }
            }
          }
        }

        if (displayRank) {
          const userPage = Math.ceil(displayRank / itemsPerPage);

          if (userPage !== currentPage && displayRank) {
            console.log(
              `User is on page ${userPage}, current page is ${currentPage}`
            );
          }
        }
      } catch (error) {
        console.error("Error in renderUserRank:", error);
      }
    }

    return (
      <div className="user-rank-footer">
        <div className="user-rank-card">
          <div className="user-rank-title">Your Rank</div>
          <div className="user-rank-position">
            {displayRank ? `#${displayRank}` : "#--"}
          </div>
          <div className="user-rank-clicks">
            {myClicks.toLocaleString()} clicks
          </div>
          {displayRank &&
            Math.ceil(displayRank / itemsPerPage) !== currentPage && (
              <button className="go-to-rank-btn" onClick={goToUserRankPage}>
                Go to my rank
              </button>
            )}
        </div>
      </div>
    );
  };

  const renderCheckInModal = () => {
    if (!showCheckInModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-content checkin-modal">
          <div className="modal-header">
            <h2>Daily gSomnia</h2>
            <button
              className="close-button"
              onClick={() => setShowCheckInModal(false)}
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="checkin-icon">✓</div>
            <p>Welcome back! Say gSomnia today to continue your streak!</p>
            <p className="streak-count">Current streak: {checkInStreak} days</p>
          </div>
          <div className="modal-footer">
            <button className="checkin-button" onClick={handleCheckInClick}>
              Click to gSomnia
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleCheckInClick = async () => {
    try {
      setShowCheckInModal(false);

      if (!isConnected || !contract || !signer) {
        toast.error("Please connect your wallet first");
        return;
      }

      if (!(await setupNetwork())) return;

      if (!isMuted) {
        clickAudioRef.current.currentTime = 0;
        clickAudioRef.current.play().catch(() => {});
      }

      const tx = await contract.click();
      setPendingTransactions((prev) => new Set(prev).add(tx.hash));
      toast.info("Gm transaction sent. Waiting for confirmation...");

      const receipt = await waitForTransaction(tx);

      if (receipt.status === 1) {
        await loadBlockchainData();

        await gmToday();

        toast.success(
          <div>
            gSomnia recorded! 🌞 Streak: {checkInStreak + 1} days
            <br />
            <a
              href={`https://shannon-explorer.somnia.network/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#4fd1c5" }}
            >
              View Transaction
            </a>
          </div>
        );

        const userAddress = await signer.getAddress();
        setMyTodayClicks((prev) => {
          const next = prev + 1;
          localStorage.setItem(`myTodayClicks_${userAddress}`, next.toString());
          return next;
        });
      }

      setPendingTransactions((prev) => {
        const next = new Set(prev);
        next.delete(tx.hash);
        return next;
      });
    } catch (txError) {
      console.error("Gm error:", txError);

      setPendingTransactions((prev) => {
        const next = new Set(prev);
        if (txError.hash) next.delete(txError.hash);
        return next;
      });

      if (txError.message && txError.message.includes("HTTP request failed")) {
        toast.error("Network connection error. Please try again later.");
      } else if (txError.code === "ACTION_REJECTED") {
        toast.error("Gm transaction rejected");
      } else if (txError.code === "INSUFFICIENT_FUNDS") {
        toast.error("Not enough STT for gas");
      } else {
        toast.error("Gm transaction failed. Please try again.");
      }
    }
  };

  const waitForTransaction = async (tx) => {
    let retries = 0;
    const maxRetries = 2;
    const retryDelay = 15000;

    while (retries < maxRetries) {
      try {
        const receipt = await tx.wait();
        return receipt;
      } catch (error) {
        retries++;
        console.error(
          `Transaction wait error (attempt ${retries}/${maxRetries}):`,
          error
        );

        if (error.message && error.message.includes("HTTP request failed")) {
          console.log(
            `RPC request failed. Retrying in ${retryDelay / 1000} seconds...`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      `Failed to get transaction receipt after ${maxRetries} attempts`
    );
  };

  return (
    <div className="app-container">
      <div className="sound-control">
        <button
          className="glass-button icon-button"
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* Left Stats Panel */}
      <div className="container-wrapper">
        <div className="stats-panel glass-panel">
          <div className="stats-header">
            <h2 className="flex items-center space-x-2">
              <span className="text-white text-sm font-semibold">
                gSomnia Click
              </span>
              <img
                src="/clicklogo.png"
                alt="Stats Logo"
                width={24}
                height={24}
              />
            </h2>
          </div>

          <div className="stats-content">
            <div className="stat-item">
              <span>Total Somnia Users</span>
              <span className="stat-value">{totalUsers.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span>Total gSomnia Clicks</span>
              <span className="stat-value">{totalClicks.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span>Total gSomnia</span>
              <span className="stat-value">
                {totalSystemCheckIns.toLocaleString()}
              </span>
            </div>

            {showFullStats && (
              <>
                <div className="stat-item">
                  <span>Your gSomnia Clicks</span>
                  <span className="stat-value">
                    {myClicks.toLocaleString()}
                  </span>
                </div>
                <div className="stat-item">
                  <span>Today's gSomnia Clicks</span>
                  <span className="stat-value">{myTodayClicks}</span>
                </div>
                <div className="stat-item">
                  <span>gSomnia Streak</span>
                  <span className="stat-value">
                    {checkInStreak} days {checkedInToday && "✓"}
                  </span>
                </div>
                <div className="stat-item">
                  <span>Your gSomnia</span>
                  <span
                    className="stat-value"
                    title={`Last updated: ${new Date().toLocaleString()}`}
                  >
                    {totalCheckIns > 0
                      ? totalCheckIns
                      : checkedInToday
                      ? "1"
                      : "0"}
                  </span>
                </div>
              </>
            )}
          </div>

          <button
            className="show-more-button"
            onClick={() => setShowFullStats(!showFullStats)}
          >
            {showFullStats ? "Show Less" : "Show More"}
          </button>
        </div>

        {/* Button Container Below Stats Panel */}
        <div className="button-container-below-stats">
          <button
            className="network-button bottom-btn"
            onClick={() =>
              window.open("https://testnet.somnia.network/", "_blank")
            }
          >
            Explore Somnia Network
          </button>
          <button
            className="gsomnia-button bottom-btn"
            onClick={() =>
              window.open("https://quest.somnia.network/", "_blank")
            }
          >
            Explore Somnia Quest
          </button>
        </div>
      </div>

      {/* Center Panel: Click Button */}
      <div className="center-panel">
        <div className="main-content">
          <div className="click-button-container">
            <button
              onClick={isConnected ? handleClick : openWalletSelector}
              className="click-button"
            >
              {isConnected ? "GSOMNIA" : "Connect Wallet"}
            </button>
            {renderPendingTxs()}
          </div>
        </div>
      </div>

      {/* Right Panel: Leaderboard */}
      <div className="right-panel">
        <div className="leaderboard-panel">
          <div className="leaderboard-header">
            <h2>🏆 Leaderboard</h2>
            {lastLeaderboardUpdate && (
              <div className="last-update">
                Snapshot is scheduled for 31-05-25 23:11:58 UTC.
              </div>
            )}
            {isConnected && (
              <div className="user-rank-display">
                <div className="user-rank-position">
                  #{userRank || findUserRankInLeaderboard() || "N/A"}
                </div>
                <div className="user-rank-clicks">
                  {myClicks.toLocaleString()} clicks
                </div>
                {userRank &&
                  Math.ceil(userRank / itemsPerPage) !== currentPage && (
                    <button
                      className="go-to-rank-btn small"
                      onClick={goToUserRankPage}
                    >
                      Go to my rank
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
                const isCurrentUser =
                  entry.user.toLowerCase() === signer?.address?.toLowerCase();
                return (
                  <div
                    key={entry.user}
                    className={[
                      "leaderboard-item",
                      idx < 3 ? `top-${idx + 1}` : "",
                      isCurrentUser ? "current-user" : "",
                    ].join(" ")}
                  >
                    <div className="rank">#{idx + 1}</div>
                    <div className="address">
                      {entry.user.slice(0, 6)}...{entry.user.slice(-4)}
                    </div>
                    <div className="clicks">
                      {Number(entry.clicks).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={prevPage}
              disabled={currentPage <= 1}
            >
              ◀
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="pagination-btn"
              onClick={nextPage}
              disabled={currentPage >= totalPages}
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {renderCheckInModal()}
      <WalletSelectorModal />
      <ToastContainer position="bottom-left" theme="dark" />
      <Analytics />

      {/* Social Links */}
      <div className="social-links">
        <a
          href="https://github.com/lrmn7"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
        >
          <FaGithub />
        </a>
        <a
          href="https://x.com/Somnia_Network"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X (Twitter)"
        >
          <FaXTwitter />
        </a>
      </div>
    </div>
  );
}

export default App;
