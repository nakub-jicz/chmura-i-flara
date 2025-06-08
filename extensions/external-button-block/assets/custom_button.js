// extensions/external-button-block/assets/custom_button.js
// DC External Links - Skrypt obsługi zewnętrznych przycisków

(function () {
  const CustomButtonScript = {
    // Konfiguracja
    config: {
      enableLogging: true,
      trackClicks: true,
      showConfirmation: false, // Można włączyć dla potwierdzenia przekierowań
    },

    // Funkcja logowania
    log: function (message, data = null) {
      if (this.config.enableLogging && console && console.log) {
        console.log(`[DC External Links] ${message}`, data || '');
      }
    },

    // Obsługa kliknięć w zewnętrzne przyciski
    handleExternalClick: function (buttonElement) {
      try {
        const url = buttonElement.getAttribute('data-external-url');
        const buttonText = buttonElement.querySelector('.button-text')?.textContent || 'Nieznany';

        if (!url) {
          this.log('Błąd: Brak URL w przycisku', buttonElement);
          this.showUserMessage('Błąd: Link nie jest skonfigurowany', 'error');
          return;
        }

        // Walidacja URL
        if (!this.isValidUrl(url)) {
          this.log('Błąd: Nieprawidłowy URL', url);
          this.showUserMessage('Błąd: Nieprawidłowy link', 'error');
          return;
        }

        // Śledzenie kliknięć
        if (this.config.trackClicks) {
          this.trackClick(url, buttonText, buttonElement);
        }

        // Opcjonalne potwierdzenie
        if (this.config.showConfirmation) {
          if (!confirm(`Czy chcesz przejść do: ${url}?`)) {
            this.log('Użytkownik anulował przekierowanie');
            return;
          }
        }

        // Animacja kliknięcia
        this.animateClick(buttonElement);

        // Przekierowanie
        this.log(`Przekierowanie do: ${url}`);
        this.showUserMessage('Przekierowywanie...', 'info');

        // Krótkie opóźnienie dla animacji
        setTimeout(() => {
          window.open(url, '_blank', 'noopener,noreferrer');
        }, 200);

      } catch (error) {
        this.log('Błąd podczas obsługi kliknięcia', error);
        this.showUserMessage('Wystąpił błąd podczas przekierowywania', 'error');
      }
    },

    // Walidacja URL
    isValidUrl: function (string) {
      try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch (_) {
        return false;
      }
    },

    // Śledzenie kliknięć
    trackClick: function (url, buttonText, buttonElement) {
      try {
        // Google Analytics 4
        if (typeof gtag !== 'undefined') {
          gtag('event', 'external_link_click', {
            'external_url': url,
            'button_text': buttonText,
            'product_id': this.getProductId(buttonElement)
          });
          this.log('GA4 event wysłany', { url, buttonText });
        }

        // Google Analytics Universal
        if (typeof ga !== 'undefined') {
          ga('send', 'event', 'External Links', 'Click', url);
          this.log('GA Universal event wysłany', url);
        }

        // Shopify Analytics
        if (typeof analytics !== 'undefined' && analytics.track) {
          analytics.track('External Link Clicked', {
            url: url,
            buttonText: buttonText,
            productId: this.getProductId(buttonElement)
          });
          this.log('Shopify Analytics event wysłany', { url, buttonText });
        }

        // Custom event dla własnych skryptów
        const customEvent = new CustomEvent('clearifyExternalLinkClick', {
          detail: {
            url: url,
            buttonText: buttonText,
            productId: this.getProductId(buttonElement),
            timestamp: new Date().toISOString()
          }
        });
        document.dispatchEvent(customEvent);
        this.log('Custom event wysłany', customEvent.detail);

      } catch (error) {
        this.log('Błąd podczas śledzenia', error);
      }
    },

    // Pobierz ID produktu z kontekstu
    getProductId: function (buttonElement) {
      const container = buttonElement.closest('.custom-external-button-container');
      return container ? container.getAttribute('data-product-id') : null;
    },

    // Animacja kliknięcia
    animateClick: function (buttonElement) {
      buttonElement.style.transform = 'scale(0.95)';
      buttonElement.style.opacity = '0.8';

      setTimeout(() => {
        buttonElement.style.transform = 'scale(1)';
        buttonElement.style.opacity = '1';
      }, 200);
    },

    // Wyświetlanie komunikatów użytkownikowi
    showUserMessage: function (message, type = 'info') {
      // Sprawdź czy dostępny jest Shopify Toast (w aplikacjach)
      if (typeof shopify !== 'undefined' && shopify.toast) {
        shopify.toast.show(message, {
          isError: type === 'error',
          duration: type === 'error' ? 5000 : 3000
        });
        return;
      }

      // Fallback - utworz własny toast
      this.createToast(message, type);
    },

    // Utworz własny toast notification
    createToast: function (message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `clearify-toast toast-${type}`;
      toast.textContent = message;

      // Style
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

      // Animacja pojawiania się
      setTimeout(() => {
        toast.style.transform = 'translateX(0)';
      }, 100);

      // Usunięcie po czasie
      setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, type === 'error' ? 5000 : 3000);
    },

    // Inicjalizacja ukrywania przycisków ATC
    initHideATC: function (options = {}) {
      try {
        this.log('Inicjalizacja ukrywania przycisków ATC');

        // Najpierw przywróć wszystkie wcześniej ukryte przyciski
        this.restoreATC();

        // Znajdź kontenery z włączonym ukrywaniem ATC
        const containersWithHideATC = document.querySelectorAll('.custom-external-button-container[data-hide-atc="true"]');

        if (containersWithHideATC.length === 0) {
          this.log('Brak kontenerów z włączonym ukrywaniem ATC - wszystkie przyciski zostały przywrócone');
          return 0;
        }

        // Domyślne selektory dla przycisków "Dodaj do koszyka"
        let atcSelectors = [
          'form[action^="/cart/add"] [type="submit"]',
          'form[action^="/cart/add"] .shopify-product-form__submit',
          '.product-form__buttons button[name="add"]',
          'button[data-add-to-cart-button]',
          '#AddToCart',
          '.add-to-cart-button',
          '.product-form__cart-submit',
          '.product-single__cart-submit-button',
          '.btn-addtocart',
          '.product__add-to-cart',
          '[data-product-form] button[type="submit"]',
          '.product-form button[type="submit"]',
          '.shopify-payment-button__button--unbranded',
          // Dodatkowe selektory dla popularnych motywów
          '.btn.product-form__cart-submit',
          '.product-single__cart-submit',
          '.add-item-form button',
          '.purchase-details__buttons .btn'
        ];

        let hiddenCount = 0;

        // Dla każdego kontenera z włączonym ukrywaniem
        containersWithHideATC.forEach(container => {
          const productId = container.getAttribute('data-product-id');
          const customSelector = container.getAttribute('data-atc-override-selector');

          this.log(`Ukrywanie ATC dla produktu ${productId}`, { customSelector });

          // Dodaj niestandardowy selektor jeśli podany
          let selectorsToUse = [...atcSelectors];
          if (customSelector) {
            selectorsToUse.unshift(customSelector);
            this.log('Dodano niestandardowy selektor ATC', customSelector);
          }

          // Znajdź i ukryj przyciski - szukaj w całym dokumencie, ale tylko jeśli nie są już ukryte
          selectorsToUse.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(button => {
              // Sprawdź czy przycisk nie został już ukryty przez naszą aplikację
              if (button && !button.hasAttribute('data-clearify-hidden')) {
                // Dodatkowa walidacja - nie ukrywaj przycisków zewnętrznych
                if (!button.classList.contains('external-link-button') &&
                  !button.closest('.custom-external-button-container')) {
                  button.style.display = 'none';
                  button.setAttribute('data-clearify-hidden', 'true');
                  button.setAttribute('data-clearify-product', productId);
                  hiddenCount++;
                  this.log(`Ukryto przycisk ATC dla produktu ${productId}: ${selector}`, button);
                }
              }
            });
          });
        });

        if (hiddenCount > 0) {
          this.log(`Ukryto ${hiddenCount} przycisków ATC`);
          // Nie pokazuj toast dla każdego ukrycia - może być zbyt irytujące
        } else {
          this.log('Nie znaleziono przycisków ATC do ukrycia');
        }

        return hiddenCount;

      } catch (error) {
        this.log('Błąd podczas ukrywania przycisków ATC', error);
        return 0;
      }
    },

    // Przywróć ukryte przyciski ATC (dla debugowania)
    restoreATC: function () {
      const hiddenButtons = document.querySelectorAll('[data-clearify-hidden="true"]');
      hiddenButtons.forEach(button => {
        button.style.display = '';
        button.removeAttribute('data-clearify-hidden');
        button.removeAttribute('data-clearify-product');
      });
      this.log(`Przywrócono ${hiddenButtons.length} przycisków ATC`);
      return hiddenButtons.length;
    },

    // Inicjalizacja skryptu
    init: function () {
      this.log('Inicjalizacja DC External Links');

      // Check for cache-busting parameter
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('cache_bust')) {
        this.log('Cache-busting parameter detected - forcing fresh render');
        // Clear any cached render times
        delete window.lastRenderTime;
      }

      // Renderuj przyciski z JSON data
      this.renderExternalButtons();

      // Sprawdź ukrywanie ATC dla wszystkich kontenerów
      setTimeout(() => {
        const containers = document.querySelectorAll('.custom-external-button-container');
        if (containers.length > 0) {
          this.log(`Znaleziono ${containers.length} kontenerów - sprawdzanie ukrywania ATC`);
          this.initHideATC();
        } else {
          this.log('Brak kontenerów');
        }
      }, 500); // Krótkie opóźnienie żeby wszystko się załadowało

      // Dodaj event listenery dla dynamicznie ładowanych przycisków
      document.addEventListener('DOMContentLoaded', () => {
        this.log('DOM załadowany, sprawdzanie przycisków...');
        this.renderExternalButtons();

        // Ponownie sprawdź ukrywanie ATC po załadowaniu DOM
        setTimeout(() => {
          const containers = document.querySelectorAll('.custom-external-button-container');
          if (containers.length > 0) {
            this.initHideATC();
          }
        }, 100);
      });

      // Observer dla dynamicznych zmian
      if (window.MutationObserver) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
              const addedNodes = Array.from(mutation.addedNodes);
              addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.querySelector) {
                  // Sprawdź czy dodano kontener z ATC (włączonym lub wyłączonym)
                  if (node.querySelector('.custom-external-button-container')) {
                    this.log('Nowy kontener - sprawdzam ukrywanie ATC');
                    setTimeout(() => this.initHideATC(), 100);
                  }
                  // Sprawdź czy dodano kontener z zewnętrznymi linkami
                  if (node.querySelector('.custom-external-button-container[data-external-links]')) {
                    this.log('Nowy kontener z zewnętrznymi linkami - renderuję przyciski');
                    this.renderExternalButtons();
                  }
                }
              });
            }
          });
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }

      // Expose metody globalnie dla debugowania
      if (typeof window !== 'undefined') {
        window.ClearifyDebug = {
          restoreATC: () => this.restoreATC(),
          hideATC: () => this.initHideATC(),
          renderButtons: () => this.renderExternalButtons(),
          checkForUpdates: () => this.checkForUpdates(),
          log: (msg) => this.log(msg),
          config: this.config
        };
      }

      // Periodically check for updates (every 30 seconds)
      setInterval(() => {
        this.checkForUpdates();
      }, 30000);

      this.log('DC External Links zainicjalizowane pomyślnie');
    },

    // Renderowanie przycisków z JSON data
    renderExternalButtons: function () {
      try {
        const containers = document.querySelectorAll('.custom-external-button-container[data-external-links]');
        this.log(`Znaleziono ${containers.length} kontenerów z zewnętrznymi linkami`);

        containers.forEach(container => {
          const jsonData = container.getAttribute('data-external-links');
          const productId = container.getAttribute('data-product-id');
          const timestamp = container.getAttribute('data-timestamp');
          const targetDiv = container.querySelector(`#external-buttons-${productId}`);

          this.log(`Przetwarzanie produktu ${productId}`, {
            hasJson: !!jsonData,
            hasTarget: !!targetDiv,
            jsonLength: jsonData ? jsonData.length : 0,
            timestamp: timestamp,
            lastRender: window.lastRenderTime || 'never'
          });

          // Skip if already rendered with this timestamp
          if (timestamp && window.lastRenderTime === timestamp) {
            this.log(`Skipping render for ${productId} - already rendered with timestamp ${timestamp}`);
            return;
          }

          if (!jsonData || !targetDiv) {
            this.log('Brak danych JSON lub kontenera docelowego', {
              productId,
              hasJson: !!jsonData,
              hasTarget: !!targetDiv,
              jsonData: jsonData ? jsonData.substring(0, 100) + '...' : 'BRAK'
            });
            return;
          }

          // Wyczyść poprzednie przyciski
          targetDiv.innerHTML = '';

          try {
            // Unescape HTML entities in JSON
            let unescapedJson = jsonData;

            // Handle common HTML escapes
            unescapedJson = unescapedJson
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');

            this.log(`JSON dla produktu ${productId}:`, {
              original: jsonData.substring(0, 200) + '...',
              unescaped: unescapedJson.substring(0, 200) + '...'
            });

            const externalLinks = JSON.parse(unescapedJson);

            if (!Array.isArray(externalLinks)) {
              this.log('Dane JSON nie są tablicą', { productId, data: externalLinks });
              return;
            }

            this.log(`Renderowanie ${externalLinks.length} linków dla produktu ${productId}`, externalLinks);

            let renderedCount = 0;
            externalLinks.forEach((link, index) => {
              this.log(`Sprawdzanie link ${index + 1}:`, {
                enabled: link.enabled,
                hasUrl: !!link.url,
                hasText: !!link.text,
                url: link.url ? link.url.substring(0, 50) + '...' : 'BRAK',
                text: link.text || 'BRAK'
              });

              if (link.enabled !== false && link.url && link.text) {
                const button = this.createExternalButton(link, index, container);
                targetDiv.appendChild(button);
                renderedCount++;
                this.log(`✅ Utworzono przycisk ${index + 1}: "${link.text}"`);
              } else {
                this.log(`❌ Pominięto link ${index + 1} - nie spełnia warunków`);
              }
            });

            this.log(`Produkto ${productId}: renderowano ${renderedCount}/${externalLinks.length} przycisków`);

            // Update render timestamp
            if (timestamp) {
              window.lastRenderTime = timestamp;
              this.log(`Updated lastRenderTime to ${timestamp}`);
            }

            if (renderedCount === 0) {
              // Dodaj komunikat informacyjny
              const noButtonsMsg = document.createElement('div');
              noButtonsMsg.style.cssText = 'padding: 10px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; color: #856404; text-align: center;';
              noButtonsMsg.textContent = 'Brak aktywnych przycisków zewnętrznych (wszystkie wyłączone lub błędnie skonfigurowane)';
              targetDiv.appendChild(noButtonsMsg);
            }

          } catch (parseError) {
            this.log('❌ Błąd parsowania JSON', {
              productId,
              error: parseError.message,
              jsonData: jsonData.substring(0, 500) + '...'
            });

            // Dodaj komunikat o błędzie
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'padding: 10px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24; text-align: center;';
            errorMsg.textContent = 'Błąd ładowania przycisków zewnętrznych: ' + parseError.message;
            targetDiv.appendChild(errorMsg);
          }
        });

      } catch (error) {
        this.log('❌ Błąd podczas renderowania przycisków', error);
      }
    },

    // Tworzenie pojedynczego przycisku zewnętrznego
    createExternalButton: function (linkData, index, container) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'external-link-button btn product-form__cart-submit button button--full-width button--secondary';
      button.setAttribute('data-external-url', linkData.url);
      button.onclick = () => this.handleExternalClick(button);

      // Style inline (przekopiowane z theme extension)
      button.style.cssText = `
        font-size: 1.4rem;
        font-weight: 500;
        letter-spacing: 0.1rem;
        line-height: 1.2;
        text-transform: uppercase;
        text-decoration: none;
        cursor: pointer;
        border: 0.1rem solid transparent;
        transition: all 0.15s ease-in-out;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 4.4rem;
        position: relative;
        width: 100%;
        padding: 1.5rem 2rem;
        margin: 1rem 0;
        border-radius: var(--buttons-radius-outset, 0.4rem);
        background: rgb(var(--color-button, 18, 18, 18));
        color: rgb(var(--color-button-text, 255, 255, 255));
        border-color: rgb(var(--color-button, 18, 18, 18));
      `;

      const span = document.createElement('span');
      span.className = 'button-text';
      span.style.cssText = 'display: flex; align-items: center; justify-content: center;';
      span.textContent = linkData.text;

      // Dodaj ikonę external link
      const icon = document.createElement('svg');
      icon.style.cssText = 'width: 1.8rem; height: 1.8rem; margin-left: 0.8rem; fill: currentColor;';
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.innerHTML = '<path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />';

      span.appendChild(icon);
      button.appendChild(span);

      return button;
    },

    // Check for metafield updates by attempting to re-read from DOM
    checkForUpdates: function () {
      try {
        this.log('Checking for metafield updates...');

        // Look for containers that might have updated data
        const containers = document.querySelectorAll('.custom-external-button-container[data-external-links]');
        let hasUpdates = false;

        containers.forEach(container => {
          const currentTimestamp = container.getAttribute('data-timestamp');
          const productId = container.getAttribute('data-product-id');

          // If timestamp is newer than last render, force re-render
          if (currentTimestamp && (!window.lastRenderTime || currentTimestamp > window.lastRenderTime)) {
            this.log(`Found updated data for product ${productId} - timestamp: ${currentTimestamp}`);
            hasUpdates = true;
          }
        });

        if (hasUpdates) {
          this.log('Updates detected - re-rendering buttons');
          this.renderExternalButtons();
        } else {
          this.log('No updates detected');
        }

      } catch (error) {
        this.log('Error checking for updates', error);
      }
    }
  };

  // Expose główny obiekt globalnie
  if (typeof window !== 'undefined') {
    window.CustomButtonScript = CustomButtonScript;
  }

  // Auto-inicjalizacja
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CustomButtonScript.init());
  } else {
    CustomButtonScript.init();
  }

})();