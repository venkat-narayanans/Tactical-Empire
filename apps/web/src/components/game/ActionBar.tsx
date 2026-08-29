import { CONFIG } from '@te/config';
import type { ClientGameState } from '@te/shared';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store/game-store.js';
import { displayName, formatMoney, isMyTurn, self } from '../../lib/view-helpers.js';
import { TerritoryEmblem } from '../board/TerritoryEmblem.js';
import { territoryOf } from '../../lib/view-helpers.js';

/**
 * The bottom bar carries exactly one primary action: the thing the player
 * should do right now. Everything else lives in the contextual panel.
 */
export function ActionBar({ game }: { readonly game: ClientGameState }) {
  const { send, animating } = useGameStore(useShallow((state) => ({
    send: state.send,
    animating: state.animating,
  })));

  const me = self(game);
  const myTurn = isMyTurn(game);
  const activePlayer = game.activePlayerId ? game.players[game.activePlayerId] : null;
  const pending = game.turn.pendingPurchase;

  if (game.phase === 'AUCTION') {
    return (
      <footer className="actionbar">
        <span className="actionbar__prompt">An auction is running — bid or pass in the panel.</span>
      </footer>
    );
  }

  if (game.phase === 'RESOLVING_DEBT' && game.pendingDebt) {
    const debtor = game.players[game.pendingDebt.playerId];
    return (
      <footer className="actionbar actionbar--alert">
        <span className="actionbar__prompt">
          {game.pendingDebt.playerId === game.viewerId
            ? `You owe ${formatMoney(game.pendingDebt.amount)}. Raise it or declare bankruptcy.`
            : `Waiting for ${debtor?.name ?? 'a player'} to settle ${formatMoney(game.pendingDebt.amount)}.`}
        </span>
      </footer>
    );
  }

  if (!myTurn) {
    return (
      <footer className="actionbar">
        <span className="actionbar__prompt">
          <span
            className="swatch swatch--sm"
            style={{ background: `var(--player-${activePlayer?.colour ?? 'slate'})` }}
            aria-hidden="true"
          />
          {activePlayer ? `${activePlayer.name}'s turn` : 'Waiting…'}
        </span>
        <span className="tiny muted">
          You can still propose trades and answer alliance requests.
        </span>
      </footer>
    );
  }

  if (me?.inDetention && !game.turn.hasRolled) {
    const fee = CONFIG.corner_rules.ig_signal.release_fee;
    return (
      <footer className="actionbar actionbar--mine">
        <span className="actionbar__prompt">You are held at IG Signal.</span>
        <div className="row">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={animating}
            onClick={() => void send('ROLL_DICE')}
          >
            Roll for a double
          </button>
          <button
            type="button"
            className="btn btn--lg"
            disabled={(me.cash ?? 0) < fee}
            onClick={() => void send('PAY_RELEASE_FEE')}
          >
            Pay {formatMoney(fee)}
          </button>
        </div>
      </footer>
    );
  }

  if (pending) {
    const territoryId = territoryOf(pending.propertyId);
    const affordable = (me?.cash ?? 0) >= pending.price;
    return (
      <footer className="actionbar actionbar--mine">
        <span className="actionbar__prompt">
          {territoryId ? <TerritoryEmblem territoryId={territoryId} size={18} /> : null}
          <strong>{displayName(pending.propertyId)}</strong> is available for{' '}
          {formatMoney(pending.price)}
        </span>
        <div className="row">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!affordable}
            onClick={() => void send('BUY_PROPERTY', { propertyId: pending.propertyId })}
          >
            Buy · {formatMoney(pending.price)}
          </button>
          <button
            type="button"
            className="btn btn--lg"
            onClick={() => void send('DECLINE_PROPERTY', { propertyId: pending.propertyId })}
          >
            {game.settings.auction ? 'Auction it' : 'Decline'}
          </button>
        </div>
        {!affordable ? <span className="tiny muted">You cannot afford it.</span> : null}
      </footer>
    );
  }

  if (!game.turn.hasRolled || game.turn.extraRollPending) {
    return (
      <footer className="actionbar actionbar--mine">
        <span className="actionbar__prompt">
          {game.turn.extraRollPending ? 'You rolled a double — roll again.' : 'Your turn'}
        </span>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          disabled={animating}
          onClick={() => void send('ROLL_DICE')}
        >
          Roll dice
        </button>
      </footer>
    );
  }

  return (
    <footer className="actionbar actionbar--mine">
      <span className="actionbar__prompt">
        Your turn — develop, trade, recruit or scout, then end your turn.
      </span>
      <button
        type="button"
        className="btn btn--primary btn--lg"
        disabled={animating}
        onClick={() => void send('END_TURN')}
      >
        End turn
      </button>
    </footer>
  );
}
