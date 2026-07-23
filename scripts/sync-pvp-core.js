const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const SHARED_FILES = [
  ["shared/core/battle.js", "cloudfunctions/pvpRoom/shared/core/battle.js"],
  ["shared/core/cards.js", "cloudfunctions/pvpRoom/shared/core/cards.js"],
  ["shared/core/storage.js", "cloudfunctions/pvpRoom/shared/core/storage.js"],
  ["shared/core/adminStats.js", "cloudfunctions/pvpRoom/shared/core/adminStats.js"],
  ["shared/data/zhangyu_cards.js", "cloudfunctions/pvpRoom/shared/data/zhangyu_cards.js"]
];

const WRAPPERS = [
  ["js/core/battle.js", "module.exports = require(\"../../shared/core/battle\");\n"],
  ["js/core/cards.js", "module.exports = require(\"../../shared/core/cards\");\n"],
  ["js/core/storage.js", "module.exports = require(\"../../shared/core/storage\");\n"],
  ["js/data/zhangyu_cards.js", "module.exports = require(\"../../shared/data/zhangyu_cards\");\n"],
  ["cloudfunctions/pvpRoom/js/core/battle.js", "module.exports = require(\"../../shared/core/battle\");\n"],
  ["cloudfunctions/pvpRoom/js/core/cards.js", "module.exports = require(\"../../shared/core/cards\");\n"],
  ["cloudfunctions/pvpRoom/js/core/storage.js", "module.exports = require(\"../../shared/core/storage\");\n"],
  ["cloudfunctions/pvpRoom/js/data/zhangyu_cards.js", "module.exports = require(\"../../shared/data/zhangyu_cards\");\n"]
];

function writeIfChanged(rel, content) {
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === content) return;
  fs.writeFileSync(target, content);
  console.log(`write ${rel}`);
}

function copyFile(sourceRel, targetRel) {
  const source = path.join(ROOT, sourceRel);
  const target = path.join(ROOT, targetRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  const sourceText = fs.readFileSync(source, "utf8");
  const targetText = fs.readFileSync(target, "utf8");
  if (sourceText !== targetText) throw new Error(`${targetRel} 同步后内容不一致`);
  console.log(`${sourceRel} -> ${targetRel}`);
}

WRAPPERS.forEach(([rel, content]) => writeIfChanged(rel, content));
SHARED_FILES.forEach(([source, target]) => copyFile(source, target));

const sharedData = require(path.join(ROOT, "shared/data/zhangyu_cards.js"));
const clientData = require(path.join(ROOT, "js/data/zhangyu_cards.js"));
const cloudData = require(path.join(ROOT, "cloudfunctions/pvpRoom/js/data/zhangyu_cards.js"));
const cardCount = Array.isArray(sharedData.cards) ? sharedData.cards.length : 0;
const clientCardCount = Array.isArray(clientData.cards) ? clientData.cards.length : 0;
const cloudCardCount = Array.isArray(cloudData.cards) ? cloudData.cards.length : 0;
if (cardCount !== 254 || clientCardCount !== 254 || cloudCardCount !== 254) {
  throw new Error(`卡牌数量异常：shared=${cardCount}, client=${clientCardCount}, cloud=${cloudCardCount}`);
}
console.log(`同步完成：共享源 ${cardCount} 张卡。`);
