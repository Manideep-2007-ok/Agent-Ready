// Discord/Slack incoming-webhook alerts. Never throws.

/**
 * @param {string} text
 * @returns {Promise<{sent:boolean}>}
 */
export async function sendAlert(text) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    console.log('[alert] (no ALERT_WEBHOOK_URL set)', text);
    return { sent: false };
  }
  const body = url.includes('discord.com') ? { content: text } : { text };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) console.warn('[alert] webhook answered', res.status);
    return { sent: res.ok };
  } catch (err) {
    console.warn('[alert] could not send:', err?.name === 'AbortError' ? 'timed out' : 'network error');
    return { sent: false };
  } finally {
    clearTimeout(timer);
  }
}
