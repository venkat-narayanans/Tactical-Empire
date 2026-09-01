import {
  CITY_BY_ID,
  CONFIG,
  SPECIAL_BY_ID,
  TERRITORIES,
  TERRITORY_BY_ID,
  propertyDisplayName,
  propertyPrice,
} from '@te/config';
import type { ClientGameState, ClientPlayerView, PlayerId, PropertyState } from '@te/shared';

/**
 * Presentation helpers.
 *
 * Everything here is for display or for disabling a control the server would
 * reject anyway. None of it decides an outcome: the server revalidates every
 * command, so a stale hint can only ever cost a rejected click.
 */

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function playerColourVar(player: ClientPlayerView | undefined): string {
  return `var(--player-${player?.colour ?? 'slate'})`;
}

export function displayName(propertyId: string): string {
  return propertyDisplayName(propertyId);
}

export function priceOf(propertyId: string): number {
  return propertyPrice(propertyId);
}

export function territoryOf(propertyId: string): string | null {
  return CITY_BY_ID.get(propertyId)?.territoryId ?? null;
}

export function isCityId(propertyId: string): boolean {
  return CITY_BY_ID.has(propertyId);
}

export function self(game: ClientGameState): ClientPlayerView | undefined {
  return game.players[game.viewerId];
}

export function isMyTurn(game: ClientGameState): boolean {
  return game.activePlayerId === game.viewerId;
}

export function propertiesOf(game: ClientGameState, playerId: PlayerId): PropertyState[] {
  return Object.values(game.properties).filter((property) => property.owner === playerId);
}

export function opponents(game: ClientGameState): ClientPlayerView[] {
  return game.turnOrder
    .map((id) => game.players[id])
    .filter((p): p is ClientPlayerView => p !== undefined && p.id !== game.viewerId);
}

export function orderedPlayers(game: ClientGameState): ClientPlayerView[] {
  return game.turnOrder
    .map((id) => game.players[id])
    .filter((p): p is ClientPlayerView => p !== undefined);
}

/** Rent the client shows for an owned city, read straight from the config table. */
export function displayRent(game: ClientGameState, propertyId: string): number | null {
  const property = game.properties[propertyId];
  if (!property?.owner) return null;
  if (property.mortgaged) return 0;
  const city = CITY_BY_ID.get(propertyId);
  if (!city) return null;
  let rent = city.rent[property.level] ?? city.baseRent;
  if (property.level === 0 && game.settings.fullSetX2Rent && ownsSet(game, property.owner, city.territoryId)) {
    rent *= city.fullSetUndevelopedMultiplier;
  }
  if (property.warDamagedUntilRound > game.round) {
    rent = Math.round(rent * CONFIG.war.capture.war_damage_rent_multiplier);
  }
  return rent;
}

export function ownsSet(game: ClientGameState, playerId: PlayerId, territoryId: string): boolean {
  const territory = TERRITORY_BY_ID.get(territoryId);
  if (!territory) return false;
  return territory.cities.every((cityId) => game.properties[cityId]?.owner === playerId);
}

export function houseCostFor(propertyId: string): number {
  return CITY_BY_ID.get(propertyId)?.houseCost ?? 0;
}

export function mortgageValueOf(propertyId: string): number {
  return Math.floor(propertyPrice(propertyId) * CONFIG.mortgage.mortgage_percentage);
}

export function unmortgageCostOf(propertyId: string): number {
  return Math.ceil(mortgageValueOf(propertyId) * (1 + CONFIG.mortgage.unmortgage_interest));
}

/** What selling one building back returns, per GAME_CONFIG.development. */
export function buildingRefundOf(propertyId: string): number {
  return Math.floor(houseCostFor(propertyId) * CONFIG.development.resale_percentage);
}

/** "1 property" / "3 properties" - used wherever a count is shown inline. */
export function pluralise(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function developmentLabel(level: number): string {
  if (level === 0) return 'Undeveloped';
  if (level === 5) return 'Hotel';
  return `${level} house${level > 1 ? 's' : ''}`;
}

/** Whether the BUILD control should be offered, mirroring the engine's rules. */
export function canBuildHint(game: ClientGameState, propertyId: string): boolean {
  const property = game.properties[propertyId];
  const city = CITY_BY_ID.get(propertyId);
  const me = self(game);
  if (!property || !city || !me) return false;
  if (property.owner !== me.id || property.level >= 5 || property.mortgaged) return false;
  if (!ownsSet(game, me.id, city.territoryId)) return false;
  if (property.warDamagedUntilRound > game.round) return false;
  const setCities = TERRITORY_BY_ID.get(city.territoryId)?.cities ?? [];
  if (setCities.some((id) => game.properties[id]?.mortgaged)) return false;
  if (game.settings.evenBuild) {
    const levels = setCities.map((id) => game.properties[id]?.level ?? 0);
    const minLevel = Math.min(...levels);
    if (property.level - minLevel >= CONFIG.development.even_build_max_level_difference) return false;
  }
  return (me.cash ?? 0) >= city.houseCost;
}

/** Territories where a target owns at least one property, for the war panel. */
export function attackableTerritories(
  game: ClientGameState,
  targetId: PlayerId,
): Array<{ id: string; name: string; propertyIds: string[]; value: number }> {
  return TERRITORIES.map((territory) => {
    const propertyIds = territory.cities.filter(
      (cityId) => game.properties[cityId]?.owner === targetId,
    );
    return {
      id: territory.id,
      name: territory.name,
      propertyIds,
      value: propertyIds.reduce((sum, id) => sum + propertyPrice(id), 0),
    };
  }).filter((territory) => territory.propertyIds.length > 0);
}

export function declarationFeeHint(territoryValue: number): number {
  return Math.min(Math.max(Math.round(territoryValue * 0.1), 100), 250);
}

export function specialGroupOf(propertyId: string): string | null {
  return SPECIAL_BY_ID.get(propertyId)?.group ?? null;
}

export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
