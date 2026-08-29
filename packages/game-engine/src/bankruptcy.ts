import { CONFIG } from '@te/config';
import type { PlayerId } from '@te/shared';
import { ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import { liquidationValue, propertiesOwnedBy } from './selectors.js';
import { cancelTradesFor } from './trade.js';
import { endAlliancesFor } from './alliance.js';
import { releaseAllLentUnits } from './army.js';
import { checkVictory } from './victory.js';
import { advanceToNextPlayer } from './turn.js';

/**
 * Debt and bankruptcy.
 *
 * A charge the player cannot cover puts the game into RESOLVING_DEBT. They may
 * sell buildings, mortgage, sell army or trade to raise the money, then settle.
 * If they cannot or will not, DECLARE_BANKRUPTCY liquidates them to the
 * creditor and eliminates them.
 */

export function settleDebt(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const debt = state.pendingDebt;
  if (!debt) throw ruleError('INVALID_PHASE', 'You have no outstanding debt.');
  if (debt.playerId !== playerId) throw ruleError('INVALID_PHASE', 'That debt is not yours.');

  const player = ctx.player(playerId);
  if (player.cash < debt.amount) {
    throw ruleError(
      'INSUFFICIENT_FUNDS',
      `You still need ₹${debt.amount - player.cash} to settle this debt.`,
    );
  }

  player.cash -= debt.amount;
  if (debt.creditorId) {
    ctx.credit(debt.creditorId, debt.amount);
    const creditor = state.players[debt.creditorId];
    if (creditor) creditor.stats.rentCollected += debt.reason === 'rent' ? debt.amount : 0;
    player.stats.rentPaid += debt.reason === 'rent' ? debt.amount : 0;
  } else if (state.settings.vacationCash && CONFIG.fees.vacation_cash_routes_fee_to_pot) {
    state.pot += debt.amount;
  }

  ctx.emit('DebtSettled', { playerId, amount: debt.amount, creditorId: debt.creditorId });
  clearDebt(ctx);
}

function clearDebt(ctx: EngineContext): void {
  const { state } = ctx;
  const restore = state.debtReturnPhase ?? 'ACTION';
  state.pendingDebt = null;
  state.debtReturnPhase = null;
  ctx.setPhase(restore === 'RESOLVING_DEBT' ? 'ACTION' : restore);
}

/** True when the player has no legal way to raise the money they owe. */
export function isHopelesslyIndebted(ctx: EngineContext, playerId: PlayerId): boolean {
  const debt = ctx.state.pendingDebt;
  if (!debt || debt.playerId !== playerId) return false;
  const player = ctx.player(playerId);
  return player.cash + liquidationValue(ctx.state, player) < debt.amount;
}

export function declareBankruptcy(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = ctx.player(playerId);
  if (player.status !== 'active') throw ruleError('PLAYER_BANKRUPT', 'You are already out of the game.');
  const debt = state.pendingDebt;
  if (!debt || debt.playerId !== playerId) {
    throw ruleError('INVALID_PHASE', 'You can only declare bankruptcy against an outstanding debt.');
  }
  bankruptPlayer(ctx, playerId, debt.creditorId);
}

/** Liquidates a player to their creditor (or the bank) and eliminates them. */
export function bankruptPlayer(
  ctx: EngineContext,
  playerId: PlayerId,
  creditorId: PlayerId | null,
): void {
  const { state } = ctx;
  const player = ctx.player(playerId);

  // Cancel every commitment this player is part of before moving assets.
  cancelTradesFor(ctx, playerId);
  endAlliancesFor(ctx, playerId);
  releaseAllLentUnits(ctx, playerId);

  const creditor = creditorId ? state.players[creditorId] : undefined;
  const properties = propertiesOwnedBy(state, playerId);

  if (creditor && creditor.status === 'active') {
    creditor.cash += player.cash;
    for (const property of properties) {
      property.owner = creditorId;
      // Buildings do not transfer: the creditor receives the land only.
      property.level = 0;
    }
    if (CONFIG.bankruptcy.army_transfer_to_creditor) {
      for (const unit of player.army) {
        unit.state = 'active';
        unit.lentTo = null;
        creditor.army.push(unit);
      }
    }
  } else if (CONFIG.bankruptcy.bank_assets_return_to_unowned) {
    for (const property of properties) {
      property.owner = null;
      property.level = 0;
      property.mortgaged = false;
      property.warDamagedUntilRound = 0;
    }
  }

  player.cash = 0;
  player.army = [];
  player.status = 'bankrupt';
  player.inDetention = false;

  state.pendingDebt = null;
  state.debtReturnPhase = null;

  ctx.emit('PlayerBankrupt', { playerId, creditorId });
  if (CONFIG.bankruptcy.player_eliminated) {
    ctx.emit('PlayerEliminated', { playerId });
  }

  if (checkVictory(ctx, 'last_player_standing')) return;

  // If the bankrupt player was mid-turn, hand play on.
  const wasActive = state.turnOrder[state.activePlayerIndex] === playerId;
  ctx.setPhase('ACTION');
  if (wasActive) {
    ctx.emit('TurnEnded', { playerId });
    advanceToNextPlayer(ctx);
  }
}
