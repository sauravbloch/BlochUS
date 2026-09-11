(function () {
  'use strict';

  function getRoot(button) {
    var scopeId = button.getAttribute('data-bulk-add-scope');
    if (scopeId) {
      var scoped = document.querySelector('[data-section-id="' + scopeId + '"]');
      if (scoped) return scoped;
    }
    return button.closest('[data-section-id]') || document;
  }

  function refreshButtonState(button) {
    var root = getRoot(button);
    var checked = root.querySelectorAll('[data-bulk-select-checkbox]:checked');
    button.disabled = checked.length === 0;

    var countEl = button.querySelector('[data-bulk-add-count]');
    if (countEl) {
      countEl.textContent = checked.length > 0 ? checked.length : '';
    }
  }

  function refreshAllButtons() {
    var buttons = document.querySelectorAll('[data-bulk-add-button]');
    Array.prototype.forEach.call(buttons, refreshButtonState);
  }

  function clearInvalidState(card) {
    var selects = card.querySelectorAll('[data-bulk-required-select]');
    Array.prototype.forEach.call(selects, function (sel) {
      sel.classList.remove('product-block__quick-add-select--invalid');
    });
  }

  function markInvalidState(card) {
    var selects = card.querySelectorAll('[data-bulk-required-select]');
    var firstInvalid = null;
    Array.prototype.forEach.call(selects, function (sel) {
      if (sel.value === '') {
        sel.classList.add('product-block__quick-add-select--invalid');
        if (!firstInvalid) firstInvalid = sel;
      } else {
        sel.classList.remove('product-block__quick-add-select--invalid');
      }
    });
    return firstInvalid;
  }

  function collectSelections(root) {
    var checkboxes = root.querySelectorAll('[data-bulk-select-checkbox]:checked');
    var items = [];
    var firstInvalidField = null;

    Array.prototype.forEach.call(checkboxes, function (cb) {
      var card = cb.closest('[data-shop-the-look-card]');
      if (!card) return;

      var invalidField = markInvalidState(card);
      if (invalidField) {
        if (!firstInvalidField) firstInvalidField = invalidField;
        return;
      }

      clearInvalidState(card);

      var variantSelect = card.querySelector('[data-shop-the-look-variant-select]');
      if (!variantSelect) return;
      var selected = variantSelect.options[variantSelect.selectedIndex];
      if (!selected || selected.disabled || selected.value === '') return;
      items.push({ id: parseInt(selected.value, 10), quantity: 1 });
    });

    return { items: items, firstInvalidField: firstInvalidField };
  }

  function initButton(button) {
    if (button.getAttribute('data-bulk-add-init') === 'true') return;
    button.setAttribute('data-bulk-add-init', 'true');

    button.addEventListener('click', function () {
      var root = getRoot(button);
      var result = collectSelections(root);

      if (result.firstInvalidField) {
        result.firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        result.firstInvalidField.focus();
        if (typeof result.firstInvalidField.reportValidity === 'function') {
          result.firstInvalidField.reportValidity();
        }
        return;
      }
      if (!result.items.length) {
        return;
      }

      var originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Adding...';

      fetch((window.theme && window.theme.routes && window.theme.routes.cart_add_url ? window.theme.routes.cart_add_url : '/cart/add') + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ items: result.items })
      })
        .then(function (res) { return res.json(); })
        .then(function () {
          if (window.theme && window.theme.CartDrawer && typeof window.theme.CartDrawer.open === 'function') {
            window.theme.CartDrawer.open();
          } else {
            window.location.href = (window.theme && window.theme.routes && window.theme.routes.cart_url) || '/cart';
          }
        })
        .catch(function () {
          alert('Something went wrong adding these to your cart. Please try again.');
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = originalText;
        });
    });
  }

  function initAll(root) {
    var scope = root || document;
    var buttons = scope.querySelectorAll('[data-bulk-add-button]');
    Array.prototype.forEach.call(buttons, initButton);
    refreshAllButtons();
  }

  document.addEventListener('change', function (evt) {
    if (evt.target && evt.target.matches && evt.target.matches('[data-bulk-select-checkbox]')) {
      refreshAllButtons();
    }
    if (evt.target && evt.target.matches && evt.target.matches('[data-bulk-required-select]') && evt.target.value !== '') {
      evt.target.classList.remove('product-block__quick-add-select--invalid');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); }); 
  } else {
    initAll(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    initAll(event.target);
  });
})();