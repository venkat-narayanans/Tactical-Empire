import { ARMY_UNITS, CONFIG, TERRITORIES } from '@te/config';
import { useGameStore } from '../store/game-store.js';

/** Rules summary, generated from GAME_CONFIG.json so it can never drift. */
export function HowToPlay() {
  const setScreen = useGameStore((state) => state.setScreen);

  return (
    <main className="menu">
      <div className="menu__card menu__card--wide panel">
        <header className="menu__header">
          <h1>How to play</h1>
          <p className="muted">
            Build an empire across {TERRITORIES.length} territories, then defend it.
          </p>
        </header>

        <div className="howto scroll-y">
          <section>
            <h2>The turn</h2>
            <p className="muted">
              Roll, move, then resolve where you land. You may buy the space you land on, or decline
              it{CONFIG.host_settings.auction ? ' and send it to auction' : ''}. On your own turn you
              can also develop, buy army, scout and declare war. Trades and alliances can be proposed
              at any time.
            </p>
          </section>

          <section>
            <h2>Money</h2>
            <ul>
              <li>Everyone starts with ₹{CONFIG.defaults.starting_cash}.</li>
              <li>Passing START pays ₹{CONFIG.defaults.start_pass_bonus}.</li>
              <li>Rent rises with development; a full undeveloped set pays double.</li>
              <li>Three doubles in a row sends you to IG Signal.</li>
            </ul>
          </section>

          <section>
            <h2>Territories</h2>
            <p className="muted">
              Own every city in a territory to develop it and to earn its completion bonus at the
              end of the game.
            </p>
            <ul className="howto__grid">
              {TERRITORIES.map((territory) => (
                <li key={territory.id}>
                  <strong>{territory.id}</strong> — {territory.cities.length} cities, bonus ₹
                  {territory.bonus}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Army and war</h2>
            <ul>
              {ARMY_UNITS.map((unit) => (
                <li key={unit.id}>
                  {unit.name}: ₹{unit.cost} for {unit.power} power
                </li>
              ))}
              <li>
                Capacity starts at {CONFIG.army.base_capacity} units and grows by one for every two
                cities you own, up to {CONFIG.army.max_capacity}.
              </li>
              <li>
                A defender adds {Math.round(CONFIG.war.home_defense_bonus * 100)}% home defence plus
                the strength of their buildings, and both sides roll a battle factor between{' '}
                {CONFIG.war.battle_factor_min} and {CONFIG.war.battle_factor_max}. Money alone does
                not win a war.
              </li>
              <li>Winning captures every one of the target's cities in that territory.</li>
            </ul>
          </section>

          <section>
            <h2>Diplomacy</h2>
            <ul>
              <li>
                One alliance at a time, lasting {CONFIG.alliances.duration_rounds} rounds.
              </li>
              <li>
                Allies can lend up to{' '}
                {Math.round(CONFIG.alliances.army_lend_max_percentage_of_available_power * 100)}% of
                their available army power. Lent units stay locked until the alliance ends.
              </li>
              <li>
                Scouting costs ₹{CONFIG.scouting.cost} and reveals a player's army and a range for
                their cash. You can scout the same player once per round.
              </li>
            </ul>
          </section>

          <section>
            <h2>Winning</h2>
            <p className="muted">
              The game ends when one player is left, or after round {CONFIG.defaults.max_rounds}.
              Final score adds cash, property, buildings, army and territory bonuses.
            </p>
          </section>
        </div>

        <button type="button" className="btn btn--block" onClick={() => setScreen('menu')}>
          Back
        </button>
      </div>
    </main>
  );
}
