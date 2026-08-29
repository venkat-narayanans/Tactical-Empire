import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/game-store.js';

/** Compact, non-blocking notifications in the corner. */
export function Notifications() {
  const { toasts, dismissToast } = useGameStore(useShallow((state) => ({
    toasts: state.toasts,
    dismissToast: state.dismissToast,
  })));

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
