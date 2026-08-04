# po-ke-card-wechat-game

## PVP 共享核心同步

当修改以下共享文件后，需要手动同步到云函数目录：

- `shared/core/battle.js`
- `shared/core/cards.js`
- `shared/core/storage.js`
- `shared/core/adminStats.js`
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

## CloudBase 部署信息

- 腾讯云账号环境：`po-ke-card-d0gg2ewaac3e700c4`
- 地域：`ap-shanghai`
- 云函数：
  - `pvpRoom`：事件型云函数，运行时 `Nodejs18.15`，入口 `index.main`
  - `adminStats`：事件型云函数，运行时 `Nodejs18.15`，入口 `index.main`，超时 `20s`
- 数据库集合：`game_rooms`、`users`、`user_tokens`、`match_history`、`daily_user_activity`
- 管理员 OpenID：不写入数据库，仅在云函数环境变量（后台服务配置）中配置，变量名为 `ADMIN_OPENID`，支持用逗号分隔配置多个管理员 OpenID。两个云函数均只读取该环境变量校验管理员身份。
- 云函数接口：
  - `pvpRoom`：小游戏使用 `getAdminStatus` 与 `getAdminStats`；二者均需有效游戏令牌，统计接口还需 `ADMIN_OPENID` 命中配置的管理员列表。统计内容包含用户/AI 趋势、近 7 天活跃玩家对战榜和全服最近已完成对局；对局数据仅供管理员查看，展示用户头像与昵称，但不返回 OpenID、房间号或对局 ID。
  - `adminStats`：保留为事件函数，但同样强制校验微信 OpenID 白名单；未授权请求返回 `FORBIDDEN`。
- 部署形态：客户端为微信小游戏，不是 Web 前端，因此不发布到 CloudBase 静态托管；后端为事件型云函数。小游戏当前通过 HTTP 访问 `pvpRoom`：`https://po-ke-card-d0gg2ewaac3e700c4-1302893388.ap-shanghai.app.tcloudbase.com/pvpRoom`；`adminStats` 保留为受管理员身份校验保护的事件函数。
- 最近部署：`2026-08-04`，已执行 `node scripts/sync-pvp-core.js` 并更新 `pvpRoom` 与 `adminStats`。本次同步包含当前工作区代码及 PVP 准备状态修复。两个函数均为 `Active/Available`；`pvpRoom` 调用 `{ "action": "getLoginContext" }` 验证返回 `ok: true`；`adminStats` 空参数调用因管理员白名单校验按预期返回 `FORBIDDEN`，需携带已配置的管理员身份才能读取统计数据。

一键同步与部署脚本：

```bash
chmod +x scripts/deploy-cloudfunctions.sh
./scripts/deploy-cloudfunctions.sh
```

脚本会自动执行：

1. `node scripts/sync-pvp-core.js`
2. 更新/部署 `pvpRoom`
3. 更新/部署 `adminStats`
4. 调用两个云函数验证返回结果

如需部署到其他环境，可覆盖环境变量：

```bash
TCB_ENV_ID=你的环境ID ./scripts/deploy-cloudfunctions.sh
```
