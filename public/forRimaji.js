// Create text container for better spacing
const textContainer = document.createElement('div');
textContainer.classList.add('text-container');

// Original message (English or Japanese)
const originalText = document.createElement('span');
originalText.classList.add('text', data.sourceLang === 'en' ? 'en-text' : 'jp-text');
originalText.textContent = data.message;
textContainer.appendChild(originalText);
console.log('1. Added original text:', data.message);

// Always create the translation container so romanji always appears
const translationContainer = document.createElement('div');
translationContainer.classList.add('translation-container');

if (data.sourceLang === 'en') {
    // For English input:
    // If a Japanese translation exists, add it.
    if (data.translation) {
        console.log('2. Adding Japanese translation for English input:', data.translation);
        const jpText = document.createElement('span');
        jpText.classList.add('text', 'translation-text', 'jp-text');
        jpText.textContent = data.translation;
        translationContainer.appendChild(jpText);
    }
    // Always add romanji text for English input.
    console.log('3. Adding romanji for English input');
    const rpText = document.createElement('span');
    rpText.classList.add('text', 'rp-text');
    rpText.style.cssText =
      'display: block !important; color: #666 !important; margin-top: 4px !important; font-style: italic !important;';
    rpText.textContent = data.romanji || '(romanji)';
    translationContainer.appendChild(rpText);
} else {
    // For Japanese input:
    // Always add romanji text first.
    console.log('2. Adding romanji for Japanese input');
    const rpText = document.createElement('span');
    rpText.classList.add('text', 'rp-text');
    rpText.style.cssText =
      'display: block !important; color: #666 !important; margin-top: 4px !important; font-style: italic !important;';
    rpText.textContent = data.romanji || '(romanji)';
    translationContainer.appendChild(rpText);

    // Then, if an English translation exists, add it.
    if (data.translation) {
        console.log('3. Adding English translation for Japanese input:', data.translation);
        const enText = document.createElement('span');
        enText.classList.add('text', 'translation-text', 'en-text');
        enText.textContent = data.translation;
        translationContainer.appendChild(enText);
    }
}

textContainer.appendChild(translationContainer);
