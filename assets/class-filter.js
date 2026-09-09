(function () {
    'use strict';
  
    function initClassFilter() {
      var selects = document.querySelectorAll('[data-class-filter-select]');
      var items = document.querySelectorAll('[data-class-tag]');
  
      if (!selects.length || !items.length) return;
  
      // Collect every unique tag found across all "Featured collection (Class tag)" sections
      var tagSet = {};
      var tagOrder = [];
  
      items.forEach(function (el) {
        var raw = el.getAttribute('data-class-tag') || '';
        raw.split(',').forEach(function (t) {
          t = t.trim();
          if (t && !tagSet[t]) {
            tagSet[t] = true;
            tagOrder.push(t);
          }
        });
      });
  
      // Populate every dropdown on the page with the discovered tags
      selects.forEach(function (select) {
        tagOrder.forEach(function (tag) {
          var opt = document.createElement('option');
          opt.value = tag;
          opt.textContent = tag;
          select.appendChild(opt);
        });
  
        select.addEventListener('change', function (event) {
          filterSections(event.target.value);
        });
      });
  
      function itemMatches(el, value) {
        if (value === 'all') return true;
        var raw = el.getAttribute('data-class-tag') || '';
        var tags = raw.split(',').map(function (t) { return t.trim(); });
        return tags.indexOf(value) !== -1;
      }
  
      function filterSections(value) {
        items.forEach(function (el) {
          if (itemMatches(el, value)) {
            el.classList.remove('is-hidden-by-class-filter');
          } else {
            el.classList.add('is-hidden-by-class-filter');
          }
        });
      }
  
      // Default state: show everything until a class is chosen
      filterSections('all');
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initClassFilter);
    } else {
      initClassFilter();
    }
  })();