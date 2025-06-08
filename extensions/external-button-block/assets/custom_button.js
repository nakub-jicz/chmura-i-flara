// extensions/external-button-block/assets/custom_button.js
// DC External Links - External buttons handling script

(function () {
  const CustomButtonScript = {
    // Configuration
    config: {
      trackClicks: true,
      showConfirmation: false, // Can be enabled for redirect confirmation
    },

    // Handle external button clicks
    handleExternalClick: function (buttonElement) {
      try {
        const url = buttonElement.getAttribute('data-external-url');
        const buttonText = buttonElement.querySelector('.button-text')?.textContent || 'Unknown';

        if (!url) {
          this.showUserMessage('Error: Link is not configured', 'error');
          return;
        }

        // URL validation
        if (!this.isValidUrl(url)) {
          this.showUserMessage('Error: Invalid link', 'error');
          return;
        }

        // Click tracking
        if (this.config.trackClicks) {
          this.trackClick(url, buttonText, buttonElement);
        }

        // Optional confirmation
        if (this.config.showConfirmation) {
          if (!confirm(`Do you want to go to: ${url}?`)) {
            return;
          }
        }

        // Click animation and loading state
        this.animateClick(buttonElement);
        buttonElement.classList.add('loading');

        // Redirect
        this.showUserMessage('Redirecting...', 'info');

        // Short delay for animation
        setTimeout(() => {
          window.open(url, '_blank', 'noopener,noreferrer');
          // Remove loading state after redirect
          setTimeout(() => {
            buttonElement.classList.remove('loading');
          }, 1000);
        }, 200);

      } catch (error) {
        this.showUserMessage('An error occurred during redirect', 'error');
      }
    },

    // URL validation
    isValidUrl: function (string) {
      try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch (_) {
        return false;
      }
    },

    // Click tracking
    trackClick: function (url, buttonText, buttonElement) {
      try {
        // Google Analytics 4
        if (typeof gtag !== 'undefined') {
          gtag('event', 'external_link_click', {
            'external_url': url,
            'button_text': buttonText,
            'product_id': this.getProductId(buttonElement)
          });
        }

        // Google Analytics Universal
        if (typeof ga !== 'undefined') {
          ga('send', 'event', 'External Links', 'Click', url);
        }

        // Shopify Analytics
        if (typeof analytics !== 'undefined' && analytics.track) {
          analytics.track('External Link Clicked', {
            url: url,
            buttonText: buttonText,
            productId: this.getProductId(buttonElement)
          });
        }

        // Custom event for custom scripts
        const customEvent = new CustomEvent('clearifyExternalLinkClick', {
          detail: {
            url: url,
            buttonText: buttonText,
            productId: this.getProductId(buttonElement),
            timestamp: new Date().toISOString()
          }
        });
        document.dispatchEvent(customEvent);

      } catch (error) {
        // Silent fail for tracking
      }
    },

    // Get product ID from context
    getProductId: function (buttonElement) {
      const container = buttonElement.closest('.custom-external-button-container');
      return container ? container.getAttribute('data-product-id') : null;
    },

    // Click animation
    animateClick: function (buttonElement) {
      buttonElement.style.transform = 'scale(0.95)';
      buttonElement.style.opacity = '0.8';

      setTimeout(() => {
        buttonElement.style.transform = 'scale(1)';
        buttonElement.style.opacity = '1';
      }, 200);
    },

    // Display messages to user
    showUserMessage: function (message, type = 'info') {
      // Check if Shopify Toast is available (in apps)
      if (typeof shopify !== 'undefined' && shopify.toast) {
        shopify.toast.show(message, {
          isError: type === 'error',
          duration: type === 'error' ? 5000 : 3000
        });
        return;
      }

      // Fallback - create own toast
      this.createToast(message, type);
    },

    // Create custom toast notification
    createToast: function (message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `clearify-toast toast-${type}`;
      toast.textContent = message;

      // Styles
      Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: '10000',
        fontSize: '14px',
        maxWidth: '300px',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease'
      });

      document.body.appendChild(toast);

      // Show animation
      setTimeout(() => {
        toast.style.transform = 'translateX(0)';
      }, 100);

      // Remove after time
      setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, type === 'error' ? 5000 : 3000);
    },

    // Initialize hiding ATC buttons
    initHideATC: function (options = {}) {
      try {
        const {
          productId,
          customSelector = '',
          retryAttempts = 3,
          retryDelay = 1000
        } = options;

        // Expanded selectors for better theme compatibility
        const defaultSelectors = [
          // Standard Shopify selectors
          '.product-form__buttons button[name="add"]',
          '.product-form__cart-submit',
          '.btn.product-form__cart-submit',
          '.product-form .btn[type="submit"]',

          // Dawn theme
          '.product-form__buttons .product-form__cart-submit',
          '.product-form__buttons button.product-form__cart-submit',

          // Common theme patterns
          '.add-to-cart-button',
          '.btn-add-to-cart',
          '.product-add-to-cart',
          '.cart-submit-button',
          '.addtocart-button',
          '.add-cart-button',

          // ID-based selectors
          '#add-to-cart',
          '#AddToCart',
          '#product-add-to-cart',
          '#add-to-cart-button',
          '#addToCart',
          '#add_to_cart',

          // More specific patterns
          'button[type="submit"][name="add"]',
          'input[type="submit"][name="add"]',
          '.shopify-payment-button__button--unbranded',
          '.product-submit-button',
          '.product-form button.btn',

          // Sectioned selectors
          '.product-form form button[type="submit"]',
          '.product-single__form button[type="submit"]',
          '.product-details form button[type="submit"]',
          '.product-info form button[type="submit"]',

          // Additional common selectors
          '.add-to-cart',
          '.atc-button',
          '.buy-button',
          '.purchase-button',
          '.cart-button',
          '.buy-now-button',

          // Popular theme specific selectors
          '.product-form__add-button', // Impulse theme
          '.btn-addtocart', // Brooklyn theme
          '.cart-btn', // Venture theme
          '.product-add', // Supply theme
          '.js-btn-addtocart', // Various themes
          '.addToCart', // Camel case variants

          // Form-based selectors
          'form[action*="/cart/add"] button[type="submit"]',
          'form[action*="/cart/add"] input[type="submit"]',
          'form[action="/cart/add"] button',
          'form[action="/cart/add"] input[type="submit"]'
        ];

        // Add custom selector if provided
        let selectors = [...defaultSelectors];
        if (customSelector && customSelector.trim()) {
          selectors.unshift(customSelector.trim());
        }

        let attempts = 0;
        const maxAttempts = retryAttempts || 3;

        const hideAttempt = () => {
          attempts++;

          let hiddenCount = 0;

          selectors.forEach(selector => {
            try {
              const buttons = document.querySelectorAll(selector);
              if (buttons.length > 0) {
                buttons.forEach(button => {
                  if (button && button.style.display !== 'none') {
                    // Hide button
                    button.style.display = 'none';
                    button.style.visibility = 'hidden';
                    button.style.opacity = '0';
                    button.setAttribute('data-clearify-hidden', 'true');
                    hiddenCount++;
                  }
                });
              }
            } catch (error) {
              // Silent fail for selector errors
            }
          });

          if (hiddenCount === 0 && attempts < maxAttempts) {
            setTimeout(hideAttempt, retryDelay);
          } else {
            // Dispatch completion event
            document.dispatchEvent(new CustomEvent('clearifyATCHideComplete', {
              detail: { hiddenCount, attempts, productId }
            }));
          }
        };

        // Start hiding process
        hideAttempt();

      } catch (error) {
        // Silent fail
      }
    },

    // Render buttons from JSON data (new format)
    renderExternalButtons: function (container, externalLinksData, productId) {
      try {
        let externalLinks;

        // Parse JSON if needed
        if (typeof externalLinksData === 'string') {
          // Handle empty or invalid data
          if (!externalLinksData || externalLinksData.trim() === '' || externalLinksData === '[]') {
            container.innerHTML = '';
            return;
          }

          try {
            externalLinks = JSON.parse(externalLinksData);
          } catch (parseError) {
            // Try to decode HTML entities and convert Ruby hash syntax
            try {
              let decoded = externalLinksData
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');

              // Convert Ruby hash syntax to JSON
              decoded = decoded
                .replace(/=>/g, ':')  // Replace => with :
                .replace(/([{,]\s*)(\w+):/g, '$1"$2":');  // Quote only hash keys, not URLs

              externalLinks = JSON.parse(decoded);
            } catch (secondParseError) {
              container.innerHTML = '';
              return;
            }
          }
        } else {
          return;
        }

        // Clear container
        container.innerHTML = '';

        // Filter enabled links
        const enabledLinks = externalLinks.filter(link =>
          link.enabled && link.url && link.url.trim() !== ''
        );

        if (enabledLinks.length === 0) {
          return;
        }

        // Get block settings for notices
        const containerElement = document.querySelector(`[data-product-id="${productId}"]`);
        const blockSettings = this.getBlockSettings(containerElement);

        // Create buttons
        enabledLinks.forEach((link, index) => {
          const button = this.createButton(link, index, productId);
          container.appendChild(button);
        });

        // Add tracking notice once at the bottom if enabled
        if (blockSettings.show_tracking_notice && blockSettings.tracking_notice_text) {
          const notice = document.createElement('small');
          notice.className = 'external-link-notice';
          notice.style.cssText = 'display: block; margin-top: 10px; color: #666; font-size: 0.8em; text-align: center;';
          notice.textContent = blockSettings.tracking_notice_text;
          container.appendChild(notice);
        }

      } catch (error) {
        // Silent fail
      }
    },

    // Create single button element
    createButton: function (linkData, index, productId) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'external-link-button';
      button.setAttribute('data-external-url', linkData.url);
      button.setAttribute('data-button-index', index);
      button.setAttribute('data-product-id', productId);

      // Get block settings from container (passed from Liquid)
      const container = document.querySelector(`[data-product-id="${productId}"]`);
      const blockSettings = this.getBlockSettings(container);

      // Apply preset classes
      const preset = blockSettings.button_preset || 'primary_medium';
      button.className += ' preset-' + preset.replace('_', '-');

      // Button content
      const buttonContent = document.createElement('span');
      buttonContent.className = 'button-text';

      // Create text span
      const textSpan = document.createElement('span');
      textSpan.textContent = linkData.text || 'External Link';

      // Add text
      buttonContent.appendChild(textSpan);



      button.appendChild(buttonContent);

      // Click handler
      button.addEventListener('click', () => {
        this.handleExternalClick(button);
      });

      return button;
    },

    // Extract block settings from container data attributes
    getBlockSettings: function (container) {
      if (!container) return {};

      const settings = {};

      // Get all data attributes that start with 'data-block-'
      Array.from(container.attributes).forEach(attr => {
        if (attr.name.startsWith('data-block-')) {
          const settingName = attr.name.replace('data-block-', '').replace(/-/g, '_');
          let value = attr.value;

          // Convert string values to appropriate types
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (!isNaN(value) && value !== '') value = Number(value);

          settings[settingName] = value;
        }
      });

      return settings;
    },

    // Main initialization
    init: function () {
      // Process containers
      const containers = document.querySelectorAll('.custom-external-button-container');

      containers.forEach((container, index) => {
        try {
          const productId = container.getAttribute('data-product-id');
          const hideAtc = container.getAttribute('data-hide-atc') === 'true';
          const externalLinksData = container.getAttribute('data-external-links');
          const atcOverrideSelector = container.getAttribute('data-atc-override-selector');



          // Hide ATC buttons if requested
          if (hideAtc) {
            this.initHideATC({
              productId,
              customSelector: atcOverrideSelector,
              retryAttempts: 3,
              retryDelay: 1000
            });
          }

          // Render buttons if we have data
          if (externalLinksData && externalLinksData.trim() !== '' && externalLinksData !== '[]') {
            const targetDiv = container.querySelector(`#external-buttons-${productId}`);
            if (targetDiv) {
              this.renderExternalButtons(targetDiv, externalLinksData, productId);
            }
          }

        } catch (error) {
          // Silent fail
        }
      });
    }
  };

  // Expose globally for legacy button clicks
  window.CustomButtonScript = CustomButtonScript;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CustomButtonScript.init());
  } else {
    CustomButtonScript.init();
  }

  // Re-run initialization when new content is loaded (e.g., AJAX)
  let initTimeout;
  const observer = new MutationObserver(() => {
    clearTimeout(initTimeout);
    initTimeout = setTimeout(() => CustomButtonScript.init(), 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();