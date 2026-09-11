(function () {
    'use strict';
  
    // Klaviyo's public "Client API" endpoint for subscribing a profile to a list.
    // NOTE: verify this endpoint/payload shape against Klaviyo's current API
    // reference before relying on it in production - API details can change,
    // and this was written without live access to Klaviyo's docs.
    var KLAVIYO_API_BASE = 'https://a.klaviyo.com/client/subscriptions/';
    var KLAVIYO_API_REVISION = '2024-10-15';
  
    function setResponse(form, message, isError) {
      var wrap = form.closest('.subscribe-form');
      if (!wrap) return;
      var responseEl = wrap.querySelector('[data-klaviyo-response]');
      if (!responseEl) return;
  
      responseEl.textContent = message;
      responseEl.hidden = !message;
      responseEl.classList.toggle('subscribe-form__response--success', !isError && !!message);
      responseEl.classList.toggle('subscribe-form__response--error', !!isError && !!message);
    }
  
    function handleSubmit(evt) {
      evt.preventDefault();
      var form = evt.target;
      var emailInput = form.querySelector('input[type="email"]');
      var button = form.querySelector('button[type="submit"]');
      var companyId = form.getAttribute('data-klaviyo-company-id');
      var listId = form.getAttribute('data-klaviyo-list-id');
  
      if (!emailInput || !emailInput.value) return;
      if (!companyId || !listId) {
        console.error('Klaviyo subscribe form is missing data-klaviyo-company-id or data-klaviyo-list-id.');
        return;
      }
  
      var email = emailInput.value.trim();
      var originalDisabled = button ? button.disabled : false;
      if (button) button.disabled = true;
      setResponse(form, '', false);
  
      var payload = {
        data: {
          type: 'subscription',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email: email
                }
              }
            }
          },
          relationships: {
            list: {
              data: {
                type: 'list',
                id: listId
              }
            }
          }
        }
      };
  
      fetch(KLAVIYO_API_BASE + '?company_id=' + encodeURIComponent(companyId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'revision': KLAVIYO_API_REVISION
        },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          // Klaviyo's subscribe endpoint returns 202 Accepted with no body on success.
          if (res.ok) {
            setResponse(form, 'Thanks for signing up!', false);
            form.reset();
          } else {
            setResponse(form, 'Something went wrong. Please try again.', true);
          }
        })
        .catch(function () {
          setResponse(form, 'Something went wrong. Please try again.', true);
        })
        .finally(function () {
          if (button) button.disabled = originalDisabled;
        });
    }
  
    function initForm(form) {
      if (form.getAttribute('data-klaviyo-init') === 'true') return;
      form.setAttribute('data-klaviyo-init', 'true');
      form.addEventListener('submit', handleSubmit);
    }
  
    function initAll(root) {
      var scope = root || document;
      var forms = scope.querySelectorAll('[data-klaviyo-subscribe-form]');
      Array.prototype.forEach.call(forms, initForm);
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { initAll(document); });
    } else {
      initAll(document);
    }
  
    document.addEventListener('shopify:section:load', function (event) {
      initAll(event.target);
    });
  })();