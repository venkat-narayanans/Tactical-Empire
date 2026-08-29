import { describe, expect, it } from 'vitest';
import { CITY_BY_ID, CONFIG } from '@te/config';
import { AUCTION_DURATION_SECONDS } from '@te/game-engine';
import { Harness, harnessLandingOn } from '../helpers/engine-harness.js';

const MADAGADIPET = CITY_BY_ID.get('madagadipet')!;

function auctionInProgress() {
  const { h, activeId } = harnessLandingOn(MADAGADIPET.boardIndex, {
    names: ['Ana', 'Ben', 'Cat'],
  });
  h.run(activeId, 'ROLL_DICE');
  h.run(activeId, 'DECLINE_PROPERTY', { propertyId: 'madagadipet' });
  const auction = h.state.auction;
  if (!auction) throw new Error('expected an auction to start');
  return { h, activeId, auctionId: auction.id };
}

describe('auctions', () => {
  it('starts when the landing player declines a property', () => {
    const { h, auctionId } = auctionInProgress();
    expect(h.state.phase).toBe('AUCTION');
    expect(h.state.auction?.propertyId).toBe('madagadipet');
    expect(h.state.auction?.activeBidders).toHaveLength(3);
    expect(h.lastEvent('AuctionStarted')?.payload).toMatchObject({ auctionId });
  });

  it('rejects a bid that does not beat the current bid', () => {
    const { h, auctionId } = auctionInProgress();
    const [a, b] = h.state.turnOrder as [string, string];
    h.run(a, 'PLACE_BID', { auctionId, amount: 100 });
    expect(h.expectRejected(b, 'PLACE_BID', { auctionId, amount: 100 })).toBe('INVALID_BID');
    expect(h.expectRejected(b, 'PLACE_BID', { auctionId, amount: 50 })).toBe('INVALID_BID');
  });

  it('rejects a bid above the bidder cash', () => {
    const { h, auctionId } = auctionInProgress();
    const [a] = h.state.turnOrder as [string];
    expect(h.expectRejected(a, 'PLACE_BID', { auctionId, amount: 99999 })).toBe(
      'INSUFFICIENT_FUNDS',
    );
  });

  it('extends the deadline when a bid lands inside the anti-snipe window', () => {
    const { h, auctionId } = auctionInProgress();
    const [a] = h.state.turnOrder as [string];
    h.advanceClock((AUCTION_DURATION_SECONDS - 1) * 1000);
    h.run(a, 'PLACE_BID', { auctionId, amount: 60 });
    const expectedFloor = h.now() + CONFIG.auction.anti_sniping_extension_seconds * 1000;
    expect(h.state.auction?.endsAt).toBe(expectedFloor);
  });

  it('awards the property to the highest bidder and charges exactly the bid', () => {
    const { h, auctionId } = auctionInProgress();
    const [a, b, c] = h.state.turnOrder as [string, string, string];
    h.run(a, 'PLACE_BID', { auctionId, amount: 100 });
    h.run(b, 'PLACE_BID', { auctionId, amount: 150 });
    const winnerCash = h.player(b).cash;
    h.run(a, 'PASS_AUCTION', { auctionId });
    h.run(c, 'PASS_AUCTION', { auctionId });

    expect(h.state.auction).toBeNull();
    expect(h.property('madagadipet').owner).toBe(b);
    expect(h.player(b).cash).toBe(winnerCash - 150);
    expect(h.lastEvent('AuctionEnded')?.payload).toMatchObject({ winnerId: b, amount: 150 });
  });

  it('leaves the property unowned when nobody bids', () => {
    const { h, auctionId } = auctionInProgress();
    for (const bidder of [...(h.state.auction?.activeBidders ?? [])]) {
      if (h.state.auction?.id !== auctionId) break;
      h.run(bidder, 'PASS_AUCTION', { auctionId });
    }
    expect(h.state.auction).toBeNull();
    expect(h.property('madagadipet').owner).toBeNull();
  });

  it('closes on the timer and awards the standing high bid', () => {
    const { h, auctionId } = auctionInProgress();
    const [a] = h.state.turnOrder as [string];
    h.run(a, 'PLACE_BID', { auctionId, amount: 120 });
    h.advanceClock(AUCTION_DURATION_SECONDS * 1000 + 6000);
    h.tick();
    expect(h.state.auction).toBeNull();
    expect(h.property('madagadipet').owner).toBe(a);
  });

  it('rejects bids from a player who already passed', () => {
    const { h, auctionId } = auctionInProgress();
    const [a] = h.state.turnOrder as [string];
    h.run(a, 'PASS_AUCTION', { auctionId });
    expect(h.expectRejected(a, 'PLACE_BID', { auctionId, amount: 500 })).toBe('INVALID_BID');
  });
});

describe('trading', () => {
  function twoPlayers() {
    const h = new Harness({ seed: 31 });
    const [a, b] = h.start(['Ana', 'Ben']) as [string, string];
    return { h, a, b };
  }

  it('executes an accepted trade atomically', () => {
    const { h, a, b } = twoPlayers();
    h.giveProperty(a, 'madagadipet');
    h.giveProperty(b, 'villianur');
    const cashA = h.player(a).cash;
    const cashB = h.player(b).cash;

    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 200, properties: ['madagadipet'] },
      requested: { cash: 0, properties: ['villianur'] },
    });
    const tradeId = Object.keys(h.state.trades)[0]!;
    h.run(b, 'ACCEPT_TRADE', { tradeId });

    expect(h.property('madagadipet').owner).toBe(b);
    expect(h.property('villianur').owner).toBe(a);
    expect(h.player(a).cash).toBe(cashA - 200);
    expect(h.player(b).cash).toBe(cashB + 200);
    expect(h.lastEvent('TradeExecuted')).toBeDefined();
  });

  it('refuses a trade offering an asset the sender does not own', () => {
    const { h, a, b } = twoPlayers();
    expect(
      h.expectRejected(a, 'CREATE_TRADE', {
        targetPlayerId: b,
        offered: { cash: 0, properties: ['white_town'] },
        requested: { cash: 0, properties: [] },
      }),
    ).toBe('INVALID_TRADE');
  });

  it('refuses a trade offering more cash than the sender holds', () => {
    const { h, a, b } = twoPlayers();
    expect(
      h.expectRejected(a, 'CREATE_TRADE', {
        targetPlayerId: b,
        offered: { cash: 999999, properties: [] },
        requested: { cash: 0, properties: [] },
      }),
    ).toBe('INVALID_TRADE');
  });

  it('revalidates at acceptance and rejects when ownership changed', () => {
    const { h, a, b } = twoPlayers();
    h.giveProperty(a, 'madagadipet');
    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 0, properties: ['madagadipet'] },
      requested: { cash: 100, properties: [] },
    });
    const tradeId = Object.keys(h.state.trades)[0]!;
    // The asset moves before the offer is answered.
    h.giveProperty(b, 'madagadipet');
    expect(h.expectRejected(b, 'ACCEPT_TRADE', { tradeId })).toBe('INVALID_TRADE');
    expect(h.state.trades[tradeId]?.status).toBe('pending');
  });

  it('executes at most once even if accepted twice', () => {
    const { h, a, b } = twoPlayers();
    h.giveProperty(a, 'madagadipet');
    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 0, properties: ['madagadipet'] },
      requested: { cash: 100, properties: [] },
    });
    const tradeId = Object.keys(h.state.trades)[0]!;
    const cashB = h.player(b).cash;
    h.run(b, 'ACCEPT_TRADE', { tradeId });
    expect(h.expectRejected(b, 'ACCEPT_TRADE', { tradeId })).toBe('INVALID_TRADE');
    expect(h.player(b).cash).toBe(cashB - 100);
    expect(h.eventsOfType('TradeExecuted')).toHaveLength(1);
  });

  it('ignores a duplicate ACCEPT_TRADE carrying the same requestId', () => {
    const { h, a, b } = twoPlayers();
    h.giveProperty(a, 'madagadipet');
    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 0, properties: ['madagadipet'] },
      requested: { cash: 100, properties: [] },
    });
    const tradeId = Object.keys(h.state.trades)[0]!;
    const cashB = h.player(b).cash;
    h.run(b, 'ACCEPT_TRADE', { tradeId }, 'fixed-request-id');
    h.run(b, 'ACCEPT_TRADE', { tradeId }, 'fixed-request-id');
    expect(h.player(b).cash).toBe(cashB - 100);
    expect(h.eventsOfType('TradeExecuted')).toHaveLength(1);
  });

  it('lets the sender cancel and the receiver reject', () => {
    const { h, a, b } = twoPlayers();
    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 100, properties: [] },
      requested: { cash: 0, properties: [] },
    });
    const first = Object.keys(h.state.trades)[0]!;
    h.run(a, 'CANCEL_TRADE', { tradeId: first });
    expect(h.state.trades[first]?.status).toBe('cancelled');

    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 100, properties: [] },
      requested: { cash: 0, properties: [] },
    });
    const second = Object.keys(h.state.trades).find((id) => id !== first)!;
    h.run(b, 'REJECT_TRADE', { tradeId: second });
    expect(h.state.trades[second]?.status).toBe('rejected');
  });

  it('refuses to trade a developed property', () => {
    const { h, a, b } = twoPlayers();
    h.giveProperty(a, 'madagadipet', 2);
    expect(
      h.expectRejected(a, 'CREATE_TRADE', {
        targetPlayerId: b,
        offered: { cash: 0, properties: ['madagadipet'] },
        requested: { cash: 0, properties: [] },
      }),
    ).toBe('INVALID_TRADE');
  });

  it('does not let a third party accept somebody else offer', () => {
    const h = new Harness({ seed: 12 });
    const [a, b, c] = h.start(['Ana', 'Ben', 'Cat']) as [string, string, string];
    h.giveProperty(a, 'madagadipet');
    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 0, properties: ['madagadipet'] },
      requested: { cash: 50, properties: [] },
    });
    const tradeId = Object.keys(h.state.trades)[0]!;
    expect(h.expectRejected(c, 'ACCEPT_TRADE', { tradeId })).toBe('INVALID_TRADE');
  });
});
