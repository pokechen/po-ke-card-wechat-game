const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_LIMIT = 1000;

// 分页拉取集合全量数据（云函数单次查询上限 1000 条）
async function fetchAll(name) {
  const coll = db.collection(name);
  const { total } = await coll.count();
  const pages = Math.max(1, Math.ceil((total || 0) / MAX_LIMIT));
  let list = [];
  for (let i = 0; i < pages; i++) {
    const { data } = await coll.skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
    list = list.concat(data || []);
  }
  return list;
}

function toDay(ts) {
  if (ts == null) return null;
  const n = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!n || isNaN(n)) return null;
  return new Date(n).toISOString().slice(0, 10);
}

function endReasonLabel(reason) {
  const labels = {
    normal: '正常结束',
    surrender: '认输结束',
    disconnect: '掉线结束',
    timeout: '超时结束',
    draw: '平局结束'
  };
  return labels[reason] || '未知原因';
}

exports.main = async (event, context) => {
  // HTTP 触发模式：event 包含 headers/body，需返回标准 HTTP 响应
  const isHttp = !!(event.httpMethod || event.headers);

  // CORS 预检请求直接返回
  if (isHttp && event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }, body: '' };
  }

  try {
    // 静态管理后台会传入管理员 OpenID；该值必须与云函数环境变量 ADMIN_OPENID 一致。
    const configuredAdminOpenid = String(process.env.ADMIN_OPENID || '').trim();
    const suppliedAdminOpenid = String(event && event.adminOpenid || '').trim();
    const wxContext = cloud.getWXContext() || {};
    const callerOpenid = String(wxContext.OPENID || '').trim();
    let isDatabaseAdmin = false;
    if (callerOpenid) {
      try {
        const admin = await db.collection('admin_openids').doc(callerOpenid).get();
        isDatabaseAdmin = !!admin.data;
      } catch (err) {}
    }
    const isConfiguredAdmin = !!configuredAdminOpenid && suppliedAdminOpenid === configuredAdminOpenid;
    if (!isConfiguredAdmin && !isDatabaseAdmin) {
      const message = configuredAdminOpenid
        ? '管理员身份校验未通过'
        : '未配置管理员 OpenID，请设置云函数环境变量 ADMIN_OPENID';
      const denied = { ok: false, code: 'FORBIDDEN', message };
      if (isHttp) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(denied)
        };
      }
      return denied;
    }

    const users = await fetchAll('users');
    const matches = await fetchAll('match_history');

    const now = Date.now();
    const DAY = 86400000;
    const active = (ts, days) => {
      if (ts == null) return false;
      const n = typeof ts === 'number' ? ts : Date.parse(ts);
      return n && !isNaN(n) && (now - n) <= days * DAY;
    };

    // ---------- 用户指标 ----------
    const userDayCount = {};
    let active7 = 0, active30 = 0, new7 = 0, new30 = 0, totalLogins = 0;
    for (const u of users) {
      const d = toDay(u.createdAt);
      if (d) userDayCount[d] = (userDayCount[d] || 0) + 1;
      if (active(u.lastLoginAt, 7)) active7++;
      if (active(u.lastLoginAt, 30)) active30++;
      if (active(u.createdAt, 7)) new7++;
      if (active(u.createdAt, 30)) new30++;
      totalLogins += (u.loginCount || 0);
    }
    const userDays = Object.keys(userDayCount).sort();
    let cum = 0;
    const growth = userDays.map(d => {
      cum += userDayCount[d];
      return { date: d, new: userDayCount[d], cumulative: cum };
    });

    // ---------- 对局指标 ----------
    const matchDay = {};                  // date -> {total, ai, online, aiWin, aiDecided}
    const byDifficulty = {};              // diff -> {total, aiWin, decided}
    const byEndReason = {};
    const byMode = { ai: 0, online: 0 };
    let aiTotal = 0, onlineTotal = 0, drawTotal = 0;
    let roundSum = 0, roundCount = 0;
    const playerMap = {};
    const recentRaw = [];

    for (const doc of matches) {
      // 战绩业务字段保存在 record 中，顶层字段仅用于索引；合并后兼容历史与新记录。
      const match = { ...doc, ...(doc.record && typeof doc.record === 'object' ? doc.record : {}) };
      const d = toDay(match.time);
      if (d && !matchDay[d]) matchDay[d] = { total: 0, ai: 0, online: 0, aiWin: 0, aiDecided: 0 };
      if (d) matchDay[d].total++;

      const isOnline = match.mode === 'online';
      const diff = match.difficulty || '未知';

      if (isOnline) {
        onlineTotal++; byMode.online++;
        if (d) matchDay[d].online++;
      } else {
        // AI 模式：座位 0 = 玩家，座位 1 = 系统(AI)，winner===1 即 AI 获胜
        aiTotal++; byMode.ai++;
        if (d) matchDay[d].ai++;
        if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, aiWin: 0, decided: 0 };
        byDifficulty[diff].total++;
        if (match.winner === 1) {
          byDifficulty[diff].aiWin++; byDifficulty[diff].decided++;
          if (d) { matchDay[d].aiWin++; matchDay[d].aiDecided++; }
        } else if (match.winner === 0) {
          byDifficulty[diff].decided++;
          if (d) matchDay[d].aiDecided++;
        }
      }

      if (match.winner == null) drawTotal++;
      const er = endReasonLabel(match.endReason);
      byEndReason[er] = (byEndReason[er] || 0) + 1;
      const roundsPlayed = Array.isArray(match.roundResults) ? match.roundResults.length : Number(match.rounds);
      if (Number.isFinite(roundsPlayed) && roundsPlayed > 0) { roundSum += roundsPlayed; roundCount++; }

      const oid = doc._openid || doc.openid;
      if (oid) {
        if (!playerMap[oid]) playerMap[oid] = { openid: oid, matches: 0, wins: 0, losses: 0, draws: 0, last: 0 };
        playerMap[oid].matches++;
        if (match.winner === 0) playerMap[oid].wins++;
        else if (match.winner === 1) playerMap[oid].losses++;
        else playerMap[oid].draws++;
        if ((match.time || 0) > playerMap[oid].last) playerMap[oid].last = match.time || 0;
      }

      recentRaw.push(match);
    }

    // 每日序列（补齐日期空缺，曲线连续）
    const matchDays = Object.keys(matchDay).sort();
    let trend = [];
    if (matchDays.length) {
      const start = new Date(matchDays[0] + 'T00:00:00Z');
      const end = new Date(matchDays[matchDays.length - 1] + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        const o = matchDay[key];
        trend.push({
          date: key,
          total: o ? o.total : 0,
          ai: o ? o.ai : 0,
          online: o ? o.online : 0,
          aiWinRate: o && o.aiDecided ? +(o.aiWin / o.aiDecided * 100).toFixed(1) : null
        });
      }
    }

    const aiDecidedTotal = Object.values(byDifficulty).reduce((s, x) => s + x.decided, 0);
    const aiWinTotal = Object.values(byDifficulty).reduce((s, x) => s + x.aiWin, 0);
    const aiWinRateOverall = aiDecidedTotal ? +(aiWinTotal / aiDecidedTotal * 100).toFixed(1) : null;

    const difficultyStats = Object.keys(byDifficulty).sort().map(k => ({
      difficulty: k,
      total: byDifficulty[k].total,
      decided: byDifficulty[k].decided,
      aiWin: byDifficulty[k].aiWin,
      aiWinRate: byDifficulty[k].decided ? +(byDifficulty[k].aiWin / byDifficulty[k].decided * 100).toFixed(1) : null
    }));

    const topPlayers = Object.values(playerMap).sort((a, b) => b.matches - a.matches).slice(0, 20);

    const recent = recentRaw
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, 50)
      .map(m => ({
        time: m.time,
        mode: m.mode,
        winner: m.winner,
        difficulty: m.difficulty,
        humanFaction: m.humanFaction,
        aiFaction: m.aiFaction,
        humanLeader: m.humanLeader,
        aiLeader: m.aiLeader,
        rounds: m.rounds,
        endReason: m.endReason,
        score: m.score
      }));

    const result = {
      ok: true,
      updatedAt: Date.now(),
      users: {
        total: users.length,
        new7, new30, active7, active30, totalLogins,
        growth
      },
      matches: {
        total: matches.length,
        byMode,
        aiTotal, onlineTotal, drawTotal,
        aiWinRateOverall,
        avgRounds: roundCount ? +(roundSum / roundCount).toFixed(1) : null,
        byEndReason,
        difficultyStats,
        trend
      },
      topPlayers,
      recent
    };

    if (isHttp) {
      return { 
        statusCode: 200, 
        headers: { 
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }, 
        body: JSON.stringify(result) 
      };
    }
    return result;
  } catch (e) {
    const err = { ok: false, message: e.message || String(e) };
    if (isHttp) {
      return { 
        statusCode: 500, 
        headers: { 
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }, 
        body: JSON.stringify(err) 
      };
    }
    return err;
  }
};
