'use strict';

// XP bars in the official UI contain progress WITHIN a level, not total XP.
// Source: https://pokeidle.io/app.js?v=1.305.9, pintarTreinador/pintarAtivo.
// Count only observed, unambiguous intervals. No guessed level XP formula.

const ACTIVE_STATUSES = new Set(['game_visible', 'fainted']);

function finiteNonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function validProgress(point) {
  return point && Number.isSafeInteger(point.level) && point.level >= 1
    && finiteNonnegative(point.current) && finiteNonnegative(point.target)
    && point.target > 0 && point.current <= point.target;
}

function xpDelta(previous, next) {
  if (!validProgress(previous) || !validProgress(next)) return null;
  const levels = next.level - previous.level;
  let result;
  if (levels === 0 && next.target === previous.target) result = next.current - previous.current;
  else if (levels === 1) result = previous.target - previous.current + next.current;
  else return null;
  return finiteNonnegative(result) ? result : null;
}

function trainerPoint(snapshot) {
  return {
    level: snapshot?.trainerLevel,
    current: snapshot?.trainerXp?.current,
    target: snapshot?.trainerXp?.target,
  };
}

function pokemonPoint(snapshot) {
  return {
    level: snapshot?.pokemon?.level,
    current: snapshot?.pokemon?.xpCurrent,
    target: snapshot?.pokemon?.xpTarget,
  };
}

function createFarmTracker({ minDurationMs = 60_000, maxGapMs = 45_000 } = {}) {
  let initial = null;
  let previous = null;
  let trainerXpGain = 0;
  let pokemonXpGain = null;
  let samples = 0;
  let reason = 'awaiting_game';

  function reset(why = 'manual_reset') {
    initial = null;
    previous = null;
    trainerXpGain = 0;
    pokemonXpGain = null;
    samples = 0;
    reason = why;
    return current();
  }

  function copy(snapshot) {
    return {
      ...snapshot,
      trainerXp: snapshot.trainerXp ? { ...snapshot.trainerXp } : null,
      pokemon: snapshot.pokemon ? { ...snapshot.pokemon } : null,
    };
  }

  function begin(snapshot, why = 'collecting') {
    initial = copy(snapshot);
    previous = copy(snapshot);
    trainerXpGain = 0;
    pokemonXpGain = snapshot.pokemon?.id && validProgress(pokemonPoint(snapshot)) ? 0 : null;
    samples = 1;
    reason = why;
    return current();
  }

  function current() {
    const elapsedMs = initial && previous ? Math.max(0, previous.at - initial.at) : 0;
    const ready = samples >= 2 && elapsedMs >= minDurationMs;
    const goldDelta = initial && previous && finiteNonnegative(initial.gold)
      && finiteNonnegative(previous.gold) ? previous.gold - initial.gold : null;
    const hourly = value => ready && value !== null ? value * 3_600_000 / elapsedMs : null;
    return {
      startedAt: initial?.at ?? null,
      updatedAt: previous?.at ?? null,
      elapsedMs,
      samples,
      ready,
      valid: !!previous,
      reason: ready ? 'measured' : reason,
      trainerXpGain: previous ? trainerXpGain : null,
      pokemonXpGain: previous ? pokemonXpGain : null,
      // This is a NET BALANCE CHANGE. Purchases/sales are included; it is not
      // gross hunt loot, profit, or an estimate of real-world earnings.
      goldDelta,
      trainerXpPerHour: hourly(trainerXpGain),
      pokemonXpPerHour: hourly(pokemonXpGain),
      goldPerHour: hourly(goldDelta),
      levelsGained: initial && previous ? previous.trainerLevel - initial.trainerLevel : 0,
    };
  }

  function update(snapshot) {
    if (!snapshot?.loggedIn) return reset('logged_out');
    if (!ACTIVE_STATUSES.has(snapshot.status)) return reset(snapshot.status || 'unavailable');
    if (!Number.isFinite(snapshot.at) || !snapshot.nick || !validProgress(trainerPoint(snapshot))) {
      return reset('invalid_snapshot');
    }
    if (!previous) return begin(snapshot);
    if (snapshot.at <= previous.at) return current();
    if (snapshot.nick !== previous.nick) return begin(snapshot, 'account_changed');
    if (snapshot.at - previous.at > maxGapMs) return begin(snapshot, 'observation_gap');
    if (snapshot.hunt !== previous.hunt) return begin(snapshot, 'hunt_changed');
    if ((snapshot.pokemon?.id ?? null) !== (previous.pokemon?.id ?? null)
      || (snapshot.pokemon?.name ?? null) !== (previous.pokemon?.name ?? null)) {
      return begin(snapshot, 'pokemon_changed');
    }

    const trainerDelta = xpDelta(trainerPoint(previous), trainerPoint(snapshot));
    if (trainerDelta === null) return begin(snapshot, 'xp_discontinuity');
    if (pokemonXpGain !== null) {
      const delta = xpDelta(pokemonPoint(previous), pokemonPoint(snapshot));
      if (delta === null) return begin(snapshot, 'pokemon_xp_discontinuity');
      pokemonXpGain += delta;
    }
    trainerXpGain += trainerDelta;
    previous = copy(snapshot);
    samples += 1;
    return current();
  }

  return { update, current, reset };
}

module.exports = { createFarmTracker, xpDelta };
