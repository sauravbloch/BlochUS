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
  
    function collectSelections(root) {
      var checkboxes = root.querySelectorAll('[data-bulk-select-checkbox]:checked');
      var items = [];
      var missingSize = [];
  
      Array.prototype.forEach.call(checkboxes, function (cb) {
        var card = cb.closest('[data-shop-the-look-card]');
        if (!card) return;
        var variantSelect = card.querySelector('[data-shop-the-look-variant-select]');
        if (!variantSelect) return;
        var selected = variantSelect.options[variantSelect.selectedIndex];
        if (!selected || selected.disabled || selected.value === '') {
          missingSize.push(card.getAttribute('data-product-id'));
          return;
        }
        items.push({ id: parseInt(selected.value, 10), quantity: 1 });
      });
  
      return { items: items, missingSize: missingSize };
    }
  
    function initButton(button) {
      if (button.getAttribute('data-bulk-add-init') === 'true') return;
      button.setAttribute('data-bulk-add-init', 'true');
  
      button.addEventListener('click', function () {
        var root = getRoot(button);
        var result = collectSelections(root);
  
        if (result.missingSize.length) {
          alert('Please select a size for every selected product before adding to cart.');
          return;
        }
        if (!result.items.length) {
          alert('Select at least one product first.');
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