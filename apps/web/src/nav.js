// Moves between app pages by changing the URL hash; App.jsx listens for the change.
// navigate('test', newId, beforeId) -> #/app/test/<newId>/<beforeId>. Links are built by routes.js href().
import { href } from './routes.js';

export function navigate(page, ...parts) {
  window.location.hash = href('app', page, ...parts);
}
