import { assetUrl } from './runner/util.js';
import { BIOME_DISTANCE } from './runner/biomes.js';
import { updateUrlParams } from './urlParams.js';

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

function getBiomeIndex(distance) {
  const n = BIOME_PREVIEWS.length;
  return ((Math.floor(distance / BIOME_DISTANCE) % n) + n) % n;
}

function shuffleBiomeIndexes(current) {
  const destinations = BIOME_PREVIEWS
    .map((_, index) => index)
    .filter((index) => index !== current);

  for (let i = destinations.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [destinations[i], destinations[j]] = [destinations[j], destinations[i]];
  }

  return destinations;
}

// A single Travel button. Each press picks from a shuffled bag of biomes
// different from the current one, so every destination appears before repeats.
// transitionToDistance spawns the portal and swaps the biome as Crafty passes
// through it. Which biome you get stays a mystery until you arrive.
export function createBiomeSwitcher(runner) {
  const host = document.getElementById('runner');
  if (!host) return;

  const switcher = document.createElement('nav');
  switcher.className = 'biome-switcher';
  switcher.setAttribute('aria-label', 'Travel to a new place');
  // One compact button instead of the original four per-biome buttons; width
  // shrinks to the label rather than spanning the full switcher area.
  switcher.style.gridTemplateColumns = 'none';
  switcher.style.width = 'auto';
  switcher.style.justifyItems = 'start';

  const normalFrame = assetUrl('/assets/ui/travel-book/frame-select.png');
  const activeFrame = assetUrl('/assets/ui/travel-book/frame-select-active.png');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'biome-switcher__button';
  button.textContent = 'TRAVEL';
  button.setAttribute('aria-label', 'Travel through the portal to a mystery biome');
  button.style.backgroundImage = `url("${normalFrame}")`;
  button.style.fontSize = '26px';
  button.style.padding = '14px 26px';

  let destinationBag = [];

  const travel = () => {
    const current = getBiomeIndex(runner.totalDistance);
    destinationBag = destinationBag.filter((index) => index !== current);
    if (!destinationBag.length) {
      destinationBag = shuffleBiomeIndexes(current);
    }

    const next = destinationBag.at(-1);
    const distance = BIOME_PREVIEWS[next].distance;

    const started = runner.transitionToDistance(distance);
    if (!started) return; // ignore taps while a portal trip is already running
    destinationBag.pop();

    // Brief press feedback, then settle back to the resting frame.
    button.style.backgroundImage = `url("${activeFrame}")`;
    window.setTimeout(() => {
      button.style.backgroundImage = `url("${normalFrame}")`;
    }, 350);

    updateUrlParams({ distance });
  };

  button.addEventListener('click', travel);
  switcher.appendChild(button);
  host.appendChild(switcher);
}

// Crafty's run sprites. `default` is her adventurer outfit; `gown` is her
// hospital gown (she is recovering in hospital in real life); `cheeky` is the
// hidden Easter-egg outfit triggered from the inventory.
const OUTFITS = {
  default: { sheet: assetUrl('/assets/sprites/crafty-run.png'), frames: 9 },
  gown: { sheet: assetUrl('/assets/sprites/crafty-run-gown.png'), frames: 9 },
  cheeky: { sheet: assetUrl('/assets/sprites/crafty-run-gown-cheeky.png'), frames: 9 },
};

// How long the cheeky Easter-egg outfit stays on before reverting.
const CHEEKY_EGG_MS = 6000;

// Populated by createOutfitToggle so the inventory Easter egg can check the gown
// state and trigger the temporary cheeky outfit without fighting the toggle.
let outfitController = null;

// A single first-aid-kit toggle. Off = adventurer outfit; on = hospital gown.
// State persists in the ?outfit=gown URL param so a shared link keeps the look.
export function createOutfitToggle(runner) {
  const host = document.getElementById('runner');
  if (!host) return;

  const closedKit = assetUrl('/assets/ui/first-aid-kit-closed.png');
  const openKit = assetUrl('/assets/ui/first-aid-kit-open.png');

  const switcher = document.createElement('nav');
  switcher.className = 'outfit-switcher';
  // One compact icon button instead of the original two-column text grid,
  // nudged down so the kit lines up level with the backpack icon on the right
  // (the backpack image is inset inside its slot frame).
  switcher.style.gridTemplateColumns = 'none';
  switcher.style.width = 'auto';
  switcher.style.top = '26px';

  let gownOn = new URLSearchParams(window.location.search).get('outfit') === 'gown';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'biome-switcher__button';
  button.style.minHeight = '0';
  button.style.padding = '0';
  button.style.background = 'none';
  button.style.lineHeight = '0';
  button.style.cursor = 'pointer';

  const icon = document.createElement('img');
  icon.src = closedKit;
  icon.alt = '';
  icon.draggable = false;
  icon.style.width = '64px';
  icon.style.height = '64px';
  icon.style.imageRendering = 'pixelated';
  button.appendChild(icon);

  const apply = () => {
    const outfit = gownOn ? OUTFITS.gown : OUTFITS.default;
    runner.avatar.setSheet(outfit.sheet, outfit.frames);
    button.setAttribute('aria-pressed', String(gownOn));
    button.setAttribute('aria-label', gownOn
      ? 'Hospital gown on. Tap to return Crafty to her adventurer outfit.'
      : 'Tap the first aid kit to put Crafty in her hospital gown.');
    button.title = gownOn ? 'Hospital gown: on' : 'Hospital gown: off';
    icon.src = gownOn ? openKit : closedKit;
    updateUrlParams({ outfit: gownOn ? 'gown' : null });
  };

  let eggTimer = null;
  const cancelEgg = () => {
    if (eggTimer) {
      window.clearTimeout(eggTimer);
      eggTimer = null;
    }
  };

  // Easter egg: only while the gown is on, show the cheeky outfit for a bit,
  // then revert to whatever the toggle is currently set to. Triggered from the
  // inventory (tapping spare underwear).
  const playCheeky = () => {
    if (!gownOn) return false;
    runner.avatar.setSheet(OUTFITS.cheeky.sheet, OUTFITS.cheeky.frames);
    cancelEgg();
    eggTimer = window.setTimeout(() => {
      eggTimer = null;
      apply();
    }, CHEEKY_EGG_MS);
    return true;
  };

  outfitController = { isGownOn: () => gownOn, playCheeky };

  button.addEventListener('click', () => {
    cancelEgg(); // a manual toggle takes over from any running egg
    gownOn = !gownOn;
    apply();
  });

  switcher.appendChild(button);
  host.appendChild(switcher);
  apply();
}

// Items Krusher's state can reference by id. Each id maps to its icon and any
// special behaviour (the underwear easter egg). state.items entries are
// { id, label } where label is optional and overrides the registry label.
const INVENTORY_ITEM_TYPES = {
  'cool-stick': { label: 'Cool stick', icon: assetUrl('/assets/inventory/cool-stick.png') },
  'spare-underwear': { label: 'Spare underwear', icon: assetUrl('/assets/inventory/spare-underwear.png'), className: 'inventory-item--underwear', onSelect: () => outfitController?.playCheeky() },
  'pepsi-max': { label: 'Pepsi Max', icon: assetUrl('/assets/inventory/pepsi-max.png'), className: 'inventory-item--pepsi' },
};
const DEFAULT_ITEM_IDS = ['cool-stick', 'spare-underwear', 'pepsi-max'];

export function createInventoryHud(getState) {
  const host = document.getElementById('runner');
  if (!host) return;

  const slotFrame = assetUrl('/assets/inventory/InventorySlotsSet.png');
  const inventory = document.createElement('div');
  inventory.className = 'inventory-hud';
  inventory.style.setProperty('--inventory-slot-image', `url("${slotFrame}")`);

  const itemList = document.createElement('div');
  itemList.className = 'inventory-items';
  itemList.hidden = true;

  // Rebuild the list from state.items. An empty/missing list shows the three
  // defaults, so the page looks the same until Krusher starts sending items.
  // Unknown ids render as an empty slot with the label for screen readers, so
  // a new item id never breaks the HUD before its icon ships here.
  const renderItems = () => {
    const stateItems = getState?.()?.items;
    const ids = Array.isArray(stateItems) && stateItems.length
      ? stateItems
      : DEFAULT_ITEM_IDS;
    itemList.replaceChildren();
    for (const entry of ids) {
      const id = typeof entry === 'string' ? entry : entry?.id;
      const known = INVENTORY_ITEM_TYPES[id];
      const label = (typeof entry === 'object' && entry?.label) || known?.label || String(id);
      if (known) {
        itemList.appendChild(makeInventoryItem({ ...known, label }));
      } else {
        itemList.appendChild(makeUnknownInventorySlot(label));
      }
    }
    itemList.appendChild(makeEmptyInventorySlot());
  };

  const backpack = makeInventorySlot({
    label: 'Open inventory',
    icon: assetUrl('/assets/inventory/backpack.png'),
    className: 'inventory-slot--backpack',
  });
  backpack.setAttribute('aria-expanded', 'false');
  backpack.addEventListener('click', () => {
    const isOpen = itemList.hidden;
    if (isOpen) renderItems(); // pick up state changes each time it opens
    itemList.hidden = !isOpen;
    backpack.setAttribute('aria-expanded', String(isOpen));
    backpack.setAttribute('aria-label', isOpen ? 'Close inventory' : 'Open inventory');
  });

  renderItems();
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

function makeInventoryItem({ label, icon, className = '', onSelect = null }) {
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
    if (onSelect) onSelect();
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

// An item id with no registry entry yet: an empty slot that still announces
// its label, so unknown items are visible-but-blank rather than missing.
function makeUnknownInventorySlot(label) {
  const wrapper = document.createElement('span');
  wrapper.className = 'inventory-item-wrap';
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', label);
  wrapper.dataset.label = label;
  return wrapper;
}
