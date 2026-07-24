const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_PLAYER_LIMIT = 5;
const RECENT_MATCH_LIMIT = 10;
const ADMIN_TOP_PLAYER_LIMIT = 20;
const ADMIN_RECENT_MATCH_LIMIT = 50;
const PLAYER_WINDOW_DAYS = 7;

function toTimestamp(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function dayKey(value) {
  const timestamp = toTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function recent(value, days, now) {
  const timestamp = toTimestamp(value);
  return !!timestamp && timestamp <= now && now - timestamp < days * DAY_MS;
}

function dateRange(days, now) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const list = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(end.getTime() - index * DAY_MS);
    list.push(date.toISOString().slice(0, 10));
  }
  return list;
}

function matchRecord(document) {
  if (!document || typeof document !== "object") return {};
  return document.record && typeof document.record === "object" ? document.record : document;
}

function matchTime(document, record) {
  return toTimestamp(record.time || document.time || document.updatedAt);
}

function matchKey(document, record, index) {
  if (record.mode === "online") {
    const roomId = String(record.roomId || document.roomId || "").trim();
    const matchId = String(record.matchId || document.matchId || "").trim();
    if (roomId && matchId) return `online:${roomId}:${matchId}`;
  }
  return String(document._id || record.recordKey || `${record.mode || "ai"}:${record.time || document.time || 0}:${index}`);
}

function matchRounds(record) {
  const roundResults = Array.isArray(record.roundResults) ? record.roundResults : [];
  if (roundResults.length) return roundResults.length;
  if (Array.isArray(record.rounds)) return record.rounds.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return 0;
}

function safeText(value, limit = 24) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function displayName(user) {
  const source = user && typeof user === "object" ? user : {};
  const raw = safeText(source.customProfile?.nickName || source.userInfo?.nickName || "", 16);
  if (!raw) return "匿名玩家";
  return raw.length === 1 ? `${raw}*` : `${raw.slice(0, 1)}${"*".repeat(Math.min(3, raw.length - 1))}`;
}

function playerProfile(user) {
  const source = user && typeof user === "object" ? user : {};
  return {
    nickName: safeText(source.customProfile?.nickName || source.userInfo?.nickName || "匿名玩家", 16) || "匿名玩家",
    avatarUrl: safeText(source.customProfile?.avatarUrl || source.userInfo?.avatarUrl || "", 1024)
  };
}

function factionLabel(record, primary) {
  const faction = primary ? record.humanFaction : record.aiFaction;
  const leader = primary ? record.humanLeader : record.aiLeader;
  return safeText(faction || leader || "未知阵营", 10);
}

function difficultyLabel(value) {
  const labels = {
    easy: "简单",
    normal: "普通",
    medium: "普通",
    hard: "困难",
    expert: "专家",
    nightmare: "噩梦"
  };
  const raw = safeText(value, 16);
  return labels[raw.toLowerCase()] || raw || "普通";
}

function deckModeLabel(value) {
  return safeText(value, 20).toLowerCase() === "custom" ? "自定义卡牌" : "随机卡牌";
}

function scoreText(record) {
  const score = Array.isArray(record.rounds) ? record.rounds : [];
  if (score.length >= 2) return `${Math.max(0, Number(score[0]) || 0)}:${Math.max(0, Number(score[1]) || 0)}`;
  return "-";
}

function winnerLabel(record, mode) {
  if (record.winner === 0) return "玩家胜";
  if (record.winner === 1) return mode === "online" ? "对手胜" : "AI 胜";
  return "平局";
}

function outcomeLabel(record, mode) {
  const reason = safeText(record.endReason, 24);
  const winner = winnerLabel(record, mode);
  if (reason === "disconnect") return `掉线 · ${winner}`;
  if (reason === "surrender") return `认输 · ${winner}`;
  return winner;
}

function roundDetails(record) {
  return (Array.isArray(record.roundResults) ? record.roundResults : [])
    .slice(0, 3)
    .map((item, index) => ({
      round: Math.max(1, Number(item?.round) || index + 1),
      scores: Array.isArray(item?.scores) ? item.scores.slice(0, 2).map(value => Math.max(0, Number(value) || 0)) : [0, 0],
      winner: item?.winner == null ? null : Number(item.winner) === 0 ? 0 : 1
    }));
}

function recentMatchItem(document, record, user) {
  const mode = record.mode === "online" ? "online" : "ai";
  const left = factionLabel(record, true);
  const right = factionLabel(record, false);
  return {
    time: matchTime(document, record),
    mode,
    player: playerProfile(user),
    difficulty: mode === "ai" ? difficultyLabel(record.difficulty) : "联机",
    deckMode: deckModeLabel(record.humanDeckMode),
    summary: `${left} vs ${right}`,
    score: scoreText(record),
    rounds: matchRounds(record),
    roundDetails: roundDetails(record),
    morale: Array.isArray(record.morale) ? record.morale.slice(0, 2).map(value => Math.max(0, Number(value) || 0)) : [],
    outcome: outcomeLabel(record, mode)
  };
}

function endReasonLabel(value) {
  const labels = {
    normal: "正常结束",
    surrender: "认输结束",
    disconnect: "掉线结束",
    timeout: "超时结束",
    draw: "平局结束"
  };
  return labels[safeText(value, 24)] || "未知原因";
}

function adminRecentMatchItem(document, record) {
  const mode = record.mode === "online" ? "online" : "ai";
  return {
    time: matchTime(document, record),
    mode,
    winner: record.winner == null ? null : Number(record.winner) === 0 ? 0 : 1,
    difficulty: mode === "ai" ? difficultyLabel(record.difficulty) : "联机",
    humanFaction: safeText(record.humanFaction, 24),
    aiFaction: safeText(record.aiFaction, 24),
    humanLeader: safeText(record.humanLeader, 24),
    aiLeader: safeText(record.aiLeader, 24),
    rounds: Array.isArray(record.rounds)
      ? record.rounds.slice(0, 9).map(value => Math.max(0, Number(value) || 0))
      : matchRounds(record),
    endReason: endReasonLabel(record.endReason)
  };
}

function fullDateRange(firstDate, now) {
  const start = Date.parse(`${firstDate || ""}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return [];
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const dates = [];
  for (let cursor = start; cursor <= end.getTime(); cursor += DAY_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

function isPreferredRecentDocument(candidate, current) {
  if (!current) return true;
  const candidateSource = candidate.document.source === "pvpRoom" ? 1 : 0;
  const currentSource = current.document.source === "pvpRoom" ? 1 : 0;
  if (candidateSource !== currentSource) return candidateSource > currentSource;
  const candidateTime = matchTime(candidate.document, candidate.record);
  const currentTime = matchTime(current.document, current.record);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return String(candidate.document._id || "") < String(current.document._id || "");
}

function rankAnomalyStats(rankMatches = [], usersByOpenid = new Map()) {
  const abnormal = (Array.isArray(rankMatches) ? rankMatches : []).filter(item => ["suspicious", "invalid"].includes(String(item?.validationStatus || "")) || item?.status === "abnormal");
  if (!abnormal.length) return null;
  const flags = {};
  abnormal.forEach(item => {
    const list = Array.isArray(item.riskFlags) && item.riskFlags.length ? item.riskFlags : [item.validationStatus || "UNKNOWN"];
    list.forEach(flag => { flags[flag] = (flags[flag] || 0) + 1; });
  });
  return {
    total: abnormal.length,
    suspicious: abnormal.filter(item => item.validationStatus === "suspicious").length,
    invalid: abnormal.filter(item => item.validationStatus === "invalid").length,
    flags: Object.keys(flags).sort((a, b) => flags[b] - flags[a]).map(flag => ({ flag, count: flags[flag] })),
    recent: abnormal
      .slice()
      .sort((a, b) => (b.finishedAt || b.updatedAt || b.createdAt || 0) - (a.finishedAt || a.updatedAt || a.createdAt || 0))
      .slice(0, 10)
      .map(item => ({
        time: item.finishedAt || item.updatedAt || item.createdAt || 0,
        player: playerProfile(usersByOpenid.get(String(item.openid || ""))),
        tier: safeText(item.tierBefore || item.tierAfter, 12),
        validationStatus: safeText(item.validationStatus, 20),
        riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags.slice(0, 6).map(flag => safeText(flag, 40)) : [],
        settled: item.validationStatus === "valid" && item.status === "finished"
      }))
  };
}

function buildAdminStats({ users = [], matches = [], activities = [], rankMatches = [], now = Date.now(), trendDays = 30 } = {}) {
  const userDayCounts = {};
  const usersByOpenid = new Map();
  const activePlayerOpenids = new Set();
  let active7 = 0;
  let active30 = 0;
  let new7 = 0;
  let new30 = 0;
  let totalLogins = 0;

  users.forEach(user => {
    const openid = String(user?._id || user?.openid || "");
    if (openid) usersByOpenid.set(openid, user);
    const createdDay = dayKey(user && user.createdAt);
    if (createdDay) userDayCounts[createdDay] = (userDayCounts[createdDay] || 0) + 1;
    if (recent(user && user.lastLoginAt, PLAYER_WINDOW_DAYS, now)) {
      active7 += 1;
      if (openid) activePlayerOpenids.add(openid);
    }
    if (recent(user && user.lastLoginAt, 30, now)) active30 += 1;
    if (recent(user && user.createdAt, 7, now)) new7 += 1;
    if (recent(user && user.createdAt, 30, now)) new30 += 1;
    totalLogins += Math.max(0, Number(user && user.loginCount) || 0);
  });

  const activityDayCounts = {};
  const activeDays = new Set(dateRange(PLAYER_WINDOW_DAYS, now));
  activities.forEach(activity => {
    const day = String((activity && activity.day) || dayKey(activity && activity.lastSeenAt) || "");
    if (day) activityDayCounts[day] = (activityDayCounts[day] || 0) + 1;
    const openid = String(activity?.openid || "");
    if (openid && activeDays.has(day)) activePlayerOpenids.add(openid);
  });

  const matchDay = {};
  const byDifficulty = {};
  const byMode = { ai: 0, online: 0 };
  const seenMatches = new Set();
  const recentByGame = new Map();
  const playerStats = new Map();
  const allPlayerStats = new Map();
  const seenPlayerGames = new Set();
  const seenAllPlayerGames = new Set();
  const byEndReason = {};
  let drawTotal = 0;
  let aiTotal = 0;
  let onlineTotal = 0;
  let aiWins = 0;
  let aiDraws = 0;
  let aiDecided = 0;
  let roundTotal = 0;
  let roundCount = 0;

  matches.forEach((document, index) => {
    const record = matchRecord(document);
    if (record.rankedAnomaly) return;
    const mode = record.mode === "online" ? "online" : "ai";
    const onlineTrusted = mode !== "online" || document.source === "pvpRoom";
    if (!onlineTrusted) return;

    const key = matchKey(document, record, index);
    const timestamp = matchTime(document, record);
    const ownerOpenid = String(document._openid || document.openid || "");
    if (ownerOpenid) {
      const playerGameKey = `${ownerOpenid}:${key}`;
      if (!seenAllPlayerGames.has(playerGameKey)) {
        seenAllPlayerGames.add(playerGameKey);
        const current = allPlayerStats.get(ownerOpenid) || { matches: 0, wins: 0, losses: 0, draws: 0, last: 0 };
        current.matches += 1;
        if (record.winner === 0) current.wins += 1;
        else if (record.winner === 1) current.losses += 1;
        else current.draws += 1;
        current.last = Math.max(current.last, timestamp);
        allPlayerStats.set(ownerOpenid, current);
      }
      if (timestamp && recent(timestamp, PLAYER_WINDOW_DAYS, now) && activePlayerOpenids.has(ownerOpenid) && !seenPlayerGames.has(playerGameKey)) {
        seenPlayerGames.add(playerGameKey);
        const current = playerStats.get(ownerOpenid) || { matches: 0, onlineMatches: 0, aiMatches: 0, wins: 0, losses: 0, draws: 0, lastPlayedAt: 0 };
        current.matches += 1;
        if (mode === "online") current.onlineMatches += 1;
        else current.aiMatches += 1;
        if (record.winner === 0) current.wins += 1;
        else if (record.winner === 1) current.losses += 1;
        else current.draws += 1;
        current.lastPlayedAt = Math.max(current.lastPlayedAt, timestamp);
        playerStats.set(ownerOpenid, current);
      }
    }

    const recentEntry = { document, record, key };
    const existingRecent = recentByGame.get(key);
    if (isPreferredRecentDocument(recentEntry, existingRecent)) recentByGame.set(key, recentEntry);

    if (seenMatches.has(key)) return;
    seenMatches.add(key);
    if (record.winner == null) drawTotal += 1;
    const endReason = endReasonLabel(record.endReason);
    byEndReason[endReason] = (byEndReason[endReason] || 0) + 1;

    const day = dayKey(timestamp);
    if (day && !matchDay[day]) matchDay[day] = { total: 0, ai: 0, online: 0, aiWins: 0, aiDecided: 0 };
    if (day) matchDay[day].total += 1;

    const rounds = matchRounds(record);
    if (rounds > 0) {
      roundTotal += rounds;
      roundCount += 1;
    }

    if (mode === "online") {
      onlineTotal += 1;
      byMode.online += 1;
      if (day) matchDay[day].online += 1;
      return;
    }

    aiTotal += 1;
    byMode.ai += 1;
    if (day) matchDay[day].ai += 1;
    const difficulty = safeText(record.difficulty || "未知", 20) || "未知";
    if (!byDifficulty[difficulty]) byDifficulty[difficulty] = { total: 0, aiWins: 0, decided: 0 };
    byDifficulty[difficulty].total += 1;

    if (record.winner === 1) {
      aiWins += 1;
      aiDecided += 1;
      byDifficulty[difficulty].aiWins += 1;
      byDifficulty[difficulty].decided += 1;
      if (day) {
        matchDay[day].aiWins += 1;
        matchDay[day].aiDecided += 1;
      }
    } else if (record.winner === 0) {
      aiDecided += 1;
      byDifficulty[difficulty].decided += 1;
      if (day) matchDay[day].aiDecided += 1;
    } else {
      aiDraws += 1;
    }
  });

  const dates = dateRange(trendDays, now);
  let cumulativeUsers = Math.max(0, users.length - dates.reduce((sum, date) => sum + (userDayCounts[date] || 0), 0));
  const trend = dates.map(date => {
    const newUsers = userDayCounts[date] || 0;
    cumulativeUsers += newUsers;
    const match = matchDay[date] || { total: 0, ai: 0, online: 0, aiWins: 0, aiDecided: 0 };
    return {
      date,
      newUsers,
      activeUsers: activityDayCounts[date] || 0,
      cumulativeUsers,
      total: match.total,
      ai: match.ai,
      online: match.online,
      aiWinRate: match.aiDecided ? Number((match.aiWins * 100 / match.aiDecided).toFixed(1)) : null
    };
  });

  const allDates = fullDateRange(Object.keys(userDayCounts).concat(Object.keys(matchDay)).sort()[0], now);
  let allCumulativeUsers = 0;
  const growth = allDates.map(date => {
    const added = userDayCounts[date] || 0;
    allCumulativeUsers += added;
    return { date, new: added, cumulative: allCumulativeUsers };
  });
  const matchTrend = allDates.map(date => {
    const match = matchDay[date] || { total: 0, ai: 0, online: 0, aiWins: 0, aiDecided: 0 };
    return {
      date,
      total: match.total,
      ai: match.ai,
      online: match.online,
      aiWinRate: match.aiDecided ? Number((match.aiWins * 100 / match.aiDecided).toFixed(1)) : null
    };
  });

  const difficultyStats = Object.keys(byDifficulty).sort().map(difficulty => {
    const value = byDifficulty[difficulty];
    return {
      difficulty,
      total: value.total,
      decided: value.decided,
      aiWins: value.aiWins,
      aiWinRate: value.decided ? Number((value.aiWins * 100 / value.decided).toFixed(1)) : null
    };
  });

  const activeTop = [...playerStats.entries()]
    .map(([openid, stats]) => {
      const decided = stats.wins + stats.losses;
      return {
        player: playerProfile(usersByOpenid.get(openid)),
        ...stats,
        winRate: decided ? Number((stats.wins * 100 / decided).toFixed(1)) : null
      };
    })
    .sort((left, right) => right.matches - left.matches || right.lastPlayedAt - left.lastPlayedAt || left.player.nickName.localeCompare(right.player.nickName))
    .slice(0, TOP_PLAYER_LIMIT);

  const recentItems = [...recentByGame.values()]
    .map(({ document, record }) => {
      const openid = String(document._openid || document.openid || "");
      return recentMatchItem(document, record, usersByOpenid.get(openid));
    })
    .sort((left, right) => right.time - left.time)
    .slice(0, RECENT_MATCH_LIMIT);

  const topPlayers = [...allPlayerStats.entries()]
    .map(([openid, stats]) => ({ alias: displayName(usersByOpenid.get(openid)), ...stats }))
    .sort((left, right) => right.matches - left.matches || right.last - left.last || left.alias.localeCompare(right.alias))
    .slice(0, ADMIN_TOP_PLAYER_LIMIT);
  const recentRecords = [...recentByGame.values()]
    .map(({ document, record }) => adminRecentMatchItem(document, record))
    .sort((left, right) => right.time - left.time)
    .slice(0, ADMIN_RECENT_MATCH_LIMIT);

  return {
    updatedAt: now,
    users: {
      total: users.length,
      new7,
      new30,
      activeToday: activityDayCounts[dayKey(now)] || 0,
      active7,
      active30,
      totalLogins,
      growth
    },
    matches: {
      total: seenMatches.size,
      byMode,
      aiTotal,
      onlineTotal,
      aiWins,
      playerWins: Math.max(0, aiDecided - aiWins),
      aiDraws,
      drawTotal,
      aiWinRateOverall: aiDecided ? Number((aiWins * 100 / aiDecided).toFixed(1)) : null,
      avgRounds: roundCount ? Number((roundTotal / roundCount).toFixed(1)) : null,
      difficultyStats,
      byEndReason,
      trend: matchTrend
    },
    trend,
    topPlayers,
    recent: recentRecords,
    playerBattles: { windowDays: PLAYER_WINDOW_DAYS, items: activeTop },
    recentMatches: { limit: RECENT_MATCH_LIMIT, items: recentItems },
    rankAnomalyStats: rankAnomalyStats(rankMatches, usersByOpenid)
  };
}

module.exports = { buildAdminStats, dayKey };
