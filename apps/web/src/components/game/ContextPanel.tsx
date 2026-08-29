import type { ClientGameState } from '@te/shared';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store/game-store.js';
import type { ContextPanel as PanelKey } from '../../store/game-store.js';
import { isMyTurn } from '../../lib/view-helpers.js';
import { PropertyPanel } from './panels/PropertyPanel.js';
import { AuctionPanel } from './panels/AuctionPanel.js';
import { DebtPanel } from './panels/DebtPanel.js';
import { TradePanel } from './panels/TradePanel.js';
import { ArmyPanel } from './panels/ArmyPanel.js';
import { ScoutPanel } from './panels/ScoutPanel.js';
import { AlliancePanel } from './panels/AlliancePanel.js';
import { WarPanel } from './panels/WarPanel.js';
import { EventLog } from './EventLog.js';

/**
 * The right-hand panel is contextual: an auction or an unpaid debt takes it
 * over, otherwise the player chooses a strategic tab. Actions that are not
 * available right now are simply not rendered.
 */

const TABS: ReadonlyArray<{ key: PanelKey; label: string }> = [
  { key: 'auto', label: 'Board' },
  { key: 'trade', label: 'Trade' },
  { key: 'army', label: 'Army' },
  { key: 'scout', label: 'Scout' },
  { key: 'alliance', label: 'Alliance' },
  { key: 'war', label: 'War' },
];

export function ContextPanel({ game }: { readonly game: ClientGameState }) {
  const { panel, setPanel } = useGameStore(useShallow((state) => ({
    panel: state.panel,
    setPanel: state.setPanel,
  })));

  // Forced contexts: these suspend normal play, so they own the panel.
  if (game.phase === 'AUCTION' && game.auction) {
    return <AuctionPanel game={game} auction={game.auction} />;
  }
  if (game.phase === 'RESOLVING_DEBT' && game.pendingDebt) {
    return <DebtPanel game={game} debt={game.pendingDebt} />;
  }

  const pendingTrades = game.trades.filter((trade) => trade.toPlayerId === game.viewerId);
  const pendingAlliances = game.allianceRequests.filter(
    (request) => request.toPlayerId === game.viewerId,
  );

  return (
    <div className="stack">
      <nav className="tabs" aria-label="Strategic actions">
        {TABS.map((tab) => {
          const badge =
            tab.key === 'trade' && pendingTrades.length > 0
              ? pendingTrades.length
              : tab.key === 'alliance' && pendingAlliances.length > 0
                ? pendingAlliances.length
                : null;
          return (
            <button
              key={tab.key}
              type="button"
              className={`tab${panel === tab.key ? ' tab--active' : ''}`}
              aria-pressed={panel === tab.key}
              onClick={() => setPanel(tab.key)}
            >
              {tab.label}
              {badge ? <span className="badge badge--accent">{badge}</span> : null}
            </button>
          );
        })}
      </nav>

      {panel === 'auto' ? <PropertyPanel game={game} /> : null}
      {panel === 'trade' ? <TradePanel game={game} /> : null}
      {panel === 'army' ? <ArmyPanel game={game} /> : null}
      {panel === 'scout' ? <ScoutPanel game={game} /> : null}
      {panel === 'alliance' ? <AlliancePanel game={game} /> : null}
      {panel === 'war' ? <WarPanel game={game} /> : null}

      {panel !== 'auto' && !isMyTurn(game) && (panel === 'war' || panel === 'scout' || panel === 'army') ? (
        <p className="tiny muted panel__note">These actions are only available on your own turn.</p>
      ) : null}

      <EventLog game={game} />
    </div>
  );
}
