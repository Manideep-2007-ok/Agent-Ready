// Switchable accessibility flaws for the AgentReady demo. Loaded first on every page.
// ?flaws=on|off sets the four classic flaws; ?flaws=all also turns on the two that change the outcome (v2):
//   qtyTwo:    the quantity box on the product page starts at 2, so the cart total is for two units
//   slowCart:  Add to cart takes 4 s, shows no message and leaves the cart count alone until then
// ?popup=on&priceImg=on&iconCart=on&hiddenReturns=on&qtyTwo=on&slowCart=on set one each.
// Saved to localStorage; default is everything off.
(function () {
  const CLASSIC = ['popup', 'priceImg', 'iconCart', 'hiddenReturns'];
  const NAMES = CLASSIC.concat(['qtyTwo', 'slowCart']);
  const KEY = 'agentready_flaws';
  let state = { popup: false, priceImg: false, iconCart: false, hiddenReturns: false, qtyTwo: false, slowCart: false };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}

  const q = new URLSearchParams(location.search);
  const all = q.get('flaws');
  if (all === 'on' || all === 'off') NAMES.forEach((n) => (state[n] = all === 'on' && CLASSIC.includes(n)));
  if (all === 'all') NAMES.forEach((n) => (state[n] = true));
  NAMES.forEach((n) => { const v = q.get(n); if (v === 'on' || v === 'off') state[n] = v === 'on'; });
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}

  window.Flaws = state;
  window.flawsAllOff = () => NAMES.every((n) => !state[n]);

  // Price as an image: a PNG drawn on a canvas, so the digits never appear in the HTML (not in src, alt or text).
  // Fallback: base64 SVG (still no readable digits in the markup).
  window.priceImgHTML = function (amount) {
    let src = '';
    try {
      const c = document.createElement('canvas');
      c.width = 110; c.height = 30;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 110, 30);
      g.fillStyle = '#7a2e0e'; g.font = 'bold 22px Arial, sans-serif';
      g.fillText('\u20B9' + amount, 4, 23);
      src = c.toDataURL('image/png');
    } catch (e) {}
    if (!src || src.length < 100) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="30"><rect width="110" height="30" fill="#fff"/>' +
        '<text x="4" y="23" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="#7a2e0e">\u20B9' + amount + '</text></svg>';
      src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }
    return '<img class="price-img" src="' + src + '" width="110" height="30">';
  };

  // Full-screen popup with no way to close it.
  if (state.popup) {
    document.addEventListener('DOMContentLoaded', function () {
      const d = document.createElement('div');
      d.id = 'sale-popup';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(122,46,14,.96);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font:700 40px Arial,sans-serif;';
      d.innerHTML = '<div>Diwali Sale!<br>Up to 50% off<br><span style="font-size:20px;font-weight:400">Sign up for our newsletter to continue</span></div>';
      document.body.appendChild(d);
    });
  }
})();
