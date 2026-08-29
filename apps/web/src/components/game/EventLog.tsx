import type { ClientGameState } from '@te/shared';
import { useGameStore } from '../../store/game-store.js';
import { displayName, formatMoney } from '../../lib/view-helpers.js';

/** A short, scrollable history so a returning player can catch up. */
export function EventLog({ game }: { readonly game: ClientGameState }) {
  const recentEvents = useGameStore((state) => state.recentEvents);
  const entries = [...recentEvents].reverse().slice(0, 25);

  return (
    <section className="panel">
      <div className="panel__header">
        <span className="panel__title">Recent events</span>
      </div>
      <ul className="event-log scroll-y">
        {entries.map((event) => {
          const line = summarise(game, event.type, event.payload as Record<string, unknown>);
          if (!line) return null;
          return (
            <li key={event.eventId} className="event-log__item tiny">
              <span className="event-log__seq">#{event.sequence}</span>
              {line}
            </li>
          );
        })}
        {entries.length === 0 ? (
          <li className="event-log__item tiny muted">Nothing has happened yet.</li>
        ) : null}
      </ul>
    </section>
  );
}

function summarise(
  game: ClientGameState,
  type: string,
  payload: Record<string, unknown>,
): string | null {
  const name = (id: unknown): string =>
    typeof id === 'string' ? (game.players[id]?.name ?? 'A player') : 'A player';
  const property = (id: unknown): string => (typeof id === 'string' ? displayName(id) : 'a property');
  const money = (value: unknown): string =>
    typeof value === 'number' ? formatMoney(value) : '₹0';

  switch (type) {
    case 'TurnStarted':
      return `${name(payload['playerId'])} started their turn`;
    case 'DiceRolled': {
      const dice = payload['dice'] as { die1: number; die2: number; total: number } | undefined;
      return dice ? `${name(payload['playerId'])} rolled ${dice.die1}+${dice.die2} = ${dice.total}` : null;
    }
    case 'PropertyPurchased':
      return `${name(payload['playerId'])} bought ${property(payload['propertyId'])} for ${money(payload['price'])}`;
    case 'RentPaid':
      return `${name(payload['payerId'])} paid ${money(payload['amount'])} to ${name(payload['ownerId'])}`;
    case 'PropertyDeveloped':
      return `${name(payload['playerId'])} developed ${property(payload['propertyId'])}`;
    case 'BuildingSold':
      return `${name(payload['playerId'])} sold a building on ${property(payload['propertyId'])}`;
    case 'PropertyMortgaged':
      return `${name(payload['playerId'])} mortgaged ${property(payload['propertyId'])}`;
    case 'PropertyUnmortgaged':
      return `${name(payload['playerId'])} lifted the mortgage on ${property(payload['propertyId'])}`;
    case 'AuctionStarted':
      return `Auction started for ${property(payload['propertyId'])}`;
    case 'BidPlaced':
      return `${name(payload['playerId'])} bid ${money(payload['amount'])}`;
    case 'AuctionEnded':
      return payload['winnerId']
        ? `${name(payload['winnerId'])} won the auction for ${money(payload['amount'])}`
        : `${property(payload['propertyId'])} went unsold`;
    case 'TradeExecuted':
      return `${name(payload['fromPlayerId'])} and ${name(payload['toPlayerId'])} completed a trade`;
    case 'ArmyUnitPurchased':
      return `${name(payload['playerId'])} recruited ${String(payload['quantity'])}× ${String(payload['unitType'])}`;
    case 'ArmySupportCommitted':
      return `${name(payload['fromPlayerId'])} lent ${String(payload['power'])} power to ${name(payload['toPlayerId'])}`;
    case 'AllianceAccepted':
      return 'An alliance was formed';
    case 'AllianceExpired':
      return 'An alliance ended';
    case 'WarDeclared':
      return `${name(payload['attackerId'])} declared war on ${name(payload['defenderId'])} in ${String(payload['territoryId'])}`;
    case 'WarResolved':
      return payload['outcome'] === 'attacker_victory'
        ? `${name(payload['attackerId'])} won the war`
        : `${name(payload['defenderId'])} held their territory`;
    case 'TerritoryCaptured':
      return `${name(payload['toPlayerId'])} captured ${String(payload['territoryId'])}`;
    case 'StartBonusPaid':
      return `${name(payload['playerId'])} passed START and collected ${money(payload['amount'])}`;
    case 'FeePaid':
      return `${name(payload['playerId'])} paid a fee of ${money(payload['amount'])}`;
    case 'SpecialReward':
      return `${name(payload['playerId'])} received ${money(payload['amount'])}`;
    case 'SpecialPenalty':
      return `${name(payload['playerId'])} lost ${money(payload['amount'])}`;
    case 'PlayerDetained':
      return `${name(payload['playerId'])} was sent to IG Signal`;
    case 'PlayerReleased':
      return `${name(payload['playerId'])} left IG Signal`;
    case 'PlayerBankrupt':
      return `${name(payload['playerId'])} went bankrupt`;
    case 'RoundAdvanced':
      return `Round ${String(payload['round'])} began`;
    case 'ScoutCompleted':
      return `Scout report on ${name(payload['targetId'])}`;
    case 'VictoryDeclared':
      return 'The game ended';
    default:
      return null;
  }
}
