/**
 * Cart drawer: free gift with purchase.
 *
 * Flow:  spend >= threshold  ->  pick a category (e.g. Tights / Towel / Band)
 *        single-variant product  -> added straight away
 *        colour + size product   -> colour grid -> size list -> added
 *        "Change gift" lets the customer go back and pick another one (old gift is swapped out).
 *
 * Rules enforced every time the drawer renders (and once on page load when a gift is in the cart):
 *   - spend drops below the threshold -> gift removed
 *   - more than one gift              -> only the newest is kept
 *   - gift quantity above 1           -> set back to 1
 *
 * Hooks used by assets/theme.js (theme.CartDrawer.renderCart):
 *   theme.CartGift.isGiftLine(item)  -> gift lines are hidden from the normal item list
 *   theme.CartGift.update(cart)      -> renders progress + panel, runs the rules above
 */
(function () {
    'use strict';
  
    window.theme = window.theme || {};
    var GIFT_PROP = '_gift_with_purchase';
  
    var configEl = document.querySelector('[data-cart-gift-config]');
    var config = null;
    try {
      config = configEl ? JSON.parse(configEl.textContent) : null;
    } catch (e) {
      config = null;
    }
  
    function propsFlagGift(item) {
      var p = item && item.properties;
      return !!(p && p[GIFT_PROP] != null && p[GIFT_PROP] !== '');
    }
  
    if (!config || !config.categories || !config.categories.length) {
      // Feature off: still treat flagged lines as gifts so they never sit in the cart for free.
      theme.CartGift = {
        isGiftLine: propsFlagGift,
        update: function (cart) {
          var gifts = (cart.items || []).filter(propsFlagGift);
          if (gifts.length && !theme.CartGift._cleaning) {
            theme.CartGift._cleaning = true;
            runChanges(gifts.map(function (l) { return [l.key, 0]; })).then(function () {
              if (theme.CartDrawer) theme.CartDrawer.renderCart();
            });
          }
        }
      };
      return;
    }
  
    /* ---------------------------------------------------------------- data */
  
    var giftProductIds = {};
    config.categories.forEach(function (cat) {
      mergeProducts(cat);
      prepareCategory(cat);
      cat.productIds.forEach(function (id) { giftProductIds[String(id)] = true; });
    });
  
    /**
     * A category can hold one product, or several products where each product is one colour
     * (grouped products, e.g. "Contoursoft Tights - Pink", "... - Suntan", each with sizes).
     * Several products are merged into one virtual product with options [Color, Size].
     */
    function colorIndexOf(names) {
      for (var i = 0; i < names.length; i++) if (/colou?r|shade/i.test(names[i])) return i;
      return -1;
    }
  
    function mergeProducts(cat) {
      var products = cat.products || (cat.product ? [cat.product] : []);
      cat.productIds = products.map(function (p) { return p.id; });
  
      if (products.length <= 1) {
        cat.product = products[0];
        cat.product.variants.forEach(function (v) { v.productTitle = cat.product.title; });
        return;
      }
  
      // Many products: hide colours that are completely sold out to keep the grids short.
      products = products.filter(function (p) {
        return p.variants.some(function (v) { return v.available; });
      });
      if (!products.length) products = [cat.products[0]];
  
      // Colour name for a product without a Color option: text after the last " - ", " – " or " | " in the title.
      function splitTitle(title) {
        var parts = String(title).split(/\s+[-–|]\s+/);
        return parts.length > 1
          ? { style: parts.slice(0, -1).join(' - '), color: parts[parts.length - 1] }
          : { style: title, color: title };
      }
  
      // Style = product title (grouped products share a title per style, e.g. "Ladies Contoursoft Footed Tights").
      var styles = [];
      var sizeName = 'Size';
      var used = {}; // style -> { colourName: productId }
      var variants = [];
  
      products.forEach(function (p) {
        var names = p.options || [];
        var cIdx = colorIndexOf(names);
        var otherIdx = [];
        names.forEach(function (n, i) { if (i !== cIdx) otherIdx.push(i); });
        if (otherIdx.length) sizeName = names[otherIdx[0]];
  
        var t = splitTitle(p.title);
        var style = cIdx >= 0 ? p.title : t.style;
        if (styles.indexOf(style) < 0) styles.push(style);
        used[style] = used[style] || {};
  
        // Fallback colour name, kept unique within the style.
        var fallback = t.color;
        var name = fallback;
        var n = 2;
        while (used[style][name] && used[style][name] !== p.id) name = fallback + ' ' + n++;
        used[style][name] = p.id;
  
        p.variants.forEach(function (v) {
          var color = cIdx >= 0 ? v.options[cIdx] : name;
          var size = otherIdx.map(function (i) { return v.options[i]; })
            .filter(function (x) { return x && x !== 'Default Title'; }).join(' / ') || 'One size';
          variants.push({
            id: v.id,
            available: v.available,
            style: style,
            color: color,
            size: size,
            image: v.image || p.image,
            productTitle: p.title
          });
        });
      });
  
      var multiStyle = styles.length > 1;
      variants.forEach(function (v) {
        v.options = multiStyle ? [v.style, v.color, v.size] : [v.color, v.size];
      });
  
      cat.product = {
        id: products[0].id,
        title: cat.label,
        image: products[0].image,
        options: multiStyle ? ['Style', 'Color', sizeName] : ['Color', sizeName],
        variants: variants
      };
      cat.forcedSteps = multiStyle ? [0, 1, 2] : [0, 1];
    }
  
    function unique(list) {
      var seen = {};
      var out = [];
      list.forEach(function (v) {
        if (v == null || seen[v]) return;
        seen[v] = true;
        out.push(v);
      });
      return out;
    }
  
    function prepareCategory(cat) {
      var p = cat.product;
      var names = p.options || [];
      var variants = p.variants || [];
      var colorIdx = -1;
      var sizeIdx = -1;
      names.forEach(function (n, i) {
        if (colorIdx < 0 && /colou?r|shade/i.test(n)) colorIdx = i;
        if (sizeIdx < 0 && /size/i.test(n)) sizeIdx = i;
      });
  
      var steps = [];
      if (cat.forcedSteps) {
        steps = cat.forcedSteps;
      } else if (variants.length > 1) {
        if (names.length === 1) {
          steps = [0];
        } else {
          var first = colorIdx >= 0 ? colorIdx : 0;
          var second = sizeIdx >= 0 && sizeIdx !== first ? sizeIdx : (first === 0 ? 1 : 0);
          steps = [first, second];
        }
      }
  
      cat.steps = steps;
      cat.values = names.map(function (_, i) {
        return unique(variants.map(function (v) { return v.options[i]; }));
      });
      cat.available = variants.some(function (v) { return v.available; });
    }
  
    function matches(variant, picked) {
      for (var k in picked) {
        if (Object.prototype.hasOwnProperty.call(picked, k) && variant.options[k] !== picked[k]) return false;
      }
      return true;
    }
  
    function findVariant(cat, picked) {
      var list = cat.product.variants.filter(function (v) { return matches(v, picked); });
      for (var i = 0; i < list.length; i++) {
        if (list[i].available) return list[i];
      }
      return null;
    }
  
    function valueAvailable(cat, picked, optIdx, value) {
      var test = Object.assign({}, picked);
      test[optIdx] = value;
      return !!findVariant(cat, test);
    }
  
    function imageFor(cat, picked) {
      var list = cat.product.variants.filter(function (v) { return matches(v, picked) && v.image; });
      if (list.length) return list[0].image;
      return cat.product.image || cat.image;
    }
  
    /* ---------------------------------------------------------------- utils */
  
    function esc(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  
    function money(cents) {
      var fmt = theme.moneyFormat || '${{amount}}';
      if (cents % 100 === 0) fmt = fmt.replace(/\{\{\s*amount\s*\}\}/, '{{amount_no_decimals}}');
      if (theme.Shopify && theme.Shopify.formatMoney) return theme.Shopify.formatMoney(cents, fmt);
      return '$' + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
    }
  
    function routes() {
      var r = theme.routes || {};
      return {
        cart: (r.cart_url || '/cart') + '.js',
        add: (r.cart_add_url || '/cart/add') + '.js',
        change: (r.cart_change_url || '/cart/change') + '.js'
      };
    }
  
    function postJSON(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var err = new Error((data && (data.description || data.message)) || 'Request failed');
            err.data = data;
            throw err;
          }
          return data;
        });
      });
    }
  
    // Sequential /cart/change.js calls: [[lineKey, qty], ...]
    function runChanges(ops) {
      return ops.reduce(function (chain, op) {
        return chain.then(function () {
          return postJSON(routes().change, { id: op[0], quantity: op[1] });
        });
      }, Promise.resolve());
    }
  
    function isGiftLine(item) {
      if (propsFlagGift(item)) return true;
      // A $0 gift product added without the property (e.g. via a cart permalink) is still a gift.
      return !!(giftProductIds[String(item.product_id)] && item.final_price === 0);
    }
  
    function analyze(cart) {
      var items = (cart && cart.items) || [];
      var giftLines = [];
      var subtotal = 0;
      items.forEach(function (item) {
        if (isGiftLine(item)) giftLines.push(item);
        else subtotal += item.final_line_price;
      });
      return {
        itemCount: cart ? cart.item_count : 0,
        giftLines: giftLines,
        gift: giftLines[0] || null, // Shopify lists newest lines first
        subtotal: subtotal,
        unlocked: subtotal >= config.threshold
      };
    }
  
    function rulesFor(ctx) {
      var ops = [];
      if (!ctx.giftLines.length) return ops;
      if (!ctx.unlocked) {
        ctx.giftLines.forEach(function (l) { ops.push([l.key, 0]); });
        return ops;
      }
      ctx.giftLines.forEach(function (l, i) {
        if (i > 0) ops.push([l.key, 0]);
      });
      if (ctx.gift.quantity > 1) ops.push([ctx.gift.key, 1]);
      return ops;
    }
  
    function categoryForLine(line) {
      for (var i = 0; i < config.categories.length; i++) {
        var ids = config.categories[i].productIds || [];
        for (var j = 0; j < ids.length; j++) {
          if (String(ids[j]) === String(line.product_id)) return i;
        }
      }
      return -1;
    }
  
    /* ---------------------------------------------------------------- icons */
  
    var icons = {
      plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      minus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
      lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
      back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
      check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
    };
  
    /* ---------------------------------------------------------------- state */
  
    var state = {
      expanded: null, // null = automatic; true/false once the customer toggles it
      changing: false, // customer pressed "Change gift"
      cat: null, // index of category being configured
      stepPos: 0,
      picked: {},
      busy: false,
      error: '',
      focus: null // selector to focus after the next render
    };
    var lastCtx = null;
    var lastCart = null;
    var wasUnlocked = null;
    var enforcing = false;
    var enforceFailed = false;
  
    function resetPicker() {
      state.cat = null;
      state.stepPos = 0;
      state.picked = {};
    }
  
    /* ---------------------------------------------------------------- render: progress */
  
    function progressMessage(sub) {
      var g = config.threshold;
      var s = theme.cartDrawerShippingThreshold || 0;
      var gotGift = sub >= g;
      var gotShip = s > 0 && sub >= s;
      var b = function (t) { return '<strong>' + t + '</strong>'; };
  
      if (s > 0 && s === g) {
        return gotGift
          ? 'You’ve earned ' + b('free shipping') + ' and a ' + b('free gift') + '.'
          : 'You’re ' + b(money(g - sub)) + ' away from ' + b('free shipping') + ' and a ' + b('free gift') + '.';
      }
      if (s > 0 && s < g) {
        if (!gotShip) return 'You’re ' + b(money(s - sub)) + ' away from ' + b('free shipping') + '.';
        if (!gotGift) return 'You’ve earned ' + b('free shipping') + ' and are ' + b(money(g - sub)) + ' away from a ' + b('free gift') + '.';
        return 'You’ve earned ' + b('free shipping') + ' and a ' + b('free gift') + '.';
      }
      if (s > 0 && s > g) {
        if (!gotGift) return 'You’re ' + b(money(g - sub)) + ' away from a ' + b('free gift') + '.';
        if (!gotShip) return 'You’ve earned a ' + b('free gift') + ' and are ' + b(money(s - sub)) + ' away from ' + b('free shipping') + '.';
        return 'You’ve earned ' + b('free shipping') + ' and a ' + b('free gift') + '.';
      }
      return gotGift
        ? 'You’ve unlocked a ' + b('free gift') + '.'
        : 'You’re ' + b(money(g - sub)) + ' away from a ' + b('free gift') + '.';
    }
  
    function renderProgress(ctx) {
      var el = document.querySelector('[data-cart-gift-progress]');
      if (!el) return;
      if (!ctx.itemCount) {
        el.hidden = true;
        return;
      }
      // Our bar replaces the theme's plain free-shipping line.
      var themeMsg = document.querySelector('[data-cart-drawer-shipping-message]');
      if (themeMsg) themeMsg.style.display = 'none';
  
      var g = config.threshold;
      var s = theme.cartDrawerShippingThreshold || 0;
      var milestones = [];
      if (s > 0 && s !== g) milestones.push({ amount: s, label: 'Free shipping' });
      milestones.push({ amount: g, label: s === g ? 'Free shipping + gift' : 'Free gift' });
      var max = Math.max.apply(null, milestones.map(function (m) { return m.amount; }));
      var fill = Math.min(ctx.subtotal / max, 1) * 100;
  
      var markers = milestones.map(function (m) {
        var pct = (m.amount / max) * 100;
        var reached = ctx.subtotal >= m.amount;
        return (
          '<div class="cart-gift-progress__marker' + (reached ? ' is-reached' : '') + (pct >= 100 ? ' is-end' : '') + '" style="left:' + pct + '%">' +
            '<span class="cart-gift-progress__label">' + esc(m.label) + '</span>' +
            '<span class="cart-gift-progress__amount">' + money(m.amount) + '</span>' +
          '</div>'
        );
      }).join('');
  
      el.innerHTML =
        '<p class="cart-gift-progress__message">' + progressMessage(ctx.subtotal) + '</p>' +
        '<div class="cart-gift-progress__bar">' +
          '<div class="cart-gift-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="' + (max / 100) + '" aria-valuenow="' + Math.min(ctx.subtotal, max) / 100 + '" aria-label="Progress to free gift">' +
            '<span class="cart-gift-progress__fill" style="width:' + fill + '%"></span>' +
          '</div>' +
          markers +
        '</div>';
      el.hidden = false;
    }
  
    /* ---------------------------------------------------------------- render: panel */
  
    function tileImage(src, alt) {
      return src
        ? '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '" loading="lazy" width="200" height="200">'
        : '<span class="cart-gift__img-placeholder" aria-hidden="true"></span>';
    }
  
    function renderLocked(ctx) {
      var tiles = config.categories.map(function (cat) {
        return (
          '<li class="cart-gift__tile is-locked" aria-disabled="true">' +
            '<span class="cart-gift__tile-media">' + tileImage(cat.image, '') + '<span class="cart-gift__lock">' + icons.lock + '</span></span>' +
            '<span class="cart-gift__tile-label">' + esc(cat.label) + '</span>' +
          '</li>'
        );
      }).join('');
      return (
        '<p class="cart-gift__note">Spend ' + money(config.threshold - ctx.subtotal) + ' more to choose one free gift.</p>' +
        '<ul class="cart-gift__tiles" role="list">' + tiles + '</ul>'
      );
    }
  
    function renderCategories(ctx) {
      var currentIdx = ctx.gift ? categoryForLine(ctx.gift) : -1;
      var tiles = config.categories.map(function (cat, i) {
        var multi = cat.steps.length > 0;
        var meta = !cat.available
          ? 'Out of stock'
          : multi
            ? (cat.steps.length > 2 ? 'Pick style, colour & size' : cat.steps.length > 1 ? 'Pick colour & size' : 'Pick an option')
            : 'Add to bag';
        return (
          '<li>' +
            '<button type="button" class="cart-gift__tile' + (i === currentIdx ? ' is-current' : '') + '" data-gift-cat="' + i + '"' + (cat.available && !state.busy ? '' : ' disabled') + '>' +
              '<span class="cart-gift__tile-media">' + tileImage(cat.image, '') + '</span>' +
              '<span class="cart-gift__tile-label">' + esc(cat.label) + '</span>' +
              '<span class="cart-gift__tile-meta">' + (i === currentIdx ? 'Your current gift' : meta) + '</span>' +
            '</button>' +
          '</li>'
        );
      }).join('');
  
      return (
        '<p class="cart-gift__note">' + (state.changing ? 'Pick a different gift. It will replace the one in your bag.' : 'Pick one gift. It’s free with your order.') + '</p>' +
        '<ul class="cart-gift__tiles" role="list">' + tiles + '</ul>' +
        (state.changing && ctx.gift
          ? '<button type="button" class="cart-gift__link" data-gift-keep data-gift-focus>Keep my current gift</button>'
          : '')
      );
    }
  
    function renderStep() {
      var cat = config.categories[state.cat];
      var optIdx = cat.steps[state.stepPos];
      var optName = cat.product.options[optIdx] || 'option';
      var isLast = state.stepPos === cat.steps.length - 1;
      var backLabel = state.stepPos === 0 ? 'All gifts' : (cat.product.options[cat.steps[state.stepPos - 1]] || 'Back');
  
      var head =
        '<div class="cart-gift__step-head">' +
          '<button type="button" class="cart-gift__back" data-gift-back data-gift-focus>' + icons.back + '<span>' + esc(backLabel) + '</span></button>' +
          '<span class="cart-gift__step-title">' + esc(state.stepPos > 0 && cat.steps.length > 2 ? state.picked[cat.steps[0]] : cat.label) + '</span>' +
        '</div>';
  
      // Only values that exist for what's been picked so far (e.g. colours of the chosen style).
      var values = unique(cat.product.variants
        .filter(function (v) { return matches(v, state.picked); })
        .map(function (v) { return v.options[optIdx]; }));
  
      if (!isLast) {
        // Image grid (e.g. colours).
        var tiles = values.map(function (val) {
          var pick = {};
          pick[optIdx] = val;
          var ok = valueAvailable(cat, state.picked, optIdx, val);
          return (
            '<li>' +
              '<button type="button" class="cart-gift__tile cart-gift__tile--option" data-gift-value="' + esc(val) + '"' + (ok && !state.busy ? '' : ' disabled') + '>' +
                '<span class="cart-gift__tile-media">' + tileImage(imageFor(cat, pick), '') + '</span>' +
                '<span class="cart-gift__tile-label">' +
                  (/colou?r|shade/i.test(optName) ? '<span class="cart-gift__swatch" data-swatch="' + esc(String(val).toLowerCase()) + '" aria-hidden="true"></span>' : '') +
                  esc(val) +
                '</span>' +
                (ok ? '' : '<span class="cart-gift__tile-meta">Out of stock</span>') +
              '</button>' +
            '</li>'
          );
        }).join('');
        return head + '<p class="cart-gift__note">Choose a ' + esc(optName.toLowerCase()) + '</p>' +
          '<ul class="cart-gift__tiles cart-gift__tiles--options" role="list">' + tiles + '</ul>';
      }
  
      // Last step: chosen product preview + option buttons (e.g. sizes).
      var chosenVariant = cat.product.variants.filter(function (v) { return matches(v, state.picked); })[0];
      var previewTitle = (chosenVariant && chosenVariant.productTitle) || cat.product.title;
      var chosen = cat.forcedSteps && cat.forcedSteps.length === 3
        ? state.picked[1]
        : Object.keys(state.picked).map(function (k) { return state.picked[k]; }).join(', ');
      var buttons = values.map(function (val) {
        var ok = valueAvailable(cat, state.picked, optIdx, val);
        return (
          '<li><button type="button" class="cart-gift__size" data-gift-value="' + esc(val) + '"' + (ok && !state.busy ? '' : ' disabled') + '>' +
            esc(val) + (ok ? '' : '<span class="visually-hidden"> (out of stock)</span>') +
          '</button></li>'
        );
      }).join('');
  
      return (
        head +
        '<div class="cart-gift__preview">' +
          '<span class="cart-gift__preview-media">' + tileImage(imageFor(cat, state.picked), previewTitle) + '</span>' +
          '<div class="cart-gift__preview-text">' +
            '<span class="cart-gift__preview-title">' + esc(previewTitle) + '</span>' +
            (chosen ? '<span class="cart-gift__preview-variant">' + esc(chosen) + '</span>' : '') +
            '<span class="cart-gift__free">Free</span>' +
          '</div>' +
        '</div>' +
        '<p class="cart-gift__note" id="cart-gift-size-label">Choose a ' + esc(optName.toLowerCase()) + ' to add it to your bag</p>' +
        '<ul class="cart-gift__sizes" role="list" aria-labelledby="cart-gift-size-label">' + buttons + '</ul>'
      );
    }
  
    function variantText(line) {
      var parts = (line.options_with_values || [])
        .filter(function (o) { return o.value && o.value !== 'Default Title'; })
        .map(function (o) { return o.name + ': ' + o.value; });
      return parts.join(' | ');
    }
  
    function renderSelected(ctx) {
      var line = ctx.gift;
      var v = variantText(line);
      return (
        '<div class="cart-gift__selected">' +
          '<span class="cart-gift__preview-media">' + tileImage(line.image, line.product_title) + '</span>' +
          '<div class="cart-gift__preview-text">' +
            '<span class="cart-gift__preview-title">' + esc(line.product_title) + '</span>' +
            (v ? '<span class="cart-gift__preview-variant">' + esc(v) + '</span>' : '') +
            '<span class="cart-gift__preview-variant">Gift with orders ' + money(config.threshold) + '+</span>' +
          '</div>' +
          '<span class="cart-gift__free">Free</span>' +
        '</div>' +
        '<div class="cart-gift__selected-actions">' +
          '<button type="button" class="cart-gift__link" data-gift-change data-gift-focus' + (state.busy ? ' disabled' : '') + '>Change gift</button>' +
          '<button type="button" class="cart-gift__switch" role="switch" aria-checked="true" data-gift-remove' + (state.busy ? ' disabled' : '') + '>' +
            '<span class="cart-gift__switch-text">Added</span>' +
            '<span class="cart-gift__switch-track" aria-hidden="true"><span class="cart-gift__switch-thumb">' + icons.check + '</span></span>' +
          '</button>' +
        '</div>'
      );
    }
  
    function renderPanel(ctx) {
      var el = document.querySelector('[data-cart-gift]');
      if (!el) return;
      if (!ctx.itemCount) {
        el.hidden = true;
        return;
      }
  
      // Open automatically the moment the gift unlocks (until the customer toggles it themselves).
      if (wasUnlocked === false && ctx.unlocked && !ctx.gift) state.expanded = true;
      wasUnlocked = ctx.unlocked;
      if (!ctx.unlocked) {
        state.changing = false;
        resetPicker();
      }
      if (state.cat != null && !config.categories[state.cat]) resetPicker();
  
      var expanded = state.expanded != null ? state.expanded : (ctx.unlocked && !ctx.gift);
      var count = ctx.gift ? 1 : 0;
  
      var body;
      if (!ctx.unlocked) body = renderLocked(ctx);
      else if (ctx.gift && !state.changing) body = renderSelected(ctx);
      else if (state.cat != null) body = renderStep();
      else body = renderCategories(ctx);
  
      el.innerHTML =
        '<div class="cart-gift__inner' + (ctx.unlocked ? ' is-unlocked' : ' is-locked') + '">' +
          '<button type="button" class="cart-gift__toggle" data-gift-toggle aria-expanded="' + expanded + '" aria-controls="cart-gift-body">' +
            '<span class="cart-gift__heading">' + esc(config.heading) + '</span>' +
            '<span class="cart-gift__count">' + count + '/1</span>' +
            '<span class="cart-gift__toggle-icon">' + (expanded ? icons.minus : icons.plus) + '</span>' +
          '</button>' +
          '<div class="cart-gift__body" id="cart-gift-body"' + (expanded ? '' : ' hidden') + (state.busy ? ' aria-busy="true"' : '') + '>' +
            (state.error ? '<p class="cart-gift__error" role="alert">' + esc(state.error) + '</p>' : '') +
            body +
          '</div>' +
        '</div>';
      el.hidden = false;
  
      if (state.focus) {
        var target = el.querySelector(state.focus);
        if (target) target.focus();
        state.focus = null;
      }
    }
  
    function render(cart) {
      var ctx = analyze(cart);
      lastCtx = ctx;
      lastCart = cart;
      renderProgress(ctx);
      renderPanel(ctx);
    }
  
    function rerender(focusSelector) {
      if (focusSelector) state.focus = focusSelector;
      if (lastCart) render(lastCart);
    }
  
    /* ---------------------------------------------------------------- actions */
  
    function refreshDrawer() {
      if (theme.CartDrawer && theme.CartDrawer.renderCart) theme.CartDrawer.renderCart();
    }
  
    function addGift(variant, cat) {
      if (!variant || state.busy) return;
      state.busy = true;
      state.error = '';
      rerender();
  
      var removeOld = (lastCtx ? lastCtx.giftLines : []).map(function (l) { return [l.key, 0]; });
      var props = {};
      props[GIFT_PROP] = 'true';
      props._gift_category = cat.label;
  
      runChanges(removeOld)
        .then(function () {
          return postJSON(routes().add, { items: [{ id: variant.id, quantity: 1, properties: props }] });
        })
        .then(function () {
          state.busy = false;
          state.changing = false;
          resetPicker();
          state.focus = '[data-gift-change]';
          refreshDrawer();
        })
        .catch(function (err) {
          state.busy = false;
          state.error = (err && err.message) ? err.message : 'This gift couldn’t be added. Try another option.';
          refreshDrawer();
        });
    }
  
    function removeGift() {
      if (state.busy || !lastCtx || !lastCtx.giftLines.length) return;
      state.busy = true;
      state.error = '';
      rerender();
      runChanges(lastCtx.giftLines.map(function (l) { return [l.key, 0]; }))
        .catch(function () {})
        .then(function () {
          state.busy = false;
          state.changing = false;
          state.expanded = true;
          resetPicker();
          state.focus = '[data-gift-cat]:not([disabled])';
          refreshDrawer();
        });
    }
  
    function onClick(e) {
      var t = e.target.closest('button');
      if (!t || t.disabled) return;
  
      if (t.hasAttribute('data-gift-toggle')) {
        var open = t.getAttribute('aria-expanded') === 'true';
        state.expanded = !open;
        rerender('[data-gift-toggle]');
        return;
      }
      if (state.busy) return;
      state.error = '';
  
      if (t.hasAttribute('data-gift-cat')) {
        var idx = parseInt(t.getAttribute('data-gift-cat'), 10);
        var cat = config.categories[idx];
        if (!cat) return;
        if (!cat.steps.length) {
          addGift(findVariant(cat, {}), cat);
          return;
        }
        state.cat = idx;
        state.stepPos = 0;
        state.picked = {};
        rerender('[data-gift-focus]');
        return;
      }
  
      if (t.hasAttribute('data-gift-value')) {
        var c = config.categories[state.cat];
        if (!c) return;
        var optIdx = c.steps[state.stepPos];
        state.picked[optIdx] = t.getAttribute('data-gift-value');
        if (state.stepPos < c.steps.length - 1) {
          state.stepPos += 1;
          rerender('[data-gift-focus]');
        } else {
          addGift(findVariant(c, state.picked), c);
        }
        return;
      }
  
      if (t.hasAttribute('data-gift-back')) {
        var cc = config.categories[state.cat];
        if (state.stepPos > 0 && cc) {
          delete state.picked[cc.steps[state.stepPos]];
          state.stepPos -= 1;
          delete state.picked[cc.steps[state.stepPos]];
        } else {
          resetPicker();
        }
        rerender('[data-gift-focus], [data-gift-cat]:not([disabled])');
        return;
      }
  
      if (t.hasAttribute('data-gift-change')) {
        state.changing = true;
        resetPicker();
        rerender('[data-gift-cat]:not([disabled])');
        return;
      }
  
      if (t.hasAttribute('data-gift-keep')) {
        state.changing = false;
        resetPicker();
        rerender('[data-gift-change]');
        return;
      }
  
      if (t.hasAttribute('data-gift-remove')) {
        removeGift();
      }
    }
  
    /* ---------------------------------------------------------------- public */
  
    function update(cart) {
      var ctx = analyze(cart);
      var ops = rulesFor(ctx);
  
      if (ops.length && !enforcing && !enforceFailed) {
        enforcing = true;
        runChanges(ops)
          .catch(function () { enforceFailed = true; })
          .then(function () {
            enforcing = false;
            refreshDrawer();
          });
      } else if (!ops.length) {
        enforceFailed = false;
      }
      render(cart);
    }
  
    var panelEl = document.querySelector('[data-cart-gift]');
    if (panelEl) panelEl.addEventListener('click', onClick);
  
    theme.CartGift = { isGiftLine: isGiftLine, update: update };
  
    // A gift is in the cart on page load: make sure it still qualifies (covers changes made on /cart).
    if (config.cartHasGift) {
      fetch(routes().cart, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          var ops = rulesFor(analyze(cart));
          if (!ops.length) return;
          return runChanges(ops).then(function () {
            if (config.template === 'cart') window.location.reload();
          });
        })
        .catch(function () {});
    }
  })();