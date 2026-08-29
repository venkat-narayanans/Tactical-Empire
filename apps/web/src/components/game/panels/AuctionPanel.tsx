import { useEffect, useState } from 'react';
import type { AuctionState, ClientGameState } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import { displayName, formatMoney, priceOf, secondsLeft, self } from '../../../lib/view-helpers.js';

/** Live auction: current bid, who holds it, the clock, bid and pass. */
export function AuctionPanel({
  game,
  auction,
}: {
  readonly game: ClientGameState;
  readonly auction: AuctionState;
}) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const [now, setNow] = useState(Date.now());
  const [amount, setAmount] = useState(auction.highestBid + 10);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setAmount((current) => (current > auction.highestBid ? current : auction.highestBid + 10));
  }, [auction.highestBid]);

  const highestBidder = auction.highestBidderId ? game.players[auction.highestBidderId] : null;
  const stillBidding = auction.activeBidders.includes(game.viewerId);
  const remaining = secondsLeft(auction.endsAt, now);
  const cash = me?.cash ?? 0;
  const validBid = amount > auction.highestBid && amount <= cash;

  return (
    <section className="panel panel--focus">
      <div className="panel__header">
        <span className="panel__title">Auction</span>
        <span className={`badge${remaining <= 5 ? ' badge--warning' : ''}`}>{remaining}s</span>
      </div>

      <div className="panel__body stack">
        <div>
          <h3>{displayName(auction.propertyId)}</h3>
          <p className="tiny muted">List price {formatMoney(priceOf(auction.propertyId))}</p>
        </div>

        <dl className="stat-grid">
          <div>
            <dt>Current bid</dt>
            <dd className="money money--lg">{formatMoney(auction.highestBid)}</dd>
          </div>
          <div>
            <dt>Highest bidder</dt>
            <dd>{highestBidder ? highestBidder.name : 'No bids yet'}</dd>
          </div>
          <div>
            <dt>Still bidding</dt>
            <dd>{auction.activeBidders.length}</dd>
          </div>
          <div>
            <dt>Your cash</dt>
            <dd>{formatMoney(cash)}</dd>
          </div>
        </dl>

        {stillBidding ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="auction-bid">Your bid</label>
              <input
                id="auction-bid"
                className="input"
                type="number"
                min={auction.highestBid + 1}
                max={cash}
                step={10}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!validBid}
                onClick={() => void send('PLACE_BID', { auctionId: auction.id, amount })}
              >
                Bid {formatMoney(amount)}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void send('PASS_AUCTION', { auctionId: auction.id })}
              >
                Pass
              </button>
            </div>
            {!validBid ? (
              <p className="tiny muted">
                A bid must beat {formatMoney(auction.highestBid)} and stay within your cash.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="notice tiny">You have passed on this auction.</p>
        )}

        {auction.bids.length > 0 ? (
          <ul className="bid-list">
            {[...auction.bids].reverse().slice(0, 6).map((bid, index) => (
              <li key={`${bid.playerId}-${bid.at}-${index}`} className="tiny">
                <span className="muted">{game.players[bid.playerId]?.name ?? 'Player'}</span>{' '}
                {formatMoney(bid.amount)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
