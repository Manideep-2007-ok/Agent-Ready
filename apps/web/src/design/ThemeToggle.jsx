// Light/dark switch. The choice is saved; storage that throws (private windows) is ignored.
import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const current = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(current);
  const next = theme === 'dark' ? 'light' : 'dark';
  const flip = () => {
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem('agentready_theme', next); } catch { /* private window */ }
    setTheme(next);
  };
  const label = `Switch to ${next} theme`;
  return (
    <button type="button" className={`ar-btn ar-btn--ghost ar-btn--sm ar-icon-btn ${className}`} onClick={flip} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
