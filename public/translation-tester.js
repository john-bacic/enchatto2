/**
 * Translation Speed Tester
 * This module provides functionality to test and display OpenAI translation speed metrics
 */

// Tester state
const translationTester = {
  isActive: false,
  testHistory: [],
  currentTest: null,
  testPhrase: "Hello, how are you today? I hope you're doing well. This is a test of the translation speed.",
  targetLanguage: "ja", // Default to Japanese
  historyLimit: 10,
  container: null,
};

// Create test UI
function initializeTranslationTester() {
  console.log('Initializing translation tester UI');
  // Create the container if it doesn't exist
  if (!translationTester.container) {
    const container = document.createElement('div');
    container.id = 'translation-tester';
    container.className = 'translation-tester';
    container.style.display = 'none'; // Hidden by default
    
    // Create the header with controls
    const header = document.createElement('div');
    header.className = 'tester-header';
    header.innerHTML = `
      <h3>Translation Speed Test</h3>
      <div class="tester-controls">
        <button id="run-translation-test">Run Test</button>
        <select id="target-language-select">
          <option value="ja">Japanese</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
        </select>
        <button id="close-translation-tester">×</button>
      </div>
    `;
    
    // Create the content area
    const content = document.createElement('div');
    content.className = 'tester-content';
    content.innerHTML = `
      <div class="tester-status">
        <p>Status: <span id="test-status">Ready</span></p>
      </div>
      <div class="tester-metrics" id="translation-metrics">
        <p>Last test: <span id="last-test-time">N/A</span> ms</p>
        <p>Average (last ${translationTester.historyLimit}): <span id="avg-test-time">N/A</span> ms</p>
        <p>Min: <span id="min-test-time">N/A</span> ms</p>
        <p>Max: <span id="max-test-time">N/A</span> ms</p>
      </div>
      <div class="tester-history">
        <h4>Recent Tests</h4>
        <ul id="test-history-list"></ul>
      </div>
    `;
    
    // Assemble the container
    container.appendChild(header);
    container.appendChild(content);
    document.body.appendChild(container);
    
    // Store the container reference
    translationTester.container = container;
    
    // Add event listeners
    document.getElementById('run-translation-test').addEventListener('click', runTranslationTest);
    document.getElementById('close-translation-tester').addEventListener('click', toggleTranslationTester);
    document.getElementById('target-language-select').addEventListener('change', function() {
      translationTester.targetLanguage = this.value;
    });
  }
}

// Toggle the visibility of the translation tester
function toggleTranslationTester() {
  if (!translationTester.container) {
    initializeTranslationTester();
    translationTester.isActive = true;
  } else {
    translationTester.isActive = !translationTester.isActive;
    translationTester.container.style.display = translationTester.isActive ? 'block' : 'none';
  }
}

// Run a translation speed test
window.runTranslationTest = async function() {
  if (translationTester.currentTest) {
    console.log('Test already in progress');
    return;
  }
  
  // Create new test object
  translationTester.currentTest = {
    id: Date.now(),
    startTime: performance.now(),
    targetLanguage: translationTester.targetLanguage,
    text: translationTester.testPhrase
  };
  
  // Update UI
  document.getElementById('test-status').textContent = 'Testing...';
  
  // Make socket request (no callback, results will come in through the event)
  console.log('Sending test request to socket', {
    text: translationTester.testPhrase,
    targetLanguage: translationTester.targetLanguage === 'ja' ? 'Japanese' : 'English',
    clientStartTime: Date.now()
  });
  
  socket.emit('test-translation-speed', {
    text: translationTester.testPhrase,
    targetLanguage: translationTester.targetLanguage === 'ja' ? 'Japanese' : 'English',
    clientStartTime: Date.now()
  });
}

// Complete the test and update metrics
function completeTranslationTest(result) {
  if (!translationTester.currentTest) {
    console.error('No test in progress');
    return;
  }
  
  const endTime = performance.now();
  const clientDuration = endTime - translationTester.currentTest.startTime;
  
  // Update the current test object
  translationTester.currentTest.endTime = endTime;
  translationTester.currentTest.clientDuration = clientDuration;
  translationTester.currentTest.serverDuration = result.serverTimeMs || result.timeMs;
  translationTester.currentTest.totalDuration = result.totalTimeMs || clientDuration;
  translationTester.currentTest.result = result;
  
  // Add to history and maintain limit
  translationTester.testHistory.unshift(translationTester.currentTest);
  if (translationTester.testHistory.length > translationTester.historyLimit) {
    translationTester.testHistory.pop();
  }
  
  // Update the UI
  updateTranslationTestUI();
  
  // Reset current test
  translationTester.currentTest = null;
  document.getElementById('test-status').textContent = 'Ready';
}

// Update the test UI with latest metrics
function updateTranslationTestUI() {
  if (!translationTester.container || translationTester.testHistory.length === 0) return;
  
  // Calculate metrics
  const totalDurations = translationTester.testHistory.map(test => test.totalDuration);
  const serverDurations = translationTester.testHistory.map(test => test.serverDuration);
  const displayTimes = translationTester.testHistory.map(test => test.displayTime || 0).filter(time => time > 0);
  
  const lastTestTotalTime = totalDurations[0];
  const lastTestServerTime = serverDurations[0];
  const lastTestDisplayTime = displayTimes.length > 0 ? displayTimes[0] : 0;
  
  const avgTotalTime = totalDurations.reduce((sum, time) => sum + time, 0) / totalDurations.length;
  const avgServerTime = serverDurations.reduce((sum, time) => sum + time, 0) / serverDurations.length;
  const avgDisplayTime = displayTimes.length > 0 ? displayTimes.reduce((sum, time) => sum + time, 0) / displayTimes.length : 0;
  
  const minTotalTime = Math.min(...totalDurations);
  const maxTotalTime = Math.max(...totalDurations);
  const minServerTime = Math.min(...serverDurations);
  const maxServerTime = Math.max(...serverDurations);
  const minDisplayTime = displayTimes.length > 0 ? Math.min(...displayTimes) : 0;
  const maxDisplayTime = displayTimes.length > 0 ? Math.max(...displayTimes) : 0;
  
  // Update metrics display
  const metricsElement = document.getElementById('translation-metrics');
  const displayInfo = displayTimes.length > 0 ? `, display: ${lastTestDisplayTime.toFixed(2)} ms` : '';
  const avgDisplayInfo = displayTimes.length > 0 ? `, display: ${avgDisplayTime.toFixed(2)} ms` : '';
  
  metricsElement.innerHTML = `
    <p>Last test: ${lastTestTotalTime.toFixed(2)} ms (server: ${lastTestServerTime.toFixed(2)} ms${displayInfo})</p>
    <p>Average: ${avgTotalTime.toFixed(2)} ms (server: ${avgServerTime.toFixed(2)} ms${avgDisplayInfo})</p>
    <p>Min: ${minTotalTime.toFixed(2)} ms | Max: ${maxTotalTime.toFixed(2)} ms</p>
  `;
  
  // Update history list
  const historyListElement = document.getElementById('test-history-list');
  historyListElement.innerHTML = '';
  
  translationTester.testHistory.forEach(test => {
    const listItem = document.createElement('li');
    const displayInfo = test.displayTime ? `, display: ${test.displayTime.toFixed(2)} ms` : '';
    listItem.textContent = `${test.targetLanguage.toUpperCase()}: ${test.totalDuration.toFixed(2)} ms (server: ${test.serverDuration.toFixed(2)} ms${displayInfo})`;
    historyListElement.appendChild(listItem);
  });
}

// Record the translation display time
window.recordTranslationDisplayTime = function(displayTime, messageId) {
  console.log(`Translation display time for ${messageId}: ${displayTime.toFixed(2)} ms`);
  
  // Find the test that matches this message ID
  if (translationTester.testHistory.length > 0) {
    // Just update the most recent test by default since we're testing during send
    const latestTest = translationTester.testHistory[0];
    latestTest.displayTime = displayTime;
    
    // Update the UI
    updateTranslationTestUI();
  }
};

// Create a toggle button that's always visible
function createToggleButton() {
  const button = document.createElement('button');
  button.id = 'toggle-translation-tester-button';
  button.textContent = 'Speed';
  button.style.position = 'fixed';
  button.style.top = '10px';
  button.style.left = '50%';
  button.style.transform = 'translateX(-50%)';
  button.style.zIndex = '1002';
  button.style.padding = '4px 8px';
  button.style.background = '#333';
  button.style.color = 'white';
  button.style.border = '1px solid #444';
  button.style.borderRadius = '3px';
  button.style.cursor = 'pointer';
  button.style.fontSize = '12px';
  
  button.addEventListener('click', () => {
    toggleTranslationTester();
  });
  
  document.body.appendChild(button);
  
  return button;
}

// Add a keystroke handler to toggle the tester with Ctrl+Shift+T
document.addEventListener('keydown', function(event) {
  if (event.ctrlKey && event.shiftKey && event.key === 'T') {
    toggleTranslationTester();
    event.preventDefault();
  }
});

// Wait for socket to be available before initializing
function waitForSocket() {
  if (typeof socket !== 'undefined') {
    // Set up socket event handler for test results
    socket.on('translation-test-result', (data) => {
      completeTranslationTest(data);
    });
    
    // Initialize the tester UI
    initializeTranslationTester();
    
    // Make sure the tester is visible
    if (translationTester.container && !translationTester.isActive) {
      // Don't automatically toggle the tester on startup
      // toggleTranslationTester();
    }
  } else {
    setTimeout(waitForSocket, 100);
  }
}

// Start waiting for socket when the document is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('Translation tester: DOM ready, waiting for socket');
  createToggleButton();
  waitForSocket();
});

// Alternatively, if the document is already loaded, start immediately
if (document.readyState === 'complete') {
  console.log('Translation tester: Document already loaded, waiting for socket');
  createToggleButton();
  waitForSocket();
}
