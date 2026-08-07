# po-ke-card-wechat-game

## PVP 共享核心同步

当修改以下共享文件后，需要手动同步到云函数目录：

- `shared/core/battle.js`
- `shared/core/cards.js`
- `shared/core/storage.js`
- `shared/core/adminStats.js`
- `shared/core/rank.js`
- `shared/data/zhangyu_cards.js`

在项目根目录执行：

```bash
node scripts/sync-pvp-core.js
```

该脚本会：

- 生成客户端与云函数旧路径的 wrapper 文件
- 将 `shared/` 下的 PVP 核心代码复制到 `cloudfunctions/pvpRoom/shared/`
- 校验卡牌数量是否为 `254`

建议在修改共享逻辑或部署云函数前手动执行一次，避免客户端与云函数逻辑不一致。

## 上线前必跑验证

```bash
node scripts/sync-pvp-core.js
node scripts/test-pvp-ready-state.js   # 联机准备状态机、规则版本竞争
node scripts/smoke-pvp-flow.js         # 云函数全流程 + 对局视角脱敏断言
node scripts/test-ai-strategy.js       # 卡牌与策略规则
node scripts/test-leader-skills.js     # 主将技能
```

## 安全与合规要点

- **对局视角脱敏**：`pvpRoom` 的 `publicRoom()` 只把「自己的手牌」下发给对应玩家，对手手牌、对手保留牌、双方牌库都替换为只带数量的隐藏占位（`hidden: true`）。`match.pending` 的`candidates` / `discardedCards` 也按行动方脱敏——黄巢的 `leaderDeckChoice` 会把行动方整个剩余牌库放进 `candidates`，原样下发即泄露牌库内容与顺序。客户端是唯一渲染数据源且全部走云函数轮询（无数据库直连），因此不得回退为明文下发。`smoke-pvp-flow.js` 内置双视角断言与`viewerSafeMatch` 单元级断言防回归。
- **UGC 内容安全**：自定义昵称走 `wxa/msg_sec_check`，自定义头像走 `wxa/img_sec_check`，命中违规或检测不可用时一律拒绝（fail-closed）。房间内展示名与头像一律取服务端用户资料，不接受客户端传入，避免绕过检测。
  - 这两个接口**不能用 `cloud.openapi.security` 云调用**：云调用要求云函数由小程序端 `wx.cloud.callFunction` 触发以携带微信调用上下文，而本项目客户端通过 HTTP 访问服务直连 `pvpRoom`，云调用拿不到上下文，表现为「内容安全检测暂不可用」。因此统一用`getWechatAccessToken()` 自建 access_token 直调 `api.weixin.qq.com`，与房间二维码 `getwxacodeunlimit` 一致。
  - 依赖云函数环境变量 `WECHAT_APPID` 与 `WECHAT_APP_SECRET`；缺失时会走 fail-closed 拒绝并在日志打印原因。
  - `msg_sec_check` v2 要求 openid 是「近两小时访问过小程序」的用户，返回 `61010` 时自动降级为 v1 只校验文本。
  - `img_sec_check` 只接受 png/jpg/jpeg/gif 且不超过 1MB。用户不需要关心体积：客户端会把头像分级压缩到 512/384/256 宽（每级都从原图重压，避免叠加失真）直到 900KB 以内，因此可以直接选原图大照片。只有在`compressImage` 不可用或压缩后仍超1MB 时才会被拒，并给出「头像压缩失败，请重新选择照片或更新微信后重试」。
  - 客户端所有资料类失败都会**透出服务端的具体原因**（违规、频控、图片过大等），仅网络层与未知异常才回退通用文案，避免只提示「上传失败，请重试」让用户无从判断。
  - `cloudfunctions/pvpRoom/config.json` 里的 `openapi` 声明只对云调用生效，当前链路未使用，仅作保留。
- **接口频控**：`pvpRoom` 走公开 HTTP，`handleRpc` 按 action 做频控（`login` 按来源 IP，其余按 openid）。有 Redis 时用 Redis 计数，否则退化为进程内计数。
- **登录令牌**：`user_tokens` 与 Redis 中只保存 `sha256(token)`，每次登录签发新令牌，过期令牌机会性清理。
- **房间号复用**：4 位房间号仅 9000 个，已解散（留10 分钟重连缓冲）或早已过期的房间号可复用，并在建房时机会性清理过期房间文档。进行中的对局不会被复用。
- **管理统计**：只能通过 `pvpRoom` 的 `getAdminStats` 读取，需有效游戏令牌且 openid 命中 `ADMIN_OPENID`。统计拉取有 `20000` 条硬上限，超限会告警并在返回中标记 `dataScope.truncated`。
- **客户端日志**：统一走 `js/core/logger.js`，正式包 `DEBUG_LOG = false`，只输出 warn/error。排查线上问题时改为 `true` 再发体验版。
- **全局异常兜底**：`game.js` 顶部注册 `wx.onError` 与 `wx.onUnhandledRejection`，异常会记录并给用户一次可感知提示。

## CloudBase 部署信息

- 环境：`po-ke-card-d0gg2ewaac3e700c4`，地域 `ap-shanghai`
- 云函数：`pvpRoom`（事件型，入口 `index.main`，运行时 `Nodejs18.15`）
  - 更换运行时需要删除函数后重新创建（`updateFunctionCode` 不会修改 runtime）。重建会丢失环境变量与 HTTP 访问服务路径映射，必须一并恢复。
- `adminStats` 云函数已下线：其鉴权只校验调用方自行传入的 `adminOpenid`，可被伪造后拉取全量用户数据，且已无任何调用方。管理统计统一走 `pvpRoom` 的 `getAdminStats`。
- 数据库集合：`game_rooms`、`users`、`user_tokens`、`match_history`、`daily_user_activity`、`rank_profiles`、`rank_matches`
- 管理员 OpenID：不写入数据库与代码，仅配置在 `pvpRoom` 云函数环境变量 `ADMIN_OPENID`，多个用英文逗号分隔
- 小游戏访问 `pvpRoom` 的 HTTP 地址：`https://po-ke-card-d0gg2ewaac3e700c4-1302893388.ap-shanghai.app.tcloudbase.com/pvpRoom`
- 最近部署：`2026-08-07`，`pvpRoom` 已更新并通过 `getLoginContext` 调用验证。
- 客户端是微信小游戏，不发布到 CloudBase 静态托管

一键同步与部署脚本：

```bash
chmod +x scripts/deploy-cloudfunctions.sh
./scripts/deploy-cloudfunctions.sh
```

脚本会自动执行：

1. `node scripts/sync-pvp-core.js`
2. 更新/部署 `pvpRoom`（固定使用 `zip` 上传模式，避免控制台出现 `ResourceNotFound.Entryfile`）
3. 调用 `{"action":"getLoginContext"}` 验证返回

如需部署到其他环境，可覆盖环境变量：

```bash
TCB_ENV_ID=你的环境ID ./scripts/deploy-cloudfunctions.sh
```
