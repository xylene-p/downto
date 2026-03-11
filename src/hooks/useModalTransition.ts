import { useState, useEffect, useRef } from "react";

/**
 * Manages open → entering → idle → closing → unmounted lifecycle for modals.
 * Returns `visible` (should render), `entering` (fade in), `closing` (fade out), and `close()`.
 */
export function useModalTransition(
  open: boolean,
  onClose: () => void,
  closeDuration = 200,
) {
  const [visible, setVisible] = useState(false);
  const [entering, setEntering] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setEntering(true);
      // Let first frame render with entering=true, then flip to false to trigger transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntering(false));
      });
    } else if (visible && !closing) {
      setClosing(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, closeDuration);
    }
    return () => clearTimeout(timerRef.current);
  }, [open]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, closeDuration);
  };

  return { visible, entering, closing, close };
}
