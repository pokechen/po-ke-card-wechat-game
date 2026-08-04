"use strict";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function stateError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.isRoomActionError = true;
  return error;
}

function cleanPlayer(player = {}, resetStageFlags = false) {
  const hasLegacyReady = Object.prototype.hasOwnProperty.call(player, "ready");
  if (!hasLegacyReady && !resetStageFlags) return player;
  const { ready, ...clean } = player;
  if (!resetStageFlags) return clean;
  return { ...clean, setupReady: false, rematchReady: false };
}

function cleanPlayers(players = [], resetStageFlags = false) {
  return safeArray(players).map(player => cleanPlayer(player, resetStageFlags));
}

function emptyReadyPlayers(players = []) {
  return safeArray(players).map(() => false);
}

function normalizedReadyPlayers(room = {}) {
  const stored = safeArray(room.readyPlayers);
  return safeArray(room.players).map((_, index) => !!stored[index]);
}

function roomPlayerReady(room, index) {
  return Number.isInteger(index) && index >= 0 && !!normalizedReadyPlayers(room)[index];
}

function applyRuleChange(room, rules, updatedAt) {
  const players = cleanPlayers(room.players, true);
  return {
    ...room,
    status: "waiting",
    rules,
    players,
    readyPlayers: emptyReadyPlayers(players),
    selectionRuleVersion: null,
    match: null,
    turnSeq: (room.turnSeq || 0) + 1,
    updatedAt
  };
}

function applyReady(room, playerIndex, desiredReady, expectedRuleVersion, updatedAt) {
  const currentRuleVersion = Math.max(0, Number(room?.rules?.version || 0) || 0);
  const expectedVersion = Math.max(0, Number(expectedRuleVersion || 0) || 0);
  if (expectedVersion !== currentRuleVersion) {
    throw stateError("房间规则已修改，请确认新规则后重新准备", "STALE_RULES");
  }
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= safeArray(room.players).length) {
    throw stateError("你不在这个房间", "FORBIDDEN");
  }
  if (room.status === "selecting" && desiredReady && Number(room.selectionRuleVersion || 0) === currentRuleVersion) {
    return { room, changed: false, transitioned: true };
  }
  if (room.status !== "waiting") throw stateError("当前不能准备", "ROOM_BUSY");

  const players = cleanPlayers(room.players);
  const readyPlayers = normalizedReadyPlayers(room);
  if (readyPlayers[playerIndex] === !!desiredReady) {
    const cleanAlready = players.every((player, index) => player === room.players[index]);
    return { room: cleanAlready ? room : { ...room, players }, changed: !cleanAlready, transitioned: false };
  }

  readyPlayers[playerIndex] = !!desiredReady;
  const bothReady = players.length >= 2 && readyPlayers.slice(0, 2).every(Boolean);
  if (bothReady) {
    const nextPlayers = cleanPlayers(players, true);
    return {
      room: {
        ...room,
        status: "selecting",
        players: nextPlayers,
        readyPlayers: emptyReadyPlayers(nextPlayers),
        selectionRuleVersion: currentRuleVersion,
        match: null,
        turnSeq: (room.turnSeq || 0) + 1,
        updatedAt
      },
      changed: true,
      transitioned: true
    };
  }

  return {
    room: {
      ...room,
      players,
      readyPlayers,
      selectionRuleVersion: null,
      turnSeq: (room.turnSeq || 0) + 1,
      updatedAt
    },
    changed: true,
    transitioned: false
  };
}

module.exports = {
  applyReady,
  applyRuleChange,
  cleanPlayers,
  emptyReadyPlayers,
  normalizedReadyPlayers,
  roomPlayerReady
};
