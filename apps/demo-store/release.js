// "Release" switch for the Agent-Ready Watch demo: simulates a bad deploy of the live store.
// cartBroken: true -> the Add to cart button shows an error and adds nothing (like a broken checkout release).
// Change it, push to main, Vercel redeploys in ~1 min; Watch then catches it and alerts. Keep it false normally.
window.RELEASE = { cartBroken: false };
