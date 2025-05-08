// updateLeaderboard.js
const fs = require("fs");
const { ethers } = require("ethers");
const abi = require("./src/ClickCounterABI.json");
const path = require("path");

const CONFIG = {
  // API settings
  RPC_URL: "https://dream-rpc.somnia.network",
  CONTRACT_ADDRESS: "0xe811f7919844359f022c346516cae450346f5492",
  MAX_RETRIES: 20,
  TIMEOUT_MS: 15000,
  MAX_BACKOFF_MS: 30000,

  // File settings
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB

  // Directory paths
  DAILY_STATS_DIR: "public/stats/daily",
  SUMMARY_PATH: "public/stats/summary.json",
  COMPAT_PATH: "public/checkin_stats.json",
  USER_STATS_DIR: "public/stats/users",

  // Limits
  MAX_STREAK_DAYS: 30,
  MAX_DAYS_IN_MONTH: 31,
  CONSECUTIVE_DAY_THRESHOLD: 1,
  LARGE_DIFF_THRESHOLD: 10,

  // Log levels
  LOG_LEVEL: 0 // 0=minimal, 1=errors+changes, 2=verbose
};

// Set RPC endpoint along with your API key
const RPC_URL = CONFIG.RPC_URL;
const CONTRACT_ADDRESS = CONFIG.CONTRACT_ADDRESS;

const LOG_LEVEL = CONFIG.LOG_LEVEL;

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(message, level = 1) {
  if (level <= LOG_LEVEL) {
    console.log(message);
  }
}

async function fetchLeaderboardWithRetry(maxRetries = 20) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  let retries = 0;

  const fetchWithTimeout = async (timeoutMs = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const [addressArray, clicksArray] = await contract.getLeaderboard();
      clearTimeout(timeoutId);
      return { addressArray, clicksArray };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  while (retries < maxRetries) {
    try {
      return await fetchWithTimeout(15000);
    } catch (error) {
      const isTimeout = error.name === 'AbortError' || error.code === 'ETIMEDOUT';
      const errorMessage = isTimeout
        ? `API request timed out: Attempt ${retries + 1}`
        : `Error fetching getLeaderboard(): Attempt ${retries + 1} ${error}`;

      console.error(errorMessage);
      retries++;

      const waitTime = Math.min(1000 * Math.pow(1.5, retries), 30000);
      console.log(`Retrying in ${waitTime / 1000} seconds...`);
      await delay(waitTime);
    }
  }
  throw new Error(`Unable to fetch leaderboard data after ${maxRetries} attempts`);
}


const fileCache = new Map();

function readJSONFile(filePath, defaultValue) {
  if (fileCache.has(filePath)) {
    return JSON.parse(JSON.stringify(fileCache.get(filePath)));
  }

  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > CONFIG.MAX_FILE_SIZE) {
        console.error(`File ${filePath} is too large (${stats.size} bytes). Max size: ${CONFIG.MAX_FILE_SIZE} bytes`);
        return defaultValue;
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsedData = JSON.parse(data);
        fileCache.set(filePath, parsedData);
        return parsedData;
      } catch (parseError) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError);
        return defaultValue;
      }
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
  return defaultValue;
}

function readAllDailyStats() {
  const dailyStatsDir = CONFIG.DAILY_STATS_DIR;
  let dailyFilesData = {};
  let dailyFiles = [];

  if (fs.existsSync(dailyStatsDir)) {
    dailyFiles = fs.readdirSync(dailyStatsDir)
      .filter(file => file.endsWith('.json'))
      .sort();

    console.log(`Found ${dailyFiles.length} daily stat files in ${dailyStatsDir}`);

    for (const file of dailyFiles) {
      try {
        const fileData = fs.readFileSync(`${dailyStatsDir}/${file}`, 'utf-8');
        const parsedData = JSON.parse(fileData);
        dailyFilesData[file] = parsedData;
        console.log(`Read ${file}: ${parsedData.count} check-ins`);
      } catch (err) {
        console.error(`Error reading daily file ${file}:`, err);
        dailyFilesData[file] = { count: 0, users: {} };
      }
    }
  } else {
    console.log(`Daily stats directory ${dailyStatsDir} does not exist, creating it`);
    ensureDirectoryExists(dailyStatsDir);
  }

  return { dailyFilesData, dailyFiles };
}

function calculateTotalCheckIns(dailyFilesData) {
  let totalCheckIns = 0;
  let individualCounts = {};
  let todayDate = new Date().toISOString().split('T')[0];
  let todayFile = todayDate + '.json';
  let checkInsToday = 0;

  console.log(`Calculating total check-ins from ${Object.keys(dailyFilesData).length} daily files`);

  for (const file in dailyFilesData) {
    try {
      const fileCount = dailyFilesData[file].count || 0;
      const userCount = Object.keys(dailyFilesData[file].users || {}).length;

      if (file === todayFile) {
        checkInsToday = Math.max(fileCount, userCount);
        console.log(`Today's check-ins (${file}): ${checkInsToday}`);
      }

      if (fileCount !== userCount) {
        console.warn(`Warning: File ${file} has inconsistent data: count=${fileCount}, users=${userCount}`);
        const actualCount = Math.max(fileCount, userCount);
        individualCounts[file] = actualCount;
        totalCheckIns += actualCount;
      } else {
        individualCounts[file] = fileCount;
        totalCheckIns += fileCount;
      }

      console.log(`Counting check-ins from ${file}: ${individualCounts[file]} (running total: ${totalCheckIns})`);
    } catch (err) {
      console.error(`Error processing daily file ${file}:`, err);
    }
  }

  const total = Object.values(individualCounts).reduce((sum, count) => sum + count, 0);
  if (total !== totalCheckIns) {
    console.error(`Error in total calculation: sum=${total}, totalCheckIns=${totalCheckIns}`);
    totalCheckIns = total;
  }

  if (checkInsToday > 0 && totalCheckIns < checkInsToday) {
    console.error(`Error: totalCheckIns (${totalCheckIns}) is less than checkInsToday (${checkInsToday})`);
    console.log(`Correcting totalCheckIns to match at least checkInsToday (${checkInsToday})`);
    totalCheckIns = checkInsToday;
  }

  console.log(`Total accumulated check-ins from all days: ${totalCheckIns}`);
  return totalCheckIns;
}

function updateUserStreak(userAddress, todayStats, dailyFilesData, today) {
  if (!todayStats.users[userAddress]) return { maxStreak: 0 };

  const userPrefix = userAddress.substring(2, 4);
  const userStreakPath = `${CONFIG.USER_STATS_DIR}/${userPrefix}/${userAddress}.json`;

  ensureDirectoryExists(path.dirname(userStreakPath));

  let userStreak = readJSONFile(userStreakPath, {
    currentStreak: 0,
    maxStreak: 0,
    lastCheckIn: null,
    totalCheckIns: 0,
    months: {}
  });

  let userTotalCheckIns = 0;
  let userCheckInMonths = {};
  let userRealStreak = 0;
  let lastCheckInDate = null;


  for (const file in dailyFilesData) {
    try {
      const dateStr = file.replace('.json', '');
      const [checkInYear, checkInMonth, checkInDay] = dateStr.split('-');
      const checkInYearMonth = `${checkInYear}-${checkInMonth}`;

      const dailyData = dailyFilesData[file];
      if (dailyData.users && dailyData.users[userAddress]) {
        userTotalCheckIns++;

        if (!userCheckInMonths[checkInYearMonth]) {
          userCheckInMonths[checkInYearMonth] = 0;
        }
        userCheckInMonths[checkInYearMonth]++;

        const currentDate = new Date(dateStr);
        if (lastCheckInDate === null) {
          userRealStreak = 1;
        } else {
          const diffTime = Math.abs(currentDate - lastCheckInDate);
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            userRealStreak++;
          } else if (diffDays > 1) {
            userRealStreak = 1;
          }
        }

        lastCheckInDate = currentDate;
      }
    } catch (err) {
      console.error(`Error processing daily file for user ${userAddress}:`, err);
    }
  }

  let hasChanges = false;

  if (userStreak.totalCheckIns !== userTotalCheckIns) {
    log(`User ${userAddress}: correcting check-ins from ${userStreak.totalCheckIns} to ${userTotalCheckIns}`, 1);
    userStreak.totalCheckIns = userTotalCheckIns;
    hasChanges = true;
  }

  if (userStreak.maxStreak > userTotalCheckIns || userStreak.maxStreak > CONFIG.MAX_STREAK_DAYS) {
    log(`User ${userAddress}: correcting max streak from ${userStreak.maxStreak} to ${userRealStreak}`, 1);
    userStreak.maxStreak = userRealStreak;
    hasChanges = true;
  }

  if (userStreak.currentStreak > userTotalCheckIns) {
    log(`User ${userAddress}: correcting current streak from ${userStreak.currentStreak} to ${userRealStreak}`, 1);
    userStreak.currentStreak = userRealStreak;
    hasChanges = true;
  }

  if (userStreak.months && Object.keys(userStreak.months).length > 0) {
    for (const month in userStreak.months) {
      if (userStreak.months[month] > CONFIG.MAX_DAYS_IN_MONTH) {
        log(`User ${userAddress}: correcting month ${month} from ${userStreak.months[month]} to ${userCheckInMonths[month] || 0}`, 1);
        if (userCheckInMonths[month]) {
          userStreak.months[month] = userCheckInMonths[month];
        } else {
          delete userStreak.months[month];
        }
        hasChanges = true;
      }
    }
  }

  userStreak.months = userCheckInMonths;

  userStreak.lastCheckIn = today;

  if (userStreak.currentStreak !== userRealStreak) {
    log(`User ${userAddress}: updating current streak from ${userStreak.currentStreak} to ${userRealStreak}`, 1);
    userStreak.currentStreak = userRealStreak;
    hasChanges = true;
  }

  if (userRealStreak > userStreak.maxStreak) {
    userStreak.maxStreak = userRealStreak;
    hasChanges = true;
  }

  safeWriteJSONFile(userStreakPath, userStreak);

  return { maxStreak: userStreak.maxStreak };
}


function updateCheckInStats(currentData, previousData) {
  const today = new Date().toISOString().split('T')[0];
  const [currentYear, currentMonth] = today.split('-');
  const currentYearMonth = `${currentYear}-${currentMonth}`;

  if (!previousData || !previousData.data) {
    log("No previous data to compare, skipping check-in calculation");
    return {
      checkInsToday: 0,
      totalCheckIns: 0,
      maxStreak: 0
    };
  }

  const { dailyFilesData, dailyFiles } = readAllDailyStats();

  const dailyStatsPath = `${CONFIG.DAILY_STATS_DIR}/${today}.json`;
  ensureDirectoryExists(path.dirname(dailyStatsPath));
  let todayStats = readJSONFile(dailyStatsPath, { count: 0, users: {} });
  todayStats.count = 0;
  const prevUserMap = {};
  previousData.data.forEach(entry => {
    prevUserMap[entry.user.toLowerCase()] = Number(entry.clicks);
  });
  let newCheckInsToday = 0;
  const now = new Date();
  const todayUTC = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayUTC = yesterday.toISOString().split('T')[0];


  const yesterdayStatsPath = `${CONFIG.DAILY_STATS_DIR}/${yesterdayUTC}.json`;
  let yesterdayStats = { count: 0, users: {} };
  if (fs.existsSync(yesterdayStatsPath)) {
    try {
      yesterdayStats = JSON.parse(fs.readFileSync(yesterdayStatsPath, 'utf-8'));
    } catch (err) {
      console.error(`Error reading yesterday's stats:`, err);
    }
  }


  let updatedUsers = 0;
  let newUsers = 0;


  currentData.forEach(entry => {
    const userAddress = entry.user.toLowerCase();
    const prevClicks = prevUserMap[userAddress] || 0;
    const currentClicks = Number(entry.clicks);


    log(`User ${userAddress}: previous=${prevClicks}, current=${currentClicks}`, 2);


    if (currentClicks > 0) {

      const hasIncreased = currentClicks > prevClicks;
      const clicksIncreased = currentClicks - prevClicks;


      if (hasIncreased) {

        if (!todayStats.users[userAddress]) {
          todayStats.users[userAddress] = true;
          newCheckInsToday++;

          if (prevClicks === 0) {
            newUsers++;
            log(`New user: ${userAddress} checked in with ${currentClicks} clicks`, 1);
          } else {
            updatedUsers++;
            log(`User ${userAddress} auto-checked-in today: ${prevClicks} -> ${currentClicks} (+${clicksIncreased} clicks)`, 1);
          }
        } else {
          log(`User ${userAddress} already checked-in today, added more clicks: ${prevClicks} -> ${currentClicks} (+${clicksIncreased})`, 2);
        }
      } else {
        log(`User ${userAddress} has not increased clicks: ${prevClicks} = ${currentClicks}, no check-in recorded`, 2);
      }


      if (!yesterdayStats.users[userAddress] && clicksIncreased > 5) {

        if (!todayStats.users[userAddress]) {
          todayStats.users[userAddress] = true;
          log(`User ${userAddress} assigned to today with ${currentClicks} clicks (large increase of ${clicksIncreased})`, 1);
        }

        else {
          yesterdayStats.users[userAddress] = true;
          log(`User ${userAddress} additionally assigned to yesterday with significant increase: +${clicksIncreased} clicks`, 1);

          yesterdayStats.count = Object.keys(yesterdayStats.users).length;
          safeWriteJSONFile(yesterdayStatsPath, yesterdayStats);
        }
      }
    }
  });

  todayStats.count = Object.keys(todayStats.users).length;
  safeWriteJSONFile(dailyStatsPath, todayStats);
  console.log(`Daily stats for ${today}: ${todayStats.count} check-ins (from ${Object.keys(todayStats.users).length} users)`);
  log(`Check-ins summary: ${todayStats.count} total (+${newCheckInsToday} new, ${newUsers} first-time users)`);

  if (dailyFilesData[`${today}.json`]) {
    dailyFilesData[`${today}.json`] = { ...todayStats };
    console.log(`Updated cached daily data for ${today} with count = ${todayStats.count}`);
  }

  let maxStreakUpdated = 0;
  let updatedStreaks = 0;

  for (const userAddress in todayStats.users) {
    const result = updateUserStreak(userAddress, todayStats, dailyFilesData, today);
    if (result.maxStreak > maxStreakUpdated) {
      maxStreakUpdated = result.maxStreak;
    }
    updatedStreaks++;
  }

  log(`Updated streaks for ${updatedStreaks} users`);

  const summaryPath = CONFIG.SUMMARY_PATH;
  let summaryStats = readJSONFile(summaryPath, {
    lastUpdate: new Date().toISOString(),
    totalUsers: 0,
    checkInsToday: 0,
    totalCheckIns: 0,
    maxStreak: 0,
    lastSevenDays: {}
  });

  summaryStats.totalUsers = currentData.length;


  summaryStats.checkInsToday = todayStats.count;


  summaryStats.lastUpdate = new Date().toISOString();


  if (maxStreakUpdated > summaryStats.maxStreak) {
    summaryStats.maxStreak = maxStreakUpdated;
  }


  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const dateFile = dateKey + '.json';

    if (!summaryStats.lastSevenDays) {
      summaryStats.lastSevenDays = {};  // Inisialisasi lastSevenDays jika belum ada
    }
    
    if (i === 0) {
      console.log(`Day ${i} (${dateKey}): Using todayStats.count = ${todayStats.count} for consistency`);
      summaryStats.lastSevenDays[dateKey] = todayStats.count;
    }
    

    else if (dailyFilesData[dateFile]) {
      const fileCount = dailyFilesData[dateFile].count || 0;
      const userCount = Object.keys(dailyFilesData[dateFile].users || {}).length;
      const actualCount = Math.max(fileCount, userCount);

      console.log(`Day ${i} (${dateKey}): Found ${actualCount} check-ins in data file`);
      summaryStats.lastSevenDays[dateKey] = actualCount;
    } else {

      console.log(`Day ${i} (${dateKey}): No data file found, setting to 0`);
      summaryStats.lastSevenDays[dateKey] = 0;
    }
  }


  let prevTotalCheckIns = 0;
  if (fs.existsSync(summaryPath)) {
    try {
      const prevSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      prevTotalCheckIns = prevSummary.totalCheckIns || 0;
    } catch (err) {
      console.error("Error reading previous summary:", err);
    }
  }


  const actualTotalCheckIns = calculateTotalCheckIns(dailyFilesData);


  if (prevTotalCheckIns > 0 && Math.abs(prevTotalCheckIns - actualTotalCheckIns) > CONFIG.LARGE_DIFF_THRESHOLD) {
    console.warn(`Warning: Difference in totalCheckIns detected!`);
    console.warn(`Previous value: ${prevTotalCheckIns}, Calculated value: ${actualTotalCheckIns}`);
  }


  console.log(`Setting totalCheckIns to: ${actualTotalCheckIns} (from actual daily stats)`);
  summaryStats.totalCheckIns = actualTotalCheckIns;

  log(`Total check-ins set to ${actualTotalCheckIns} (previously: ${prevTotalCheckIns})`, 1);


  summaryStats.maxStreak = 1;
  log(`Setting maxStreak to 1 per requirement`);


  safeWriteJSONFile(summaryPath, summaryStats);


  const compatPath = CONFIG.COMPAT_PATH;
  const compatData = {
    stats: {
      totalCheckIns: actualTotalCheckIns,
      maxStreak: summaryStats.maxStreak,
      checkInsToday: summaryStats.checkInsToday,
      lastUpdate: summaryStats.lastUpdate
    },
    dailyData: {},
    streaks: {}
  };


  compatData.dailyData[today] = {
    count: todayStats.count,
    users: Object.keys(todayStats.users)
  };

  console.log(`Writing compat data to ${compatPath} with totalCheckIns=${compatData.stats.totalCheckIns}, checkInsToday=${compatData.stats.checkInsToday}`);


  safeWriteJSONFile(compatPath, compatData);

  return {
    checkInsToday: todayStats.count,
    totalCheckIns: summaryStats.totalCheckIns,
    maxStreak: summaryStats.maxStreak
  };
}


function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}


function safeWriteJSONFile(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  try {

    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");


    try {
      const checkData = fs.readFileSync(tempPath, "utf-8");
      JSON.parse(checkData);
    } catch (parseError) {
      throw new Error(`Failed to validate temp file: ${parseError.message}`);
    }


    if (fs.existsSync(filePath)) {

      const backupPath = `${filePath}.bak`;
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch (backupError) {
        console.warn(`Warning: Failed to create backup of ${filePath}: ${backupError.message}`);
      }


      fs.unlinkSync(filePath);
    }


    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}: ${error.message}`);


    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.error(`Error cleaning up temp file ${tempPath}: ${cleanupError.message}`);
      }
    }
    return false;
  }
}

async function main() {
  try {

    const leaderboardFilePath = "public/leaderboard.json";
    const previousData = readJSONFile(leaderboardFilePath, null);


    const { addressArray, clicksArray } = await fetchLeaderboardWithRetry();


    let result = addressArray.map((addr, i) => ({
      user: addr,
      clicks: clicksArray[i].toString()
    }));


    result.sort((a, b) => Number(b.clicks) - Number(a.clicks));


    const today = new Date().toISOString().split('T')[0];
    let previousLastUpdate = null;
    let isNewDay = false;

    if (previousData && previousData.lastUpdate) {
      previousLastUpdate = new Date(previousData.lastUpdate).toISOString().split('T')[0];
      console.log(`Previous update date: ${previousLastUpdate}, Current date: ${today}`);


      if (previousLastUpdate !== today) {
        isNewDay = true;
        console.log(`New day detected! (${previousLastUpdate} -> ${today})`);
        console.log(`Resetting daily check-ins counter and preparing for new day.`);


        const todayStatsPath = `${CONFIG.DAILY_STATS_DIR}/${today}.json`;


        if (!fs.existsSync(todayStatsPath)) {
          console.log(`Creating new daily stats file for ${today}`);
          ensureDirectoryExists(path.dirname(todayStatsPath));
          safeWriteJSONFile(todayStatsPath, { count: 0, users: {} });
        }
      }
    }


    const checkInStats = updateCheckInStats(result, previousData);


    console.log(`Verifying totalCheckIns (${checkInStats.totalCheckIns}) vs checkInsToday (${checkInStats.checkInsToday})`);


    const finalTotalCheckIns = checkInStats.totalCheckIns;
    console.log(`Final totalCheckIns: ${finalTotalCheckIns} (accumulated from all days)`);


    if (isNewDay) {
      console.log(`--- Day Summary (${today}) ---`);
      console.log(`Total users with clicks: ${result.length}`);
      console.log(`New check-ins today: ${checkInStats.checkInsToday}`);
      console.log(`All-time total check-ins: ${finalTotalCheckIns}`);
      console.log(`----------------------------`);
    }


    const leaderboardData = {
      lastUpdate: new Date().toISOString(),
      data: result,
      stats: {
        totalUsers: result.length,
        checkIns: checkInStats
      },
      totalCheckIns: finalTotalCheckIns
    };

    console.log(`Saving leaderboard with ${result.length} users and ${finalTotalCheckIns} total check-ins`);


    safeWriteJSONFile(leaderboardFilePath, leaderboardData);
    console.log("Leaderboard updated. Total =", result.length, "at", leaderboardData.lastUpdate);


    const checkinStatsPath = CONFIG.COMPAT_PATH;
    const checkinStatsData = readJSONFile(checkinStatsPath, null);

    if (checkinStatsData && checkinStatsData.stats) {

      checkinStatsData.stats.totalCheckIns = finalTotalCheckIns;
      console.log(`Re-writing checkin_stats.json with corrected totalCheckIns=${finalTotalCheckIns}`);


      safeWriteJSONFile(checkinStatsPath, checkinStatsData);
    }

    process.exit(0);
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
