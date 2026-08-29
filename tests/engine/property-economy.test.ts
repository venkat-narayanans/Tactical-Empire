import { describe, expect, it } from 'vitest';
import { CITY_BY_ID, CONFIG } from '@te/config';
import { calculateRent } from '@te/game-engine';
import { Harness, harnessLandingOn } from '../helpers/engine-harness.js';

const MADAGADIPET = CITY_BY_ID.get('madagadipet')!;
const THIRUBHUVANAI = CITY_BY_ID.get('thirubhuvanai')!;

describe('property purchase', () => {
  it('offers an unowned property and transfers it on purchase', () => {
    const { h, activeId } = harnessLandingOn(MADAGADIPET.boardIndex);
    h.run(activeId, 'ROLL_DICE');
    expect(h.state.turn.pendingPurchase?.propertyId).toBe('madagadipet');
    const cash = h.player(activeId).cash;

    h.run(activeId, 'BUY_PROPERTY', { propertyId: 'madagadipet' });
    expect(h.property('madagadipet').owner).toBe(activeId);
    expect(h.player(activeId).cash).toBe(cash - MADAGADIPET.price);
    expect(h.state.turn.pendingPurchase).toBeNull();
  });

  it('rejects a second purchase of the same property', () => {
    const { h, activeId } = harnessLandingOn(MADAGADIPET.boardIndex);
    h.run(activeId, 'ROLL_DICE');
    h.run(activeId, 'BUY_PROPERTY', { propertyId: 'madagadipet' });
    expect(h.expectRejected(activeId, 'BUY_PROPERTY', { propertyId: 'madagadipet' })).toBe(
      'PROPERTY_UNAVAILABLE',
    );
  });

  it('rejects a purchase the player cannot afford', () => {
    const { h, activeId } = harnessLandingOn(MADAGADIPET.boardIndex);
    h.run(activeId, 'ROLL_DICE');
    h.player(activeId).cash = 10;
    expect(h.expectRejected(activeId, 'BUY_PROPERTY', { propertyId: 'madagadipet' })).toBe(
      'INSUFFICIENT_FUNDS',
    );
    expect(h.property('madagadipet').owner).toBeNull();
  });

  it('rejects buying a property the player has not landed on', () => {
    const h = new Harness({ seed: 5 });
    h.start(['Ana', 'Ben']);
    const active = h.activeId();
    h.run(active, 'ROLL_DICE');
    expect(h.expectRejected(active, 'BUY_PROPERTY', { propertyId: 'white_town' })).toBe(
      'PROPERTY_UNAVAILABLE',
    );
  });
});

describe('rent', () => {
  it('charges the configured rent and pays the owner', () => {
    const { h, activeId, passedStart } = harnessLandingOn(MADAGADIPET.boardIndex);
    const [a, b] = h.state.turnOrder as [string, string];
    const owner = activeId === a ? b : a;
    h.giveProperty(owner, 'madagadipet');
    const payerCash = h.player(activeId).cash;
    const ownerCash = h.player(owner).cash;
    const bonus = passedStart ? CONFIG.defaults.start_pass_bonus : 0;

    h.run(activeId, 'ROLL_DICE');
    const rent = MADAGADIPET.rent[0] as number;
    expect(h.player(activeId).cash).toBe(payerCash + bonus - rent);
    expect(h.player(owner).cash).toBe(ownerCash + rent);
    expect(h.lastEvent('RentPaid')?.payload).toMatchObject({ amount: rent });
  });

  it('doubles undeveloped rent when the owner holds the full territory', () => {
    const h = new Harness({ seed: 2 });
    const [a, b] = h.start(['Ana', 'Ben']) as [string, string];
    h.giveProperty(b, 'madagadipet');
    h.giveProperty(b, 'thirubhuvanai');
    expect(calculateRent(h.state, 'madagadipet', 7)).toBe(
      (MADAGADIPET.rent[0] as number) * MADAGADIPET.fullSetUndevelopedMultiplier,
    );
    void a;
  });

  it('charges nothing for a mortgaged property', () => {
    const h = new Harness({ seed: 2 });
    const [, b] = h.start(['Ana', 'Ben']) as [string, string];
    h.giveProperty(b, 'madagadipet');
    h.property('madagadipet').mortgaged = true;
    expect(calculateRent(h.state, 'madagadipet', 7)).toBe(0);
  });

  it('uses the dice total for public works rent', () => {
    const h = new Harness({ seed: 2 });
    const [, b] = h.start(['Ana', 'Ben']) as [string, string];
    h.giveProperty(b, 'kpt_dam');
    const oneOwned = CONFIG.special_property_rules.public_works.multipliers['1'] as number;
    expect(calculateRent(h.state, 'kpt_dam', 8)).toBe(8 * oneOwned);
    h.giveProperty(b, 'mandi');
    const twoOwned = CONFIG.special_property_rules.public_works.multipliers['2'] as number;
    expect(calculateRent(h.state, 'kpt_dam', 8)).toBe(8 * twoOwned);
  });

  it('scales transport rent by how many of the group are owned', () => {
    const h = new Harness({ seed: 2 });
    const [, b] = h.start(['Ana', 'Ben']) as [string, string];
    h.giveProperty(b, 'boat_house');
    expect(calculateRent(h.state, 'boat_house', 7)).toBe(
      CONFIG.special_property_rules.transport.rent['1'] as number,
    );
    h.giveProperty(b, 'airport');
    expect(calculateRent(h.state, 'boat_house', 7)).toBe(
      CONFIG.special_property_rules.transport.rent['2'] as number,
    );
  });

  it('charges nothing when landing on your own property', () => {
    const { h, activeId, passedStart } = harnessLandingOn(MADAGADIPET.boardIndex);
    h.giveProperty(activeId, 'madagadipet');
    const before = h.player(activeId).cash;
    const bonus = passedStart ? CONFIG.defaults.start_pass_bonus : 0;
    h.run(activeId, 'ROLL_DICE');
    expect(h.player(activeId).cash).toBe(before + bonus);
  });
});

describe('development', () => {
  function withFullSet() {
    const h = new Harness({ seed: 15 });
    const [a, b] = h.start(['Ana', 'Ben']) as [string, string];
    const owner = h.activeId();
    h.giveProperty(owner, 'madagadipet');
    h.giveProperty(owner, 'thirubhuvanai');
    return { h, owner, other: owner === a ? b : a };
  }

  it('requires the complete territory before building', () => {
    const h = new Harness({ seed: 15 });
    h.start(['Ana', 'Ben']);
    const owner = h.activeId();
    h.giveProperty(owner, 'madagadipet');
    expect(h.expectRejected(owner, 'BUILD', { propertyId: 'madagadipet' })).toBe(
      'INVALID_DEVELOPMENT',
    );
  });

  it('builds houses up to a hotel and charges the territory house cost', () => {
    const { h, owner } = withFullSet();
    const cost = MADAGADIPET.houseCost;
    for (let level = 1; level <= 5; level += 1) {
      const cash = h.player(owner).cash;
      // Even build forces the pair to rise together.
      h.run(owner, 'BUILD', { propertyId: 'madagadipet' });
      expect(h.property('madagadipet').level).toBe(level);
      expect(h.player(owner).cash).toBe(cash - cost);
      h.run(owner, 'BUILD', { propertyId: 'thirubhuvanai' });
    }
    expect(h.property('madagadipet').level).toBe(5);
    expect(h.expectRejected(owner, 'BUILD', { propertyId: 'madagadipet' })).toBe(
      'INVALID_DEVELOPMENT',
    );
  });

  it('enforces even build across the territory', () => {
    const { h, owner } = withFullSet();
    h.run(owner, 'BUILD', { propertyId: 'madagadipet' });
    expect(h.expectRejected(owner, 'BUILD', { propertyId: 'madagadipet' })).toBe(
      'INVALID_DEVELOPMENT',
    );
    h.run(owner, 'BUILD', { propertyId: 'thirubhuvanai' });
    h.run(owner, 'BUILD', { propertyId: 'madagadipet' });
    expect(h.property('madagadipet').level).toBe(2);
  });

  it('raises rent to the configured level after development', () => {
    const { h, owner } = withFullSet();
    h.run(owner, 'BUILD', { propertyId: 'madagadipet' });
    expect(calculateRent(h.state, 'madagadipet', 7)).toBe(MADAGADIPET.rent[1] as number);
  });

  it('refunds half the house cost when selling a building', () => {
    const { h, owner } = withFullSet();
    h.run(owner, 'BUILD', { propertyId: 'madagadipet' });
    const cash = h.player(owner).cash;
    h.run(owner, 'SELL_BUILDING', { propertyId: 'madagadipet' });
    expect(h.property('madagadipet').level).toBe(0);
    expect(h.player(owner).cash).toBe(
      cash + Math.floor(MADAGADIPET.houseCost * CONFIG.development.resale_percentage),
    );
  });

  it('rejects development by a player who does not own the property', () => {
    const { h, other } = withFullSet();
    expect(h.expectRejected(other, 'BUILD', { propertyId: 'madagadipet' })).toBe('NOT_YOUR_TURN');
  });
});

describe('mortgage', () => {
  it('pays half the price and suspends rent, then costs interest to lift', () => {
    const h = new Harness({ seed: 4 });
    h.start(['Ana', 'Ben']);
    const owner = h.activeId();
    h.giveProperty(owner, 'thirubhuvanai');
    const cash = h.player(owner).cash;
    const mortgage = Math.floor(THIRUBHUVANAI.price * CONFIG.mortgage.mortgage_percentage);

    h.run(owner, 'MORTGAGE_PROPERTY', { propertyId: 'thirubhuvanai' });
    expect(h.player(owner).cash).toBe(cash + mortgage);
    expect(calculateRent(h.state, 'thirubhuvanai', 7)).toBe(0);

    const expectedCost = Math.ceil(mortgage * (1 + CONFIG.mortgage.unmortgage_interest));
    const afterMortgage = h.player(owner).cash;
    h.run(owner, 'UNMORTGAGE_PROPERTY', { propertyId: 'thirubhuvanai' });
    expect(h.player(owner).cash).toBe(afterMortgage - expectedCost);
    expect(h.property('thirubhuvanai').mortgaged).toBe(false);
  });

  it('refuses to mortgage a developed property', () => {
    const h = new Harness({ seed: 4 });
    h.start(['Ana', 'Ben']);
    const owner = h.activeId();
    h.giveProperty(owner, 'madagadipet', 2);
    expect(h.expectRejected(owner, 'MORTGAGE_PROPERTY', { propertyId: 'madagadipet' })).toBe(
      'INVALID_MORTGAGE',
    );
  });
});
