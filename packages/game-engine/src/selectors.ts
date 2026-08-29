import {
  ARMY_UNIT_BY_ID,
  CITY_BY_ID,
  CONFIG,
  SPECIAL_BY_ID,
  TERRITORIES,
  TERRITORY_BY_ID,
  isCity,
  propertyPrice,
} from '@te/config';
import type { CityDefinition } from '@te/config';
import type {
  ArmySummary,
  ArmyUnit,
  FinalScore,
  GameState,
  PlayerId,
  PlayerState,
  PropertyId,
  PropertyState,
  TerritoryId,
} from '@te/shared';
import { percentOf } from '@te/shared';

/**
 * Derived reads over authoritative state. Nothing here mutates. Anything the
 * rules describe as "derived" (army power, territory completion, capacity,
 * net worth) is computed here so it can never drift out of sync with a stored
 * copy.
 */

export function activePlayerId(state: GameState): PlayerId | null {
  return state.turnOrder[state.activePlayerIndex] ?? null;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState | undefined {
  return state.players[playerId];
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.turnOrder
    .map((id) => state.players[id])
    .filter((p): p is PlayerState => p !== undefined && p.status === 'active');
}

export function propertiesOwnedBy(state: GameState, playerId: PlayerId): PropertyState[] {
  return Object.values(state.properties).filter((p) => p.owner === playerId);
}

export function citiesOwnedBy(state: GameState, playerId: PlayerId): PropertyState[] {
  return propertiesOwnedBy(state, playerId).filter((p) => isCity(p.id));
}

export function citiesInTerritory(state: GameState, territoryId: TerritoryId): PropertyState[] {
  const territory = TERRITORY_BY_ID.get(territoryId);
  if (!territory) return [];
  return territory.cities
    .map((cityId) => state.properties[cityId])
    .filter((p): p is PropertyState => p !== undefined);
}

/** Territory completion is derived purely from city ownership. */
export function ownsCompleteTerritory(
  state: GameState,
  playerId: PlayerId,
  territoryId: TerritoryId,
): boolean {
  const cities = citiesInTerritory(state, territoryId);
  const territory = TERRITORY_BY_ID.get(territoryId);
  if (!territory || cities.length !== territory.size) return false;
  return cities.every((c) => c.owner === playerId);
}

export function completedTerritories(state: GameState, playerId: PlayerId): TerritoryId[] {
  return TERRITORIES.filter((t) => ownsCompleteTerritory(state, playerId, t.id)).map((t) => t.id);
}

export function unitPower(unit: ArmyUnit): number {
  return ARMY_UNIT_BY_ID.get(unit.type)?.power ?? 0;
}

export function unitCost(unitType: string): number {
  return ARMY_UNIT_BY_ID.get(unitType)?.cost ?? 0;
}

/** Total power of every unit the player owns, lent or not. */
export function totalArmyPower(player: PlayerState): number {
  return player.army.reduce((sum, unit) => sum + unitPower(unit), 0);
}

/** Power of units that are not currently committed to an ally. */
export function availableArmyPower(player: PlayerState): number {
  return player.army
    .filter((unit) => unit.state === 'active')
    .reduce((sum, unit) => sum + unitPower(unit), 0);
}

/** Power this player has lent out to allies. */
export function committedArmyPower(player: PlayerState): number {
  return player.army
    .filter((unit) => unit.state === 'lent')
    .reduce((sum, unit) => sum + unitPower(unit), 0);
}

/** Power lent *to* this player by allies, usable in their battles. */
export function borrowedArmyPower(state: GameState, playerId: PlayerId): number {
  let power = 0;
  for (const other of Object.values(state.players)) {
    if (other.id === playerId) continue;
    for (const unit of other.army) {
      if (unit.state === 'lent' && unit.lentTo === playerId) power += unitPower(unit);
    }
  }
  return power;
}

export function borrowedUnits(state: GameState, playerId: PlayerId): ArmyUnit[] {
  const units: ArmyUnit[] = [];
  for (const other of Object.values(state.players)) {
    if (other.id === playerId) continue;
    for (const unit of other.army) {
      if (unit.state === 'lent' && unit.lentTo === playerId) units.push(unit);
    }
  }
  return units;
}

/** Base capacity plus one per two owned cities, clamped to the configured max. */
export function armyCapacity(state: GameState, playerId: PlayerId): number {
  const cityCount = citiesOwnedBy(state, playerId).length;
  const bonus =
    Math.floor(cityCount / 2) * CONFIG.army.additional_capacity_per_2_cities;
  return Math.min(CONFIG.army.base_capacity + bonus, CONFIG.army.max_capacity);
}

export function armyUnitCounts(player: PlayerState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of player.army) {
    counts[unit.type] = (counts[unit.type] ?? 0) + 1;
  }
  return counts;
}

export function armySummary(state: GameState, player: PlayerState): ArmySummary {
  return {
    totalUnits: player.army.length,
    activeUnits: player.army.filter((u) => u.state === 'active').length,
    lentUnits: player.army.filter((u) => u.state === 'lent').length,
    totalPower: totalArmyPower(player),
    availablePower: availableArmyPower(player),
    committedPower: committedArmyPower(player),
    borrowedPower: borrowedArmyPower(state, player.id),
    capacity: armyCapacity(state, player.id),
    unitCounts: armyUnitCounts(player),
  };
}

export function activeAllianceFor(state: GameState, playerId: PlayerId) {
  return Object.values(state.alliances).find(
    (alliance) => alliance.active && alliance.playerIds.includes(playerId),
  );
}

export function allyOf(state: GameState, playerId: PlayerId): PlayerId | null {
  const alliance = activeAllianceFor(state, playerId);
  if (!alliance) return null;
  return alliance.playerIds[0] === playerId ? alliance.playerIds[1] : alliance.playerIds[0];
}

export function cityDefinition(propertyId: PropertyId): CityDefinition | undefined {
  return CITY_BY_ID.get(propertyId);
}

export function houseCostFor(propertyId: PropertyId): number {
  const city = CITY_BY_ID.get(propertyId);
  if (!city) return 0;
  return city.houseCost;
}

/** Number of properties in a special-property group owned by one player. */
export function specialGroupCount(state: GameState, playerId: PlayerId, group: string): number {
  let count = 0;
  for (const special of SPECIAL_BY_ID.values()) {
    if (special.group !== group) continue;
    if (state.properties[special.id]?.owner === playerId) count += 1;
  }
  return count;
}

export function isWarDamaged(state: GameState, property: PropertyState): boolean {
  return property.warDamagedUntilRound > state.round;
}

/** Total value of a player's buildings at purchase cost. */
export function buildingValue(state: GameState, playerId: PlayerId): number {
  let value = 0;
  for (const property of citiesOwnedBy(state, playerId)) {
    value += property.level * houseCostFor(property.id);
  }
  return value;
}

export function propertyPortfolioValue(state: GameState, playerId: PlayerId): number {
  return propertiesOwnedBy(state, playerId).reduce(
    (sum, property) => sum + (property.mortgaged ? 0 : propertyPrice(property.id)),
    0,
  );
}

export function armyValue(player: PlayerState): number {
  return player.army.reduce((sum, unit) => sum + unitCost(unit.type), 0);
}

/**
 * Cash a player could raise right now without trading: building resale plus
 * mortgage proceeds plus army resale. Used to decide whether a debt is
 * survivable or terminal.
 */
export function liquidationValue(state: GameState, player: PlayerState): number {
  let total = 0;
  for (const property of propertiesOwnedBy(state, player.id)) {
    total += percentOf(property.level * houseCostFor(property.id), CONFIG.development.resale_percentage);
    if (state.settings.mortgage && !property.mortgaged) {
      total += percentOf(propertyPrice(property.id), CONFIG.mortgage.mortgage_percentage);
    }
  }
  total += percentOf(armyValue(player), CONFIG.army.resale_percentage);
  return total;
}

export function territoryBonusTotal(state: GameState, playerId: PlayerId): number {
  return completedTerritories(state, playerId).reduce(
    (sum, id) => sum + (TERRITORY_BY_ID.get(id)?.bonus ?? 0),
    0,
  );
}

/**
 * Final score per GAME_CONFIG.victory: cash, property value, building value,
 * army value and territory bonuses, each weighted by `final_score` and scaled
 * by `asset_valuation`.
 */
export function finalScoreFor(state: GameState, player: PlayerState): FinalScore {
  const weights = CONFIG.victory.final_score;
  const valuation = CONFIG.victory.asset_valuation;
  const cash = player.cash * (weights['cash'] ?? 1);
  const propertyValue = propertyPortfolioValue(state, player.id) * valuation.property * (weights['property_value'] ?? 1);
  const buildingVal = buildingValue(state, player.id) * valuation.buildings * (weights['building_value'] ?? 1);
  const armyVal = armyValue(player) * valuation.army * (weights['army_value'] ?? 1);
  const territoryBonus = territoryBonusTotal(state, player.id) * (weights['territory_bonus'] ?? 1);
  return {
    playerId: player.id,
    cash: Math.round(cash),
    propertyValue: Math.round(propertyValue),
    buildingValue: Math.round(buildingVal),
    armyValue: Math.round(armyVal),
    territoryBonus: Math.round(territoryBonus),
    total: Math.round(cash + propertyValue + buildingVal + armyVal + territoryBonus),
    completedTerritories: completedTerritories(state, player.id).length,
    armyPower: totalArmyPower(player),
  };
}
