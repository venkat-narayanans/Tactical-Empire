import { useState } from 'react';
import { CONFIG } from '@te/config';
import type { ClientGameState, PlayerId } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import {
  attackableTerritories,
  declarationFeeHint,
  displayName,
  formatMoney,
  isMyTurn,
  opponents,
  self,
} from '../../../lib/view-helpers.js';
import { TerritoryEmblem } from '../../board/TerritoryEmblem.js';

/**
 * War.
 *
 * Target, then territory, then a confirmation showing your own power, the fee
 * and what capture would take. Enemy power is shown only if you have scouted
 * them - the panel never invents information the rules do not grant.
 */
export function WarPanel({ game }: { readonly game: ClientGameState }) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const myTurn = isMyTurn(game);

  const [targetId, setTargetId] = useState<PlayerId | ''>('');
  const [territoryId, setTerritoryId] = useState<string>('');
  const [confirming, setConfirming] = useState(false);

  const targets = opponents(game).filter(
    (player) => player.status === 'active' && player.propertyCount > 0,
  );
  const territories = targetId ? attackableTerritories(game, targetId) : [];
  const territory = territories.find((entry) => entry.id === territoryId) ?? null;
  const target = targetId ? game.players[targetId] : null;
  const report = targetId ? game.scoutReports.find((entry) => entry.targetId === targetId) : null;

  const summary = me?.armySummary;
  const attackPower = (summary?.availablePower ?? 0) + (summary?.borrowedPower ?? 0);
  const fee = territory ? declarationFeeHint(territory.value) : 0;
  const alreadyDeclared = game.turn.warsDeclaredThisTurn >= CONFIG.war.max_outgoing_wars_per_turn;
  const canDeclare =
    myTurn && !alreadyDeclared && attackPower > 0 && territory !== null && (me?.cash ?? 0) >= fee;

  const lastWar = game.wars[game.wars.length - 1];

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Declare war</span>
        </div>
        <div className="panel__body stack">
          <div className="field">
            <label htmlFor="war-target">Target</label>
            <select
              id="war-target"
              className="select"
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setTerritoryId('');
                setConfirming(false);
              }}
            >
              <option value="">Choose a player…</option>
              {targets.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </div>

          {targetId ? (
            <div className="field">
              <label htmlFor="war-territory">Territory</label>
              <select
                id="war-territory"
                className="select"
                value={territoryId}
                onChange={(event) => {
                  setTerritoryId(event.target.value);
                  setConfirming(false);
                }}
              >
                <option value="">Choose a territory…</option>
                {territories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id} — {entry.propertyIds.length} propert
                    {entry.propertyIds.length === 1 ? 'y' : 'ies'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {territory ? (
            <div className="stack war-summary">
              <div className="row">
                <TerritoryEmblem territoryId={territory.id} size={18} showLabel />
              </div>

              <dl className="stat-grid">
                <div>
                  <dt>Your power</dt>
                  <dd className="money money--lg">{attackPower}</dd>
                </div>
                <div>
                  <dt>Ally support</dt>
                  <dd>{summary?.borrowedPower ?? 0}</dd>
                </div>
                <div>
                  <dt>Enemy power</dt>
                  <dd>{report ? report.armyPower : 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Declaration fee</dt>
                  <dd>{formatMoney(fee)}</dd>
                </div>
              </dl>

              {!report ? (
                <p className="tiny muted">
                  Scout {target?.name ?? 'them'} first to learn their army strength.
                </p>
              ) : null}

              <div>
                <span className="panel__title">You would capture</span>
                <ul className="tiny">
                  {territory.propertyIds.map((id) => (
                    <li key={id}>{displayName(id)}</li>
                  ))}
                </ul>
              </div>

              <p className="tiny muted">
                The defender adds {Math.round(CONFIG.war.home_defense_bonus * 100)}% home defence
                plus their buildings, and both sides take casualties. Captured cities are war-damaged
                for {CONFIG.war.capture.war_damage_rounds} round.
              </p>

              {!confirming ? (
                <button
                  type="button"
                  className="btn btn--danger btn--block"
                  disabled={!canDeclare}
                  onClick={() => setConfirming(true)}
                >
                  Declare war
                </button>
              ) : (
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => {
                      setConfirming(false);
                      void send('DECLARE_WAR', {
                        targetPlayerId: targetId,
                        territoryId: territory.id,
                      });
                    }}
                  >
                    Confirm war
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              )}

              {alreadyDeclared ? (
                <p className="tiny muted">You have already declared war this turn.</p>
              ) : null}
              {!myTurn ? <p className="tiny muted">War is declared on your own turn.</p> : null}
              {attackPower === 0 ? (
                <p className="tiny muted">Recruit an army before declaring war.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {lastWar ? (
        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">Last war</span>
            <span
              className={`badge ${lastWar.outcome === 'attacker_victory' ? 'badge--danger' : 'badge--positive'}`}
            >
              {lastWar.outcome === 'attacker_victory' ? 'Attacker won' : 'Defender held'}
            </span>
          </div>
          <div className="panel__body stack">
            <p className="tiny">
              {game.players[lastWar.attackerId]?.name ?? 'Attacker'} attacked{' '}
              {game.players[lastWar.defenderId]?.name ?? 'Defender'} in {lastWar.territoryId}.
            </p>
            <dl className="stat-grid stat-grid--tight">
              <div>
                <dt>Attack</dt>
                <dd>{lastWar.attackerFinalPower}</dd>
              </div>
              <div>
                <dt>Defence</dt>
                <dd>{lastWar.defenderFinalPower}</dd>
              </div>
              <div>
                <dt>Attacker losses</dt>
                <dd>{lastWar.casualties.attackerPowerLost}</dd>
              </div>
              <div>
                <dt>Defender losses</dt>
                <dd>{lastWar.casualties.defenderPowerLost}</dd>
              </div>
            </dl>
            {lastWar.capturedPropertyIds.length > 0 ? (
              <p className="tiny">
                Captured: {lastWar.capturedPropertyIds.map(displayName).join(', ')}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
