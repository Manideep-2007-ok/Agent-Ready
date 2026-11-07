// Short confirmations ("Link copied"). One toast at a time, announced politely, gone after 2.5 s.
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [text, setText] = useState('');
  const timer = useRef(null);
  const show = useCallback((t) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(''), 2500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ar-toast-region" role="status" aria-live="polite">{text && <div className="ar-toast">{text}</div>}</div>
    </ToastContext.Provider>
  );
}

/** @returns {(text:string)=>void} */
export const useToast = () => useContext(ToastContext);
