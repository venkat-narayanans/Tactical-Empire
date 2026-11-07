import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from './store/game-store.js';
import { MainMenu } from './screens/MainMenu.js';
import { CreateGame } from './screens/CreateGame.js';
import { JoinGame } from './screens/JoinGame.js';
import { HowToPlay } from './screens/HowToPlay.js';
import { Lobby } from './screens/Lobby.js';
import { GameScreen } from './screens/GameScreen.js';
import { GameOver } from './screens/GameOver.js';
import { Notifications } from './components/Notifications.js';
import './styles/screens.css';

/**
 * Screen routing follows the authoritative phase, not local navigation: when
 * the host starts the game every client moves to the board because the server
 * said so.
 */
export function App() {
  const { screen, connect, status, session } = useGameStore(useShallow((state) => ({
    screen: state.screen,
    connect: state.connect,
    status: state.status,
    session: state.session,
  })));

  // Opening the socket immediately lets a stored session reconnect on load.
  useEffect(() => {
    void connect().catch(() => undefined);
  }, [connect]);

  return (
    <>
      {screen === 'menu' ? <MainMenu /> : null}
      {screen === 'create' ? <CreateGame /> : null}
      {screen === 'join' ? <JoinGame /> : null}
      {screen === 'howto' ? <HowToPlay /> : null}
      {screen === 'lobby' ? <Lobby /> : null}
      {screen === 'game' ? <GameScreen /> : null}
      {screen === 'over' ? <GameOver /> : null}

      {status === 'reconnecting' && (session || screen === 'lobby' || screen === 'over') ? (
        <div className="connection-banner" role="status">
          Connection lost. Trying to reconnect...
        </div>
      ) : null}

      <Notifications />
    </>
  );
}
