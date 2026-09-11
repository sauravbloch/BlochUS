(function () {
  'use strict';

  function formatMoney(cents) {
    var moneyFormat = window.theme && window.theme.moneyFormat ? window.theme.moneyFormat : '${{ amount }}';
    if (window.theme && window.theme.Shopify && typeof window.theme.Shopify.formatMoney === 'function') {
      return window.theme.Shopify.formatMoney(cents, moneyFormat);
    }
    return (cents / 100).toFixed(2);
  }

  function initCard(card) {
    if (!card || card.getAttribute('data-stl-card-init') === 'true') return;
    card.setAttribute('data-stl-card-init', 'true');

    var form = card.querySelector('form.ajax-product-form');
    var variantSelect = card.querySelector('[data-shop-the-look-variant-select]');
    var optionControls = card.querySelectorAll('[data-shop-the-look-options] [data-option-index]');
    var priceEl = card.querySelector('[data-shop-the-look-price]');
    var addBtn = form ? form.querySelector('[data-add-to-cart]') : null;
    var addBtnWrap = form ? form.querySelector('[data-add-to-cart-tooltip]') : null;
    var bulkCheckbox = card.querySelector('[data-bulk-select-checkbox]');
    var bulkCheckboxLabel = bulkCheckbox ? bulkCheckbox.closest('label') : null;
    if (!form || !variantSelect) return;

    var missingOptionNames = [];
    Array.prototype.forEach.call(optionControls, function (el) {
      var label = (el.getAttribute('aria-label') || '').toLowerCase();
      if (label) missingOptionNames.push(label);
    });
    var tooltipText = missingOptionNames.length
      ? 'Select ' + missingOptionNames.join(' and ')
      : 'Select an option';

    // Whether this product has ANY purchasable variant at all (independent of
    // whatever size/width option is currently selected). This is what should
    // gate the bulk checkbox - a shopper should be able to check the box
    // right away and pick size/width later, as long as the product isn't
    // completely sold out.
    var productHasAvailableVariant = false;
    Array.prototype.forEach.call(variantSelect.options, function (opt) {
      if (opt.getAttribute('data-available') === 'true') {
        productHasAvailableVariant = true;
      }
    });

    if (bulkCheckbox) {
      bulkCheckbox.disabled = !productHasAvailableVariant;
      if (bulkCheckboxLabel && !productHasAvailableVariant) {
        bulkCheckboxLabel.setAttribute('title', 'Sold out');
      }
    }

    function getOptionPairs() {
      var indices = {};
      Array.prototype.forEach.call(optionControls, function (el) {
        if (!el) return;
        var idx = parseInt(el.getAttribute('data-option-index') || '0', 10);
        indices[idx] = true;
      });

      var pairs = [];
      Object.keys(indices).forEach(function (k) {
        var idx = parseInt(k, 10);
        var value = '';

        var checkedRadio = card.querySelector('[data-shop-the-look-options] input[type="radio"][data-option-index="' + idx + '"]:checked');
        if (checkedRadio) {
          value = checkedRadio.value || '';
        } else {
          var sel = card.querySelector('[data-shop-the-look-options] select[data-option-index="' + idx + '"]');
          if (sel) value = sel.value || '';
        }

        pairs.push({ idx: idx, value: value });
      });

      return pairs;
    }

    function getSelectedVariant() {
      if (optionControls.length === 0) {
        var sel = variantSelect.options[variantSelect.selectedIndex];
        return sel && !sel.disabled ? sel : null;
      }
      var optPairs = getOptionPairs();
      var options = Array.prototype.slice.call(variantSelect.options);
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        if (opt.disabled) continue;
        var match = true;
        for (var j = 0; j < optPairs.length; j++) {
          var p = optPairs[j];
          var dataVal = opt.getAttribute('data-option-' + p.idx);
          if (dataVal !== p.value) { match = false; break; }
        }
        if (match) return opt;
      }
      return null;
    }

    function updateState() {
      var variantOption = getSelectedVariant();
      if (variantOption) {
        variantSelect.value = variantOption.value;
        if (priceEl) priceEl.textContent = formatMoney(parseInt(variantOption.getAttribute('data-price'), 10));
        var isAvailable = variantOption.getAttribute('data-available') === 'true';
        if (addBtn) {
          addBtn.disabled = !isAvailable;
          addBtn.classList.toggle('shop-the-look-card__add-btn--disabled', addBtn.disabled);
        }
        if (bulkCheckbox) {
          bulkCheckbox.disabled = !isAvailable;
        }
        if (bulkCheckboxLabel) {
          if (isAvailable) {
            bulkCheckboxLabel.removeAttribute('title');
          } else {
            bulkCheckboxLabel.setAttribute('title', 'Sold out in that size');
          }
        }
        if (addBtnWrap) {
          if (isAvailable) {
            addBtnWrap.removeAttribute('title');
          } else {
            addBtnWrap.setAttribute('title', 'Sold out in that size');
          }
        }
      } else {
        if (addBtn) {
          addBtn.disabled = true;
          addBtn.classList.add('shop-the-look-card__add-btn--disabled');
        }
        if (bulkCheckboxLabel && productHasAvailableVariant) {
          bulkCheckboxLabel.setAttribute('title', tooltipText);
        }
        if (addBtnWrap) {
          addBtnWrap.setAttribute('title', tooltipText);
        }
      }
      if (bulkCheckbox) {
        // Let bulk-add-to-cart.js know a checkbox's availability/checked state may have changed,
        // even when we changed it programmatically (which doesn't fire a native change event).
        bulkCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    Array.prototype.forEach.call(optionControls, function (el) {
      el.addEventListener('change', updateState);
    });
    updateState();

    // Always submit manually so we send whatever variant is CURRENTLY selected.
    // (The theme's own initAjaxAddToCartForm expects its own variant-picker markup
    // and can cache the initial variant id at load time, ignoring updates made here.)
    form.addEventListener('submit', function (evt) {
      evt.preventDefault();
      updateState(); // re-sync one last time in case of a race with a change event
      var formData = new FormData(form);
      fetch((window.theme && window.theme.routes && window.theme.routes.cart_add_url ? window.theme.routes.cart_add_url : '/cart/add') + '.js', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new URLSearchParams(formData)
      }).then(function () {
        if (window.theme && window.theme.CartDrawer && typeof window.theme.CartDrawer.open === 'function') {
          window.theme.CartDrawer.open();
        }
      }).catch(function () {});
    });
  }

  function initAll(root) {
    var scope = root || document;
    var cards = scope.querySelectorAll('[data-shop-the-look-card]');
    Array.prototype.forEach.call(cards, initCard);
  }

  window.initShopTheLookCards = initAll;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }

  // Theme Editor: init any cards inside a newly (re)loaded section
  document.addEventListener('shopify:section:load', function (event) {
    initAll(event.target);
  });
})();