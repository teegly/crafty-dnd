export function createPanelButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.style.border = '1px solid rgba(255,255,255,0.18)';
  button.style.borderRadius = '6px';
  button.style.padding = '7px 8px';
  button.style.background = 'rgba(255,255,255,0.08)';
  button.style.color = '#edf5e6';
  button.style.cursor = 'pointer';
  return button;
}

export function createPanelRange(labelText, value) {
  const label = document.createElement('label');
  label.style.display = 'grid';
  label.style.gap = '4px';
  const text = document.createElement('span');
  text.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '-45';
  input.max = '45';
  input.step = '1';
  input.value = String(value);
  label.append(text, input);
  return input;
}

export function setCopyButtonState(button, text, resetText) {
  button.textContent = text;
  window.setTimeout(() => { button.textContent = resetText; }, 1200);
}

export async function copyTextToClipboard(button, text, resetText) {
  if (!window.isSecureContext || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    setCopyButtonState(button, 'Copy failed', resetText);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setCopyButtonState(button, 'Copied', resetText);
  } catch (error) {
    console.warn('Clipboard copy failed', error);
    setCopyButtonState(button, 'Copy failed', resetText);
  }
}
