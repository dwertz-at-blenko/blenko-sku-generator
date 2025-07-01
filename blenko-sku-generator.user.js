// ==UserScript==
// @name         Blenko SKU Generator
// @namespace    https://blenkoglass.com/
// @version      3.0.1
// @description  Automatically generates SKUs for Blenko Glass products in Shopify (new and existing products)
// @author       David Wertz, VP Manufacturing
// @match        https://admin.shopify.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Check if we're on the correct store
    function isCorrectStore() {
        return window.location.href.includes('/store/blenko-glass/');
    }

    // Check if we're on the new product page
    function isNewProductPage() {
        return window.location.href.includes('/products/new');
    }

    // Check if we're on an existing product page
    function isExistingProductPage() {
        const url = window.location.href;
        const path = window.location.pathname;
        
        // Debug logging
        console.log('Blenko SKU Generator Debug - URL check:', {
            fullUrl: url,
            pathname: path,
            includesStore: path.includes('/store/blenko-glass/products/'),
            includesNew: path.includes('/new'),
            includesInventory: path.includes('/inventory'),
            includesMetafields: path.includes('/metafields'),
            pathParts: path.split('/').length
        });
        
        return path.includes('/store/blenko-glass/products/') && 
               !path.includes('/new') && 
               !path.includes('/inventory') &&
               !path.includes('/metafields') &&
               !path.includes('/variants/') &&
               path.split('/').length >= 5; // Should have /store/blenko-glass/products/{id}
    }

    // Check if we're on any product page
    function isProductPage() {
        return isNewProductPage() || isExistingProductPage();
    }

    // Don't run if not on Blenko store
    if (!isCorrectStore()) {
        return;
    }

    console.log('🚀 Blenko SKU Generator: Script loaded on', window.location.href);

    // Configuration
    const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const CHARSET_LENGTH = CHARSET.length;
    const SKU_LENGTH = 12;

    // SKU Generation Logic
    async function generateSKU(productTitle) {
        if (!productTitle || typeof productTitle !== 'string') {
            return null;
        }

        productTitle = productTitle.trim();
        if (productTitle.length === 0) {
            return null;
        }

        // Create SHA-256 hash
        const encoder = new TextEncoder();
        const data = encoder.encode(productTitle);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = new Uint8Array(hashBuffer);

        // Convert to our character set
        const result = new Array(SKU_LENGTH);
        let resultIndex = 0;

        for (let i = 0; i < hashArray.length && resultIndex < SKU_LENGTH; i++) {
            const byte = hashArray[i];
            result[resultIndex++] = CHARSET[Math.floor(byte / CHARSET_LENGTH) % CHARSET_LENGTH];
            if (resultIndex < SKU_LENGTH) {
                result[resultIndex++] = CHARSET[byte % CHARSET_LENGTH];
            }
        }

        // Replace O with 0 and format
        const sku = result.join('').replace(/O/g, '0');
        return formatSKU(sku);
    }

    function formatSKU(sku) {
        if (sku.length !== SKU_LENGTH) return sku;
        return `${sku.substring(0, 4)}-${sku.substring(4, 8)}-${sku.substring(8, 12)}`;
    }

    // Find elements
    function findTitleInput() {
        console.log('Blenko SKU Generator: Looking for title input');
        
        const selectors = [
            'input[name="title"]',
            'input[placeholder*="Short sleeve t-shirt"]',
            'input[placeholder*="product title"]'
        ];

        for (const selector of selectors) {
            try {
                const input = document.querySelector(selector);
                if (input) {
                    console.log('Blenko SKU Generator: Found title input with selector:', selector);
                    return input;
                }
            } catch (e) {
                console.log('Blenko SKU Generator: Selector failed:', selector, e);
            }
        }

        // Fallback: look for input with title-like attributes
        console.log('Blenko SKU Generator: Trying fallback title search');
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
            if (input.name === 'title' || 
                input.placeholder?.toLowerCase().includes('title') ||
                input.getAttribute('aria-labelledby')?.toLowerCase().includes('title')) {
                console.log('Blenko SKU Generator: Found title input via fallback');
                return input;
            }
        }
        
        console.log('Blenko SKU Generator: No title input found');
        return null;
    }

    function findSKUCheckbox() {
        // Look for checkbox with text "This product has a SKU or barcode"
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            if (label.textContent.includes('This product has a SKU or barcode')) {
                const checkbox = label.querySelector('input[type="checkbox"]');
                if (checkbox) return checkbox;
            }
        }
        return null;
    }

    function findSKUInput() {
        console.log('Blenko SKU Generator: Looking for SKU input');
        
        const selectors = [
            'input[name="sku"]',
            '#InventoryCardSku',
            'input[aria-labelledby*="SKU"]',
            'input[aria-labelledby*="Sku"]'
        ];

        for (const selector of selectors) {
            const input = document.querySelector(selector);
            if (input) {
                console.log('Blenko SKU Generator: Found SKU input with selector:', selector);
                return input;
            }
        }

        // Fallback: look for input with SKU-like attributes
        console.log('Blenko SKU Generator: Trying fallback SKU search');
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
            if (input.name === 'sku' || 
                input.id?.toLowerCase().includes('sku') ||
                input.getAttribute('aria-labelledby')?.toLowerCase().includes('sku')) {
                console.log('Blenko SKU Generator: Found SKU input via fallback');
                return input;
            }
        }
        
        console.log('Blenko SKU Generator: No SKU input found');
        return null;
    }

    function findSaveButton() {
        // Find the contextual save button
        const buttons = document.querySelectorAll('button[type="submit"]');
        for (const button of buttons) {
            if (button.textContent.includes('Save') &&
                (button.className.includes('Primary') || button.className.includes('ContextualButton'))) {
                return button;
            }
        }
        return null;
    }

    // Check if SKU is missing
    function isSKUMissing() {
        console.log('🔍 Checking if SKU is missing...');
        
        if (isNewProductPage()) {
            // For new products, check BOTH conditions:
            // 1. SKU checkbox is not checked, OR
            // 2. SKU checkbox is checked but SKU field is empty
            const skuCheckbox = findSKUCheckbox();
            const skuInput = findSKUInput();
            
            let missing = false;
            
            if (skuCheckbox && !skuCheckbox.checked) {
                // Case 1: Checkbox not checked
                missing = true;
                console.log('🔍 New product SKU check: Checkbox not checked');
            } else if (skuCheckbox && skuCheckbox.checked && skuInput && (!skuInput.value || skuInput.value.trim() === '')) {
                // Case 2: Checkbox checked but SKU field empty
                missing = true;
                console.log('🔍 New product SKU check: Checkbox checked but SKU field empty');
            }
            
            console.log('🔍 New product SKU check:', { 
                hasCheckbox: !!skuCheckbox, 
                checked: skuCheckbox?.checked, 
                hasInput: !!skuInput,
                inputValue: skuInput?.value,
                missing 
            });
            
            return missing;
        } else if (isExistingProductPage()) {
            // For existing products, check if SKU field is empty
            const skuInput = findSKUInput();
            const missing = skuInput && (!skuInput.value || skuInput.value.trim() === '');
            console.log('🔍 Existing product SKU check:', { hasInput: !!skuInput, value: skuInput?.value, missing });
            return missing;
        }
        console.log('🔍 Not on a product page');
        return false;
    }

    // Main logic
    let isProcessingSave = false;
    let hasShownInitialPrompt = false;

    // Show initial prompt for existing products with missing SKU
    async function showInitialPromptIfNeeded() {
        if (hasShownInitialPrompt || !isExistingProductPage()) return;

        // Wait a bit for the page to fully load
        await new Promise(resolve => setTimeout(resolve, 2000));

        const titleInput = findTitleInput();
        const skuInput = findSKUInput();

        if (titleInput && skuInput && titleInput.value.trim() && (!skuInput.value || skuInput.value.trim() === '')) {
            hasShownInitialPrompt = true;

            const shouldGenerate = confirm(
                'This product is missing a SKU.\n\n' +
                'Would you like to generate one now?\n\n' +
                `Product: "${titleInput.value.trim()}"`
            );

            if (shouldGenerate) {
                await generateAndSetSKU(titleInput.value.trim(), skuInput);
            }
        }
    }

    async function handleSaveClick(event) {
        // Prevent multiple simultaneous processing
        if (isProcessingSave) return;

        // Double-check we're on a product page
        if (!isProductPage()) return;

        const titleInput = findTitleInput();
        
        console.log('Blenko SKU Generator: Save clicked', {
            titleFound: !!titleInput,
            titleValue: titleInput?.value,
            isNewProduct: isNewProductPage(),
            isExistingProduct: isExistingProductPage()
        });

        if (!titleInput) {
            console.log('Blenko SKU Generator: Title input not found');
            return;
        }

        const productTitle = titleInput.value.trim();
        if (!productTitle) {
            console.log('Blenko SKU Generator: No product title');
            return;
        }

        let needsSKU = false;
        let skuCheckbox = null;
        let skuInput = null;

        if (isNewProductPage()) {
            // For new products, handle both scenarios:
            // 1. SKU checkbox is not checked
            // 2. SKU checkbox is checked but SKU field is empty
            skuCheckbox = findSKUCheckbox();
            skuInput = findSKUInput();
            
            if (skuCheckbox && !skuCheckbox.checked) {
                // Scenario 1: Checkbox not checked
                needsSKU = true;
                console.log('New product - SKU checkbox not checked');
            } else if (skuCheckbox && skuCheckbox.checked && skuInput && (!skuInput.value || skuInput.value.trim() === '')) {
                // Scenario 2: Checkbox checked but SKU field empty
                needsSKU = true;
                console.log('New product - SKU checkbox checked but field empty');
            }
        } else if (isExistingProductPage()) {
            // For existing products, check if SKU field is empty
            skuInput = findSKUInput();
            needsSKU = skuInput && (!skuInput.value || skuInput.value.trim() === '');
            console.log('Existing product - SKU value:', skuInput?.value);
        }

        if (needsSKU) {
            isProcessingSave = true;

            // Prevent the save action
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // For keyboard saves, prevent default
            if (event.type === 'keydown') {
                event.returnValue = false;
            }

            // Show confirmation dialog
            const shouldGenerate = confirm(
                'No SKU has been set for this product.\n\n' +
                'Would you like to generate one now?\n\n' +
                `Product: "${productTitle}"`
            );

            if (shouldGenerate) {
                try {
                    if (isNewProductPage() && skuCheckbox && !skuCheckbox.checked) {
                        // Only check the SKU checkbox if it's not already checked
                        skuCheckbox.checked = true;
                        skuCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                        skuCheckbox.dispatchEvent(new Event('click', { bubbles: true }));

                        // Wait for the SKU field to appear
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Find the SKU input field after checking the box
                        skuInput = findSKUInput();
                    }

                    if (skuInput) {
                        await generateAndSetSKU(productTitle, skuInput);
                        alert(`SKU Generated!\n\nClick Save again to save the product.`);
                    } else {
                        alert('SKU field not found. Please try again.');
                    }
                } catch (error) {
                    console.error('Blenko SKU Generator Error:', error);
                    alert('Error generating SKU. Please try again.');
                }
            }

            // Reset processing flag
            setTimeout(() => {
                isProcessingSave = false;
            }, 500);
        }
    }

    // Generate and set SKU
    async function generateAndSetSKU(productTitle, skuInput) {
        const newSKU = await generateSKU(productTitle);
        if (newSKU) {
            // Set value using React-compatible method
            setReactValue(skuInput, newSKU);

            // Visual feedback
            skuInput.style.backgroundColor = '#e6ffe6';
            skuInput.style.transition = 'background-color 0.3s ease';
            setTimeout(() => {
                skuInput.style.backgroundColor = '';
            }, 2000);

            // Save to history
            saveToHistory(productTitle, newSKU);

            console.log(`SKU generated for "${productTitle}": ${newSKU}`);
            return newSKU;
        }
        return null;
    }

    // Save to history
    function saveToHistory(title, sku) {
        const history = JSON.parse(GM_getValue('skuHistory', '[]'));
        history.unshift({
            title: title,
            sku: sku,
            timestamp: new Date().toISOString()
        });
        GM_setValue('skuHistory', JSON.stringify(history.slice(0, 100)));
    }

    // Set React input value
    function setReactValue(input, value) {
        // Get the React instance
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;

        // Set the value using the native setter
        nativeInputValueSetter.call(input, value);

        // Create and dispatch events in the correct order
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        const blurEvent = new Event('blur', { bubbles: true, cancelable: true });
        const focusEvent = new Event('focus', { bubbles: true, cancelable: true });

        // Simulate user interaction
        input.focus();
        input.dispatchEvent(focusEvent);
        input.dispatchEvent(inputEvent);
        input.dispatchEvent(changeEvent);
        input.blur();
        input.dispatchEvent(blurEvent);
    }

    // Initialize
    function initialize() {
        // Only run on product pages
        if (!isProductPage()) {
            console.log('🔍 Not on a product page, skipping initialization');
            return;
        }

        console.log('🚀 Blenko SKU Generator: Setting up on product page', {
            isNew: isNewProductPage(),
            isExisting: isExistingProductPage(),
            url: window.location.href
        });

        // Show initial prompt for existing products
        if (isExistingProductPage()) {
            console.log('🔍 Scheduling initial prompt check...');
            showInitialPromptIfNeeded();
        }

        // Override the form's submit method
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            if (form._blenkoIntercepted) return;
            form._blenkoIntercepted = true;

            // Store original submit
            const originalSubmit = form.submit;

            // Override submit
            form.submit = function() {
                console.log('Blenko SKU Generator: Form submit intercepted');

                if (isSKUMissing() && !isProcessingSave) {
                    // Create a fake event
                    const fakeEvent = {
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        stopImmediatePropagation: () => {},
                        type: 'submit'
                    };

                    handleSaveClick(fakeEvent);
                    return; // Don't submit
                }

                // Otherwise, submit normally
                return originalSubmit.apply(this, arguments);
            };
        });

        // Set up event listeners
        const setupListeners = () => {
            // Intercept clicks at document level
            document.addEventListener('click', async function(event) {
                if (!isProductPage() || isProcessingSave) return;

                // Check multiple ways to identify save button
                const target = event.target;
                const parentButton = target.closest('button[type="submit"]');
                const isSaveButton = (
                    (target.tagName === 'BUTTON' || parentButton) &&
                    (target.type === 'submit' || parentButton?.type === 'submit') &&
                    (target.textContent?.includes('Save') ||
                     target.getAttribute('aria-label')?.includes('Save') ||
                     parentButton?.textContent?.includes('Save') ||
                     parentButton?.getAttribute('aria-label')?.includes('Save'))
                );

                if (isSaveButton && isSKUMissing()) {
                    console.log('Blenko SKU Generator: Save button clicked');
                    await handleSaveClick(event);
                }
            }, true);

            // Intercept form submissions
            document.addEventListener('submit', async function(event) {
                if (!isProductPage() || isProcessingSave) return;

                console.log('Blenko SKU Generator: Form submission detected');

                if (isSKUMissing()) {
                    await handleSaveClick(event);
                }
            }, true);

            // Keyboard shortcut (Ctrl/Cmd + S)
            document.addEventListener('keydown', async function(event) {
                if ((event.ctrlKey || event.metaKey) && event.key === 's' && isProductPage() && !isProcessingSave) {
                    console.log('Blenko SKU Generator: Ctrl/Cmd+S pressed');

                    if (isSKUMissing()) {
                        await handleSaveClick(event);
                    }
                }
            }, true);
        };

        // Set up listeners only once
        if (!document._blenkoListenersSetup) {
            document._blenkoListenersSetup = true;
            setupListeners();
        }

        console.log('Blenko SKU Generator: Ready');
    }

    // Watch for URL changes and initialize
    function watchAndInitialize() {
        // Check every 500ms for new forms to intercept
        setInterval(() => {
            if (isProductPage()) {
                const forms = document.querySelectorAll('form');
                forms.forEach(form => {
                    if (!form._blenkoIntercepted) {
                        form._blenkoIntercepted = true;

                        const originalSubmit = form.submit;
                        form.submit = function() {
                            if (isSKUMissing() && !isProcessingSave) {
                                const fakeEvent = {
                                    preventDefault: () => {},
                                    stopPropagation: () => {},
                                    stopImmediatePropagation: () => {},
                                    type: 'submit'
                                };

                                handleSaveClick(fakeEvent);
                                return;
                            }

                            return originalSubmit.apply(this, arguments);
                        };
                    }
                });
            }
        }, 500);

        // Initial setup with delays
        setTimeout(initialize, 1000);
        setTimeout(initialize, 2000);
        setTimeout(initialize, 3000);

        // Watch for URL changes
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                hasShownInitialPrompt = false; // Reset for new page
                if (isProductPage()) {
                    setTimeout(initialize, 1000);
                }
            }
        }).observe(document, { subtree: true, childList: true });
    }

    // Start immediately
    watchAndInitialize();

})();
