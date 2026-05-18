// Shared ASCII art viewer logic.
// Extracted from an inline <script> so the page works under a strict CSP
// (no 'unsafe-inline' for script-src, no inline event handlers).

let asciiData = { text: '', html: '' };
let shareSettings = {};

async function loadShare() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    showError('No share ID provided');
    return;
  }

  try {
    const response = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Failed to load share');
      return;
    }

    asciiData.text = data.ascii?.text || data.ascii;
    asciiData.html = data.ascii?.html || '';
    shareSettings = data.settings || {};

    renderContent(data);

  } catch (error) {
    console.error('Load error:', error);
    showError('Failed to load shared ASCII art');
  }
}

function renderContent(data) {
  // Create ASCII container
  const container = document.createElement('div');
  container.className = 'ascii-container';
  container.id = 'ascii-display';

  if (asciiData.html && shareSettings.colorMode !== 'grayscale') {
    // Audit-approved safe pattern: DOMPurify allowlist (span + style only).
    container.innerHTML = DOMPurify.sanitize(asciiData.html, { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['style'] });
  } else {
    container.textContent = asciiData.text;
  }

  // Apply font settings
  if (shareSettings.fontSize) {
    container.style.fontSize = `${shareSettings.fontSize}px`;
  }
  if (shareSettings.lineHeight) {
    container.style.lineHeight = shareSettings.lineHeight;
  }

  const content = document.getElementById('content');
  content.replaceChildren();
  content.appendChild(container);

  // Show stats
  const stats = document.getElementById('stats');
  stats.textContent = '';

  const viewsStat = document.createElement('div');
  viewsStat.className = 'stat';
  const viewsIcon = document.createElement('span');
  viewsIcon.textContent = '👁️';
  const viewsValue = document.createElement('span');
  viewsValue.className = 'stat-value';
  viewsValue.textContent = parseInt(data.views, 10) || 1;
  viewsStat.appendChild(viewsIcon);
  viewsStat.appendChild(viewsValue);

  const dimStat = document.createElement('div');
  dimStat.className = 'stat';
  const dimIcon = document.createElement('span');
  dimIcon.textContent = '📐';
  const dimValue = document.createElement('span');
  dimValue.className = 'stat-value';
  const w = parseInt(shareSettings.width, 10) || '?';
  const h = parseInt(shareSettings.height, 10) || '?';
  dimValue.textContent = w + '×' + h;
  dimStat.appendChild(dimIcon);
  dimStat.appendChild(dimValue);

  stats.appendChild(viewsStat);
  stats.appendChild(dimStat);
  stats.classList.remove('hidden');

  // Show floating bar
  document.getElementById('floating-bar').classList.remove('hidden');

  // Auto-fit ASCII to container
  fitAsciiToWindow();
  window.addEventListener('resize', fitAsciiToWindow);
}

function fitAsciiToWindow() {
  const container = document.getElementById('ascii-display');
  if (!container) return;

  const main = document.querySelector('.main');
  const mainRect = main.getBoundingClientRect();
  const padding = 40; // Account for container padding

  // Reset to measure natural size
  container.style.fontSize = '8px';

  // Get the ASCII dimensions
  const lines = asciiData.text.split('\n');
  const maxLineLength = lines.length > 0 ? Math.max(...lines.map(l => l.length)) : 0;
  const lineCount = lines.length;

  // Calculate available space
  const availableWidth = mainRect.width - padding * 2;
  const availableHeight = mainRect.height - padding * 2;

  // Calculate font size to fit
  // Each character is roughly 0.6 * fontSize wide in monospace
  // Line height is 0.7 * fontSize
  const charWidthRatio = 0.6;
  const lineHeightRatio = 0.7;

  const maxFontByWidth = availableWidth / (maxLineLength * charWidthRatio);
  const maxFontByHeight = availableHeight / (lineCount * lineHeightRatio);

  let optimalFontSize = Math.min(maxFontByWidth, maxFontByHeight);
  optimalFontSize = Math.max(3, Math.min(optimalFontSize, 16)); // Clamp between 3-16px

  container.style.fontSize = `${optimalFontSize}px`;
}

function showError(message) {
  const content = document.getElementById('content');
  content.textContent = '';

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';

  const h2 = document.createElement('h2');
  h2.textContent = 'Oops!';

  const p = document.createElement('p');
  p.textContent = message;

  const a = document.createElement('a');
  a.href = '/';
  a.className = 'create-btn';
  a.textContent = 'Create Your Own ASCII Art';

  errorDiv.appendChild(h2);
  errorDiv.appendChild(p);
  errorDiv.appendChild(a);
  content.appendChild(errorDiv);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(asciiData.text);
    showToast('✅ Copied to clipboard!');
  } catch (err) {
    showToast('❌ Failed to copy');
  }
}

function downloadTxt() {
  const blob = new Blob([asciiData.text], { type: 'text/plain' });
  downloadBlob(blob, 'ascii-art.txt');
  showToast('📄 Downloading TXT...');
}

function downloadPng() {
  const canvas = document.getElementById('export-canvas');
  const ctx = canvas.getContext('2d');

  const lines = asciiData.text.split('\n').filter(l => l.length > 0);
  const fontSize = 12;
  const lineHeight = fontSize * 0.8;

  ctx.font = `${fontSize}px "Courier New", monospace`;
  const maxWidth = lines.length > 0 ? Math.max(...lines.map(line => ctx.measureText(line).width)) : 100;

  canvas.width = maxWidth + 40;
  canvas.height = (lines.length * lineHeight) + 40;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `${fontSize}px "Courier New", monospace`;
  ctx.fillStyle = '#00ff00';
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, 20, 20 + (i * lineHeight));
  });

  canvas.toBlob(blob => {
    if (!blob) { showToast('PNG export failed'); return; }
    downloadBlob(blob, 'ascii-art.png');
    showToast('Downloading PNG...');
  }, 'image/png');
}

function downloadHtml() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ASCII Art</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #0a0a0a;
      display: flex;
      justify-content: center;
    }
    pre {
      font-family: 'Courier New', monospace;
      font-size: ${shareSettings.fontSize || 8}px;
      line-height: ${shareSettings.lineHeight || 0.7};
      color: #00ff00;
      margin: 0;
    }
  </style>
</head>
<body>
  <pre>${asciiData.html || escapeHtml(asciiData.text)}</pre>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  downloadBlob(blob, 'ascii-art.html');
  showToast('🎨 Downloading HTML...');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Wire up button handlers (CSP blocks inline onclick= attributes).
document.getElementById('btn-copy').addEventListener('click', copyToClipboard);
document.getElementById('btn-txt').addEventListener('click', downloadTxt);
document.getElementById('btn-png').addEventListener('click', downloadPng);
document.getElementById('btn-html').addEventListener('click', downloadHtml);

loadShare();
