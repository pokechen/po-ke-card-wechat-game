#!/usr/bin/env node
/**
 * 管理后台报告生成器
 * 
 * 用法：
 *   1. npm install @cloudbase/node-sdk  （首次）
 *   2. node scripts/generate-admin-report.js
 *   3. 打开生成的 admin/report.html
 * 
 * 需要在云开发控制台 → 设置 → 环境变量 中配置：
 *   TCB_SECRET_ID 和 TCB_SECRET_KEY（或通过命令行传入）
 */

const fs = require('fs');
const path = require('path');

// ---------- 配置 ----------
const ENV_ID = 'po-ke-card-d0gg2ewaac3e700c4';
const OUTPUT = path.join(__dirname, '..', 'admin', 'report.html');
const MAX_LIMIT = 1000;

// ---------- 初始化云开发 SDK ----------
let db;
async function initDB() {
  // 尝试多种方式获取凭证
  const secretId = process.env.TCB_SECRET_ID || '';
  const secretKey = process.env.TCB_SECRET_KEY || '';

  if (!secretId || !secretKey) {
    console.error('\n❌ 缺少云开发凭证。请设置环境变量后重试：');
    console.error('');
    console.error('  方式一：环境变量');
    console.error('    export TCB_SECRET_ID=你的SecretId');
    console.error('    export TCB_SECRET_KEY=你的SecretKey');
    console.error('    node scripts/generate-admin-report.js');
    console.error('');
    console.error('  方式二：命令行直接传');
    console.error('    TCB_SECRET_ID=xxx TCB_SECRET_KEY=yyy node scripts/generate-admin-report.js');
    console.error('');
    console.error('📌 获取凭证：云开发控制台 → 设置 → 环境变量 → 复制 SecretId / SecretKey');
    process.exit(1);
  }

  const tcb = require('@cloudbase/node-sdk');
  const app = tcb.init({
    env: ENV_ID,
    secretId,
    secretKey
  });
  db = app.database();
  console.log(`✅ 已连接云开发环境: ${ENV_ID}`);
}

// ---------- 数据拉取 ----------
async function fetchAll(collName) {
  const coll = db.collection(collName);
  const countRes = await coll.count();
  const total = countRes.total || 0;
  const pages = Math.max(1, Math.ceil(total / MAX_LIMIT));
  let list = [];
  for (let i = 0; i < pages; i++) {
    const res = await coll.skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
    list = list.concat(res.data || []);
  }
  return list;
}

// ---------- 统计计算 ----------
function toDay(ts) {
  if (ts == null) return null;
  const n = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!n || isNaN(n)) return null;
  return new Date(n).toISOString().slice(0, 10);
}

function computeStats(users, matches) {
  const now = Date.now();
  const DAY = 86400000;
  const active = (ts, days) => {
    if (ts == null) return false;
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    return n && !isNaN(n) && (now - n) <= days * DAY;
  };

  // 用户指标
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

  // 对局指标
  const matchDay = {};
  const byDifficulty = {};
  const byEndReason = {};
  const byMode = { ai: 0, online: 0 };
  let aiTotal = 0, onlineTotal = 0, drawTotal = 0;
  let roundSum = 0, roundCount = 0;
  const playerMap = {};
  const recentRaw = [];

  for (const doc of matches) {
    // 与云函数统计保持一致：索引字段位于顶层，完整战绩字段位于 record。
    const m = { ...doc, ...(doc.record && typeof doc.record === 'object' ? doc.record : {}) };
    const d = toDay(m.time);
    if (d && !matchDay[d]) matchDay[d] = { total: 0, ai: 0, online: 0, aiWin: 0, aiDecided: 0 };
    if (d) matchDay[d].total++;

    const isOnline = m.mode === 'online';
    const diff = m.difficulty || '未知';

    if (isOnline) {
      onlineTotal++; byMode.online++;
      if (d) matchDay[d].online++;
    } else {
      aiTotal++; byMode.ai++;
      if (d) matchDay[d].ai++;
      if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, aiWin: 0, decided: 0 };
      byDifficulty[diff].total++;
      if (m.winner === 1) {
        byDifficulty[diff].aiWin++; byDifficulty[diff].decided++;
        if (d) { matchDay[d].aiWin++; matchDay[d].aiDecided++; }
      } else if (m.winner === 0) {
        byDifficulty[diff].decided++;
        if (d) matchDay[d].aiDecided++;
      }
    }

    if (m.winner == null) drawTotal++;
    const er = endReasonLabel(m.endReason);
    byEndReason[er] = (byEndReason[er] || 0) + 1;
    if (typeof m.rounds === 'number') { roundSum += m.rounds; roundCount++; }

    const oid = m._openid || m.openid;
    if (oid) {
      if (!playerMap[oid]) playerMap[oid] = { openid: oid, matches: 0, wins: 0, losses: 0, draws: 0, last: 0 };
      playerMap[oid].matches++;
      if (m.winner === 0) playerMap[oid].wins++;
      else if (m.winner === 1) playerMap[oid].losses++;
      else playerMap[oid].draws++;
      if ((m.time || 0) > playerMap[oid].last) playerMap[oid].last = m.time || 0;
    }
    recentRaw.push(m);
  }

  // 每日趋势
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
      time: m.time, mode: m.mode, winner: m.winner,
      difficulty: m.difficulty, humanFaction: m.humanFaction,
      aiFaction: m.aiFaction, humanLeader: m.humanLeader,
      aiLeader: m.aiLeader, rounds: m.rounds,
      endReason: m.endReason, score: m.score
    }));

  return {
    ok: true,
    updatedAt: Date.now(),
    users: { total: users.length, new7, new30, active7, active30, totalLogins, growth },
    matches: {
      total: matches.length, byMode, aiTotal, onlineTotal, drawTotal,
      aiWinRateOverall,
      avgRounds: roundCount ? +(roundSum / roundCount).toFixed(1) : null,
      byEndReason, difficultyStats, trend
    },
    topPlayers, recent
  };
}

// ---------- HTML 报告生成 ----------
function generateHTML(data) {
  const json = JSON.stringify(data);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>扑克阵 · 管理后台</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>
<style>
  :root{--bg:#0f1419;--panel:#1a212b;--panel2:#222c38;--txt:#e6edf3;--muted:#8b98a9;--line:#2a3441;--green:#2f9e6f;--blue:#3d7ad6;--orange:#e08a3c;--red:#d6584f}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
  header{padding:18px 24px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center}
  header h1{font-size:18px;margin:0;font-weight:600}
  #status{font-size:12px;color:var(--muted);padding:10px 24px;min-height:18px}
  main{padding:16px 24px 48px}
  .grid{display:grid;gap:14px}
  .kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:18px}
  .kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .kpi .v{font-size:26px;font-weight:700}
  .kpi .l{font-size:12px;color:var(--muted);margin-top:4px}
  .charts{grid-template-columns:repeat(auto-fit,minmax(360px,1fr));margin-bottom:18px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .card h3{margin:0 0 10px;font-size:14px;font-weight:600;color:var(--txt)}
  .card .canvas-wrap{position:relative;height:240px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600}
  .tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px}
  .tag.win{background:rgba(47,158,111,.18);color:#5fd6a0}
  .tag.lose{background:rgba(214,88,79,.18);color:#f08a82}
  .tag.draw{background:rgba(139,152,169,.18);color:var(--muted)}
  .tag.ai{background:rgba(61,122,214,.18);color:#7fb0f0}
  .tag.online{background:rgba(224,138,60,.18);color:#f0b07f}
  .section-title{font-size:15px;font-weight:600;margin:22px 0 12px}
  .empty{color:var(--muted);font-size:13px;padding:20px;text-align:center}
</style>
</head>
<body>
<header><h1>扑克阵 · 管理后台</h1></header>
<div id="status"></div>
<main id="app"></main>
<script>
const DATA = ${json};
const $ = id => document.getElementById(id);
let charts = {};

function fmtTime(ts){if(!ts)return'-';const d=new Date(typeof ts==='number'?ts:Date.parse(ts));if(isNaN(d))return'-';const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())}
function pct(n){return n==null?'-':n+'%'}
function destroy(id){if(charts[id]){charts[id].destroy();delete charts[id]}}

function baseOpts(){return{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#e6edf3'}}},scales:{x:catScale(),y:valScale()}}}
function catScale(){return{ticks:{color:'#8b98a9',maxRotation:60,minRotation:0},grid:{color:'#2a3441'}}}
function valScale(){return{ticks:{color:'#8b98a9'},grid:{color:'#2a3441'},beginAtZero:true}}

function renderKpis(d){
  const u=d.users,m=d.matches;
  const cards=[
    {v:u.total,l:'总用户数'},{v:u.new7,l:'近7天新增'},{v:u.active30,l:'近30天活跃'},
    {v:m.total,l:'总对局数'},{v:m.aiTotal,l:'AI模式对局'},{v:pct(m.aiWinRateOverall),l:'AI总胜率'},
    {v:m.avgRounds==null?'-':m.avgRounds,l:'平均回合数'},{v:u.totalLogins,l:'累计登录次数'}
  ];
  $('kpis').innerHTML=cards.map(c=>'<div class="kpi"><div class="v">'+c.v+'</div><div class="l">'+c.l+'</div></div>').join('');
}

function renderUser(u){
  const g=u.growth||[];
  destroy('cUserGrowth');destroy('cUserNew');
  if(!g.length){$('cUserGrowth').parentElement.innerHTML='<div class="empty">暂无用户数据</div>'}
  charts.cUserGrowth=new Chart($('cUserGrowth'),{
    type:'line',data:{labels:g.map(x=>x.date),datasets:[{label:'累计用户',data:g.map(x=>x.cumulative),borderColor:'#2f9e6f',backgroundColor:'rgba(47,158,111,.15)',fill:true,tension:.3,pointRadius:0}]},options:baseOpts()
  });
  charts.cUserNew=new Chart($('cUserNew'),{
    type:'bar',data:{labels:g.map(x=>x.date),datasets:[{label:'新增',data:g.map(x=>x.new),backgroundColor:'#3d7ad6'}]},options:baseOpts()
  });
}

function renderMatches(m){
  const t=m.trend||[];
  destroy('cMatchVol');destroy('cAiWin');
  charts.cMatchVol=new Chart($('cMatchVol'),{
    type:'bar',data:{labels:t.map(x=>x.date),datasets:[
      {label:'AI',data:t.map(x=>x.ai),backgroundColor:'#3d7ad6'},{label:'联机',data:t.map(x=>x.online),backgroundColor:'#e08a3c'}
    ]},options:Object.assign(baseOpts(),{scales:{x:catScale(),y:valScale()}})
  });
  const aiPts=t.filter(x=>x.aiWinRate!=null);
  charts.cAiWin=new Chart($('cAiWin'),{
    type:'line',data:{labels:aiPts.map(x=>x.date),datasets:[{label:'AI胜率(%)',data:aiPts.map(x=>x.aiWinRate),borderColor:'#e0584f',backgroundColor:'rgba(224,88,79,.12)',fill:true,tension:.3,pointRadius:2}]},
    options:Object.assign(baseOpts(),{scales:{x:catScale(),y:Object.assign(valScale(),{suggestedMin:0,suggestedMax:100})}})
  });
  const ds=m.difficultyStats||[];
  destroy('cDiff');
  charts.cDiff=new Chart($('cDiff'),{
    type:'bar',data:{labels:ds.map(x=>x.difficulty),datasets:[{label:'AI胜率(%)',data:ds.map(x=>x.aiWinRate),backgroundColor:'#2f9e6f'}]},
    options:Object.assign(baseOpts(),{scales:{x:catScale(),y:Object.assign(valScale(),{suggestedMin:0,suggestedMax:100})}})
  });
  const er=m.byEndReason||{};
  destroy('cEnd');
  charts.cEnd=new Chart($('cEnd'),{
    type:'doughnut',data:{labels:Object.keys(er),datasets:[{data:Object.values(er),backgroundColor:['#3d7ad6','#e08a3c','#2f9e6f','#d6584f','#9b7bd6','#5aa9b5']}]},
    options:{plugins:{legend:{position:'right',labels:{color:'#e6edf3'}}}}
  });
  const mode=m.byMode||{};
  destroy('cMode');
  charts.cMode=new Chart($('cMode'),{
    type:'doughnut',data:{labels:['AI','联机'],datasets:[{data:[mode.ai||0,mode.online||0],backgroundColor:['#3d7ad6','#e08a3c']}]},
    options:{plugins:{legend:{position:'right',labels:{color:'#e6edf3'}}}}
  });
  const dec=(m.aiTotal||0)-(m.drawTotal||0);
  const aiWin=Math.round((m.aiWinRateOverall||0)/100*dec);
  destroy('cResult');
  charts.cResult=new Chart($('cResult'),{
    type:'doughnut',data:{labels:['AI胜','玩家胜','平局'],datasets:[{data:[aiWin,dec-aiWin,m.drawTotal||0],backgroundColor:['#d6584f','#2f9e6f','#8b98a9']}]},
    options:{plugins:{legend:{position:'right',labels:{color:'#e6edf3'}}}}
  });
}

function renderPlayers(rows){
  const tb=$('tPlayers').querySelector('tbody');
  if(!rows||!rows.length){tb.innerHTML='<tr><td colspan="7" class="empty">暂无数据</td></tr>';return}
  tb.innerHTML=rows.map(p=>{
    const wr=p.matches?Math.round(p.wins/p.matches*100):0;
    return '<tr><td style="font-size:11px;word-break:break-all">'+p.openid+'</td><td>'+p.matches+'</td><td>'+p.wins+'</td><td>'+p.losses+'</td><td>'+p.draws+'</td><td>'+wr+'%</td><td style="font-size:12px">'+fmtTime(p.last)+'</td></tr>';
  }).join('');
}

function renderRecent(rows){
  const tb=$('tRecent').querySelector('tbody');
  if(!rows||!rows.length){tb.innerHTML='<tr><td colspan="8" class="empty">暂无数据</td></tr>';return}
  tb.innerHTML=rows.map(m=>{
    let resTag,resTxt;
    if(m.winner==null){resTag='draw';resTxt='平'}
    else if(m.mode==='online'){resTag='win';resTxt=(m.winner===0?'P1胜':'P2胜')}
    else{resTag=m.winner===1?'lose':'win';resTxt=m.winner===1?'AI胜':'玩家胜'}
    const modeTag=m.mode==='online'?'online':'ai';
    return '<tr><td style="font-size:12px">'+fmtTime(m.time)+'</td><td><span class="tag '+modeTag+'">'+(m.mode==='online'?'联机':'AI')+'</span></td><td>'+(m.difficulty||'-')+'</td><td><span class="tag '+resTag+'">'+resTxt+'</span></td><td style="font-size:12px">'+(m.humanFaction|| '-')+' / '+(m.aiFaction||'-')+'</td><td style="font-size:12px">'+(m.humanLeader||'-')+' / '+(m.aiLeader||'-')+'</td><td>'+(m.rounds==null?'-':m.rounds)+'</td><td style="font-size:12px">'+(m.endReason||'-')+'</td></tr>';
  }).join('');
}

function render(d){
  $('app').innerHTML=
    '<div class="grid kpis" id="kpis"></div>'+
    '<div class="section-title">用户</div>'+
    '<div class="grid charts"><div class="card"><h3>用户累计增长</h3><div class="canvas-wrap"><canvas id="cUserGrowth"></canvas></div></div><div class="card"><h3>每日新增用户</h3><div class="canvas-wrap"><canvas id="cUserNew"></canvas></div></div></div>'+
    '<div class="section-title">对局与 AI 表现</div>'+
    '<div class="grid charts">'+
      '<div class="card"><h3>每日对局量（AI / 联机）</h3><div class="canvas-wrap"><canvas id="cMatchVol"></canvas></div></div>'+
      '<div class="card"><h3>AI 胜率变化趋势（每日）</h3><div class="canvas-wrap"><canvas id="cAiWin"></canvas></div></div>'+
      '<div class="card"><h3>各难度 AI 胜率</h3><div class="canvas-wrap"><canvas id="cDiff"></canvas></div></div>'+
      '<div class="card"><h3>结束原因分布</h3><div class="canvas-wrap"><canvas id="cEnd"></canvas></div></div>'+
      '<div class="card"><h3>对战模式分布</h3><div class="canvas-wrap"><canvas id="cMode"></canvas></div></div>'+
      '<div class="card"><h3>整体胜负（AI 模式）</h3><div class="canvas-wrap"><canvas id="cResult"></canvas></div></div>'+
    '</div>'+
    '<div class="section-title">玩家活跃 Top 20</div>'+
    '<div class="card"><table id="tPlayers"><thead><tr><th>用户(openid)</th><th>对局</th><th>胜</th><th>负</th><th>平</th><th>胜率</th><th>最近对局</th></tr></thead><tbody></tbody></table></div>'+
    '<div class="section-title">最近对局</div>'+
    '<div class="card"><table id="tRecent"><thead><tr><th>时间</th><th>模式</th><th>难度</th><th>结果</th><th>阵营(我/AI)</th><th>主将(我/AI)</th><th>回合</th><th>结束</th></tr></thead><tbody></tbody></table></div>';

  renderKpis(d);renderUser(d.users);renderMatches(d.matches);renderPlayers(d.topPlayers);renderRecent(d.recent);
  $('status').textContent='数据更新于 '+fmtTime(d.updatedAt)+'（共 '+d.users.total+' 用户 / '+d.matches.total+' 对局）';
}

render(DATA);
<\/script>
</body>
</html>`;
}

// ---------- 主流程 ----------
async function main() {
  console.log('\n📊 扑克阵 · 管理后台报告生成器\n');

  await initDB();

  console.log('📥 拉取 users 集合...');
  const users = await fetchAll('users');
  console.log(`   ✅ ${users.length} 条用户记录`);

  console.log('📥 拉取 match_history 集合...');
  const matches = await fetchAll('match_history');
  console.log(`   ✅ ${matches.length} 条对局记录`);

  console.log('📊 计算统计指标...');
  const data = computeStats(users, matches);

  console.log('📝 生成 HTML 报告...');
  const html = generateHTML(data);

  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT, html, 'utf-8');

  console.log('\n✅ 报告已生成！');
  console.log(`   📄 文件: ${path.relative(process.cwd(), OUTPUT)}`);
  console.log('   🔗 双击文件即可在浏览器中打开\n');

  // 输出关键摘要
  const m = data.matches;
  console.log('═══════════════════════════════════════');
  console.log('  关键指标摘要');
  console.log('═══════════════════════════════════════');
  console.log(`  总用户:     ${data.users.total}`);
  console.log(`  总对局:     ${m.total}  (AI:${m.aiTotal} / 联机:${m.onlineTotal})`);
  console.log(`  AI 总胜率:  ${m.aiWinRateOverall}%`);
  console.log(`  平均回合:   ${m.avgRounds}`);
  if (m.difficultyStats && m.difficultyStats.length) {
    console.log('  ── 各难度 AI 胜率 ──');
    for (const ds of m.difficultyStats) {
      console.log(`    ${ds.difficulty}: ${ds.aiWinRate}% (${ds.aiWin}/${ds.decided})`);
    }
  }
  console.log('═══════════════════════════════════════\n');
}

main().catch(e => {
  console.error('❌ 生成失败:', e.message || e);
  process.exit(1);
});
