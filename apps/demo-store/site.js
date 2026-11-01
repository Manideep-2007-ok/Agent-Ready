// Shared header/footer + page rendering. Each page sets <body data-root="../" data-page="...">.
(function () {
  const root = document.body.dataset.root || '';
  const page = document.body.dataset.page;
  const F = window.Flaws;
  const money = (n) => '₹' + n;
  const CART_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 11.5a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.5L21 7H6"/></svg>';
  // Price element: text normally, image when the priceImg flaw is on.
  const price = (n) => '<span class="price">' + (F.priceImg ? window.priceImgHTML(n) : money(n)) + '</span>';

  const header = '<header class="site-header"><a class="logo" href="' + root + 'index.html">Chai &amp; Co.</a>' +
    '<nav><a href="' + root + 'index.html">Shop</a>' + (F.iconCart
      // iconCart flaw: the header cart link is an icon with a number, no text and no label.
      ? '<a class="cart-icon-link" href="' + root + 'cart.html">' + CART_SVG + '<span id="cart-count">' + Cart.count() + '</span></a>'
      : '<a href="' + root + 'cart.html">Cart (<span id="cart-count">' + Cart.count() + '</span>)</a>') + '</nav></header>';
  const footer = '<footer class="site-footer"><a href="' + root + 'contact.html">Contact</a><a href="' + root + 'help/index.html">Help</a>' +
    (F.hiddenReturns ? '' : '<a href="' + root + 'help/policies/shipping/more/returns.html">Returns</a>') +
    '<span>&copy; 2026 Chai &amp; Co.</span></footer>';
  document.body.insertAdjacentHTML('afterbegin', header);
  document.body.insertAdjacentHTML('beforeend', footer);
  const main = document.querySelector('main');
  const cartIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 11.5a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.5L21 7H6"/></svg>';
  const addBtn = (id) => F.iconCart
    ? '<button class="btn add-btn" data-id="' + id + '">' + cartIcon + '</button>'
    : '<button class="btn add-btn" data-id="' + id + '">Add to cart</button>';

  if (page === 'home') {
    main.querySelector('#grid').innerHTML = PRODUCTS.map((p) =>
      '<article class="card"><h2><a href="product.html?id=' + p.id + '">' + p.name + '</a></h2>' + price(p.price) +
      '<p><a class="link" href="product.html?id=' + p.id + '">View product</a></p></article>').join('');
  }

  if (page === 'product') {
    const p = PRODUCTS.find((x) => x.id === Number(new URLSearchParams(location.search).get('id'))) || PRODUCTS[0];
    document.title = p.name + ' | Chai & Co.';
    main.innerHTML = '<h1>' + p.name + '</h1><p>' + p.description + '</p><p class="big">' + price(p.price) + '</p>' + addBtn(p.id) + '<p id="added" class="note" role="status"></p>';
    if (window.flawsAllOff()) {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description,
        offers: { '@type': 'Offer', price: String(p.price), priceCurrency: 'INR', availability: 'https://schema.org/InStock' } });
      document.head.appendChild(s);
    }
    main.querySelector('.add-btn').addEventListener('click', () => {
      Cart.add(p.id, 1);
      document.getElementById('cart-count').textContent = Cart.count();
      document.getElementById('added').textContent = F.iconCart ? '' : 'Added to cart.';
    });
  }

  if (page === 'cart') {
    const render = () => {
      const items = Cart.items();
      if (!items.length) { main.innerHTML = '<h1>Your cart</h1><p>Your cart is empty.</p>'; return; }
      main.innerHTML = '<h1>Your cart</h1><table class="cart"><thead><tr><th>Item</th><th>Price</th><th>Quantity</th><th></th></tr></thead><tbody>' +
        items.map((i) => { const p = PRODUCTS.find((x) => x.id === i.id);
          return '<tr><td>' + p.name + '</td><td>' + price(p.price) + '</td><td><input type="number" min="1" value="' + i.qty + '" data-id="' + i.id + '" aria-label="Quantity for ' + p.name + '"></td><td><button class="link rm" data-id="' + i.id + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table><p class="big">Cart total: ' + price(Cart.total()) + '</p>';
      main.querySelectorAll('input').forEach((el) => el.addEventListener('change', () => { Cart.setQty(Number(el.dataset.id), Math.max(1, Number(el.value) || 1)); render(); upd(); }));
      main.querySelectorAll('.rm').forEach((el) => el.addEventListener('click', () => { Cart.remove(Number(el.dataset.id)); render(); upd(); }));
    };
    const upd = () => (document.getElementById('cart-count').textContent = Cart.count());
    render();
  }

  if (page === 'contact') {
    const f = main.querySelector('form');
    f.addEventListener('submit', (e) => { e.preventDefault(); f.outerHTML = '<p class="big" role="status">Thanks! We will reply within one working day.</p>'; });
  }

  // hiddenReturns flaw: the help page's Returns link becomes a vague "Other information" link one page deeper.
  if (F.hiddenReturns) {
    document.querySelectorAll('main a[href="returns.html"]').forEach((a) => {
      if (/^returns$/i.test(a.textContent.trim())) { a.textContent = 'Other information'; a.setAttribute('href', 'other.html'); }
    });
  }

  // Product list page add buttons (none on home). Delegated for product page handled above.
})();
