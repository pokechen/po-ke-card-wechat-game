# po-ke-card-wechat-game

## PVP 共享核心同步

当修改以下共享文件后，需要手动同步到云函数目录：

- `shared/core/battle.js`
- `shared/core/cards.js`
- `shared/core/storage.js`
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
