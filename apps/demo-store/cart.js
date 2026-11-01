// Cart helpers backed by localStorage. Cart = [{id, qty}].
(function () {
  const KEY = 'chai_cart';
  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function write(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  window.Cart = {
    items: read,
    add(id, qty) {
      const c = read(); const l = c.find((x) => x.id === id);
      if (l) l.qty += qty || 1; else c.push({ id, qty: qty || 1 });
      write(c);
    },
    setQty(id, qty) { write(read().map((x) => (x.id === id ? { id, qty } : x)).filter((x) => x.qty > 0)); },
    remove(id) { write(read().filter((x) => x.id !== id)); },
    count() { return read().reduce((n, x) => n + x.qty, 0); },
    total() {
      return read().reduce((s, x) => {
        const p = window.PRODUCTS.find((q) => q.id === x.id);
        return s + (p ? p.price * x.qty : 0);
      }, 0);
    },
  };
})();
