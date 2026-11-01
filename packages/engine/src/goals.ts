import type { TaskId } from './types';

// Tested wording from 31 Oct. Keep GOAL_SUFFIX identical across tasks so answers parse the same way.
export const GOAL_SUFFIX =
  'Do NOT log in, sign up or pay. If anything blocks you (login wall, popup, captcha, error page, access denied), ' +
  'stop and describe exactly what blocked you and at which step. ' +
  'Return JSON: {"success": true/false, "answer": string or null, "blocker": string or null, "stuck_url": string or null}';

export const TASK_GOALS: Record<Exclude<TaskId, 'custom'>, string> = {
  find_price: 'Find any product on this site and report its exact name and price.',
  add_to_cart:
    'Find any product, open its product page and add it to the cart. Then open the cart and report the cart total.',
  find_returns:
    "Find this site's return or refund policy. Report how many days customers have to return a product and the URL of the policy page.",
  find_contact:
    "Find a way to contact this company's customer support (phone, email, chat or contact form) and report it with the page URL where you found it.",
};

export const TASK_LABELS: Record<TaskId, string> = {
  find_price: 'Find a product and its price',
  add_to_cart: 'Add to cart and read the total',
  find_returns: 'Find the return policy',
  find_contact: 'Find customer support',
  custom: 'Custom task',
};

// Slowest first (find_returns took 261 s on Nykaa).
export const DEFAULT_TASK_ORDER: TaskId[] = ['find_returns', 'add_to_cart', 'find_price', 'find_contact'];

export function buildGoal(taskId: TaskId, customText?: string): string {
  const base = taskId === 'custom' ? (customText ?? '').trim() : TASK_GOALS[taskId];
  return `${base} ${GOAL_SUFFIX}`;
}
