import { assetUrl } from './runner/util.js';
import { BIOME_DISTANCE } from './runner/biomes.js';

// Overlay UI widgets layered on top of the runner canvas: the biome-switcher
// nav, the outfit toggle, and the inventory HUD. These are pure DOM; the runner
// instance is passed in so they can drive it (transitionToDistance, avatar
// outfit swap). The dev panel (devPanel.js) imports BIOME_PREVIEWS from here.

export const BIOME_PREVIEWS = [
  { name: 'MOUNTAINS', distance: 0, layerGroupIndex: 0 },
  { name: 'FOREST', distance: BIOME_DISTANCE, layerGroupIndex: 1 },
  { name: 'DESERT', distance: BIOME_DISTANCE * 2, layerGroupIndex: 2 },
  { name: 'OCEAN', distance: BIOME_DISTANCE * 3, layerGroupIndex: 3 },
];

export function createBiomeSwitcher(runner) {
  const host = document.getElementById('runner');
  if (!host) return;

  const switcher = document.createElement('nav');
  switcher.className = 'biome-switcher';
  switcher.setAttribute('aria-label', 'Choose biome');

  const normalFrame = assetUrl('/assets/ui/travel-book/frame-select.png');
  const activeFrame = assetUrl('/assets/ui/travel-book/frame-select-active.png');
  const buttons = [];

  const currentDistance = Number(new URLSearchParams(window.location.search).get('distance'));
  let selectedDistance = Number.isFinite(currentDistance) ? currentDistance : runner.totalDistance;

  const updateActiveButton = () => {
    for (const button of buttons) {
      const isActive = Number(button.dataset.distance) === selectedDistance;
      button.setAttribute('aria-pressed', String(isActive));
      button.style.backgroundImage = `url("${isActive ? activeFrame : normalFrame}")`;
    }
  };

  const setBiomeDistance = (distance) => {
    const didStartTransition = runner.transitionToDistance(distance);
    if (!didStartTransition) return;

    selectedDistance = distance;
    updateActiveButton();

    const url = new URL(window.location.href);
    url.searchParams.set('distance', String(distance));
    window.history.replaceState({}, '', url);
  };

  for (const biome of BIOME_PREVIEWS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'biome-switcher__button';
    button.setAttribute('aria-label', biome.name);
    button.textContent = biome.name;
    button.dataset.distance = String(biome.distance);
    button.addEventListener('click', () => setBiomeDistance(biome.distance));
    switcher.appendChild(button);
    buttons.push(button);
  }

  host.appendChild(switcher);
  updateActiveButton();
}

const OUTFITS = [
  { key: 'default', label: 'DEFAULT', sheet: assetUrl('/assets/sprites/crafty-run.png'), frames: 9 },
  { key: 'gown', label: 'GOWN', sheet: assetUrl('/assets/sprites/crafty-run-gown.png'), frames: 9 },
];

export function createOutfitToggle(runner) {
  const host = document.getElementById('runner');
  if (!host) return;

  const normalFrame = assetUrl('/assets/ui/travel-book/frame-select.png');
  const activeFrame = assetUrl('/assets/ui/travel-book/frame-select-active.png');

  const switcher = document.createElement('nav');
  switcher.className = 'outfit-switcher';
  switcher.setAttribute('aria-label', 'Choose outfit');

  const urlParam = new URLSearchParams(window.location.search).get('outfit');
  let currentKey = OUTFITS.find((o) => o.key === urlParam)?.key || 'default';

  const buttons = [];

  const updateActive = () => {
    for (const btn of buttons) {
      const isActive = btn.dataset.outfit === currentKey;
      btn.setAttribute('aria-pressed', String(isActive));
      btn.style.backgroundImage = `url("${isActive ? activeFrame : normalFrame}")`;
    }
  };

  const setOutfit = (key) => {
    const outfit = OUTFITS.find((o) => o.key === key);
    if (!outfit) return;
    runner.avatar.setSheet(outfit.sheet, outfit.frames);
    currentKey = key;
    updateActive();
    const url = new URL(window.location.href);
    if (key === 'default') url.searchParams.delete('outfit');
    else url.searchParams.set('outfit', key);
    window.history.replaceState({}, '', url);
  };

  for (const outfit of OUTFITS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'biome-switcher__button';
    button.setAttribute('aria-label', outfit.label);
    button.textContent = outfit.label;
    button.dataset.outfit = outfit.key;
    button.addEventListener('click', () => setOutfit(outfit.key));
    switcher.appendChild(button);
    buttons.push(button);
  }

  host.appendChild(switcher);
  setOutfit(currentKey);
}

export function createInventoryHud() {
  const host = document.getElementById('runner');
  if (!host) return;

  const slotFrame = assetUrl('/assets/inventory/InventorySlotsSet.png');
  const inventory = document.createElement('div');
  inventory.className = 'inventory-hud';
  inventory.style.setProperty('--inventory-slot-image', `url("${slotFrame}")`);

  const itemList = document.createElement('div');
  itemList.className = 'inventory-items';
  itemList.hidden = true;

  const backpack = makeInventorySlot({
    label: 'Open inventory',
    icon: assetUrl('/assets/inventory/backpack.png'),
    className: 'inventory-slot--backpack',
  });
  backpack.setAttribute('aria-expanded', 'false');
  backpack.addEventListener('click', () => {
    const isOpen = itemList.hidden;
    itemList.hidden = !isOpen;
    backpack.setAttribute('aria-expanded', String(isOpen));
    backpack.setAttribute('aria-label', isOpen ? 'Close inventory' : 'Open inventory');
  });

  const items = [
    { label: 'Cool stick', icon: assetUrl('/assets/inventory/cool-stick.png') },
    { label: 'Spare underwear', icon: assetUrl('/assets/inventory/spare-underwear.png'), className: 'inventory-item--underwear' },
    { label: 'Pepsi Max', icon: assetUrl('/assets/inventory/pepsi-max.png'), className: 'inventory-item--pepsi' },
  ];

  for (const item of items) {
    itemList.appendChild(makeInventoryItem(item));
  }
  itemList.appendChild(makeEmptyInventorySlot());

  inventory.append(backpack, itemList);
  host.appendChild(inventory);
}

function makeInventorySlot({ label, icon, className = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `inventory-slot ${className}`.trim();
  button.setAttribute('aria-label', label);

  const image = document.createElement('img');
  image.className = 'inventory-slot__icon';
  image.src = icon;
  image.alt = '';
  image.draggable = false;

  button.appendChild(image);
  return button;
}

function makeInventoryItem({ label, icon, className = '' }) {
  const wrapper = document.createElement('button');
  wrapper.type = 'button';
  wrapper.className = 'inventory-item-wrap';
  wrapper.setAttribute('aria-label', label);
  wrapper.dataset.label = label;
  wrapper.addEventListener('click', (event) => {
    event.stopPropagation();
    const itemList = wrapper.closest('.inventory-items');
    for (const item of itemList?.querySelectorAll('.inventory-item-wrap[data-active="true"]') || []) {
      if (item !== wrapper) item.dataset.active = 'false';
    }
    wrapper.dataset.active = wrapper.dataset.active === 'true' ? 'false' : 'true';
  });

  const image = document.createElement('img');
  image.className = `inventory-item ${className}`.trim();
  image.src = icon;
  image.alt = label;
  image.draggable = false;

  wrapper.appendChild(image);
  return wrapper;
}

function makeEmptyInventorySlot() {
  const wrapper = document.createElement('span');
  wrapper.className = 'inventory-item-wrap';
  wrapper.setAttribute('aria-hidden', 'true');
  return wrapper;
}
