import * as THREE from 'three';
import { GAME } from './GameState.js';
import { pickRandom } from './util.js';
import { getBiome, obstacleCardMaterial } from './GameBiomes.js';

// Hazards. Like cans, each segment owns a fixed pool of obstacle "slots" (built
// once, toggled on recycle), children of the segment so they scroll + swing with
// it. Three clearance types:
//   - 'low'   : a barrier you JUMP over   (cleared while airborne high enough)
//   - 'high'  : a beam you SLIDE under     (cleared while sliding)
//   - 'block' : an enemy you DODGE by lane (never cleared vertically)
//
// Each slot occupies a single lane, and slots are spaced along the segment, so at
// any given depth at most one lane is blocked — a run is always physically passable
// by weaving. Collision is the same swept-Z test as cans, gated by lane + clearance.
//
// Placeholder art: simple boxes + an enemy figure with glowing eyes. Swap the block
// for an enemy sprite card (/sprites/enemy-01.png) and the beam/barrier for art later.

const OBSTACLES_PER_SEGMENT = 3;
const SEGMENT_LENGTH = 20;
const SLOT_Z = [-7, 0, 7]; // local z of each slot within a 20-deep segment (spread out)
const OBSTACLE_CHANCE = 0.4; // per slot, per dressing — sparser so things aren't crowded
const CAN_CLEAR_DZ = 2.8; // hide same-lane cans within this z of an obstacle (no pepsi on barriers)

// Widths kept < the ~1.25 lane spacing so an obstacle never bleeds into a neighbouring lane.
const lowGeo = new THREE.BoxGeometry(1.0, 0.6, 0.5);
const lowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
const highGeo = new THREE.BoxGeometry(1.05, 0.5, 0.5);
const highMat = new THREE.MeshStandardMaterial({ color: 0x6a4326, roughness: 0.85, emissive: 0x1a0d04, emissiveIntensity: 0.3 });
const bodyGeo = new THREE.BoxGeometry(0.85, 1.5, 0.6);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a1c1c, roughness: 0.7, emissive: 0x140404, emissiveIntensity: 0.4 });
const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, fog: true });

// Billboard cards that overlay each role with a biome sprite (or a labelled
// placeholder card). The sprite sources are SQUARE (the object centred with its own
// transparent padding), so the planes must be square too or the art stretches. Size
// per role sets the on-screen scale; the padding keeps each object's true shape.
// Temple has no sprites, so it keeps the 3D boxes.
const lowCardGeo = new THREE.PlaneGeometry(1.2, 1.2);
const highCardGeo = new THREE.PlaneGeometry(1.3, 1.3);
const blockCardGeo = new THREE.PlaneGeometry(1.7, 1.7);

export class Obstacles {
  // hooks: { onDeath }
  constructor(track, gameState, hooks = {}) {
    this.track = track;
    this.gameState = gameState;
    this.hooks = hooks;
    this.active = false;

    for (const seg of track.segments) {
      this._ensurePool(seg);
      hideObstacles(seg);
    }
    track.addRecycleListener((seg) => this._onRecycle(seg));
  }

  activate() {
    this.active = true;
    const biome = getBiome(this.gameState.currentBiome);
    for (const seg of this.track.segments) layoutObstacles(seg, biome);
  }

  deactivate() {
    this.active = false;
    for (const seg of this.track.segments) hideObstacles(seg);
  }

  _ensurePool(seg) {
    if (seg.userData.obstacles) return;
    const obstacles = [];
    for (let i = 0; i < OBSTACLES_PER_SEGMENT; i++) {
      const unit = createObstacleUnit();
      unit.position.z = SLOT_Z[i] ?? -SEGMENT_LENGTH / 2 + i * 5;
      seg.add(unit);
      obstacles.push(unit);
    }
    seg.userData.obstacles = obstacles;
  }

  _onRecycle(seg) {
    this._ensurePool(seg);
    if (this.active) layoutObstacles(seg, getBiome(this.gameState.currentBiome));
    else hideObstacles(seg);
  }

  update(distance, delta, elapsed, player) {
    if (!this.active || !player.alive) return;
    const half = GAME.COLLISION_Z_HALF;
    for (const seg of this.track.segments) {
      const baseZ = seg.position.z;
      for (const ob of seg.userData.obstacles) {
        if (!ob.visible || ob.userData.consumed) continue;
        const worldZ = baseZ + ob.position.z;
        // Swept overlap of the obstacle's travel this frame with the player band.
        if (worldZ < -half || worldZ - distance > half) continue;
        if (ob.userData.lane !== player.laneIndex) continue;

        const cleared =
          ob.userData.type === 'low' ? player.clearsLow :
          ob.userData.type === 'high' ? player.clearsHigh :
          false;
        if (cleared) continue;
        if (player.invulnT > 0) continue; // harmless during i-frames / start grace

        ob.userData.consumed = true; // don't re-hit on subsequent frames
        player.hurt();
        this.gameState.lives -= 1;
        if (this.gameState.lives <= 0) {
          player.alive = false;
          this.hooks.onDeath?.();
        }
      }
    }
  }
}

function createObstacleUnit() {
  const group = new THREE.Group();

  const low = new THREE.Mesh(lowGeo, lowMat);
  low.position.y = 0.3;

  const high = new THREE.Mesh(highGeo, highMat);
  high.position.y = 1.55; // bottom ~1.3: standing hits it, sliding clears it

  const block = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.75;
  block.add(body);
  for (const ex of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 1.15, 0.32); // face the player (+z)
    block.add(eye);
  }

  // Biome sprite cards (one per role), hidden until a themed biome shows them.
  const cardDummy = new THREE.MeshBasicMaterial({ visible: false });
  const lowCard = new THREE.Mesh(lowCardGeo, cardDummy);
  lowCard.position.y = 0.6;
  const highCard = new THREE.Mesh(highCardGeo, cardDummy);
  highCard.position.y = 1.55;
  const blockCard = new THREE.Mesh(blockCardGeo, cardDummy);
  blockCard.position.y = 0.85;
  for (const c of [lowCard, highCard, blockCard]) c.visible = false;

  group.add(low, high, block, lowCard, highCard, blockCard);
  group.userData = {
    low, high, block,
    cards: { low: lowCard, high: highCard, block: blockCard },
    type: 'none', lane: 1, consumed: false,
  };
  group.visible = false;
  return group;
}

// Runs AFTER the can layout (Collectibles is registered first), so once obstacles
// are placed it can clear any can that would sit on top of one. `biome` decides each
// role's visual: a themed sprite card if the biome defines one, else the generic 3D
// placeholder (Temple).
function layoutObstacles(seg, biome) {
  for (const ob of seg.userData.obstacles) hideUnit(ob);
  for (const ob of seg.userData.obstacles) {
    if (Math.random() >= OBSTACLE_CHANCE) continue;
    const type = pickRandom(['low', 'high', 'block', 'block']); // enemies a bit more common
    const lane = Math.floor(Math.random() * GAME.LANE_X.length);
    ob.userData.type = type;
    ob.userData.lane = lane;
    ob.userData.consumed = false;
    ob.position.x = GAME.LANE_X[lane];
    ob.visible = true;

    const cardMat = obstacleCardMaterial(biome, type);
    if (cardMat) {
      const card = ob.userData.cards[type];
      card.material = cardMat;
      card.visible = true; // themed sprite/placeholder card
    } else {
      ob.userData[type].visible = true; // generic 3D placeholder (Temple)
    }
  }
  clearCansOnObstacles(seg);
}

function hideUnit(ob) {
  ob.visible = false;
  ob.userData.consumed = false;
  ob.userData.low.visible = false;
  ob.userData.high.visible = false;
  ob.userData.block.visible = false;
  ob.userData.cards.low.visible = false;
  ob.userData.cards.high.visible = false;
  ob.userData.cards.block.visible = false;
}

// Never drop a Pepsi onto a barrier/enemy: hide cans that share an obstacle's lane
// and sit within CAN_CLEAR_DZ of it, leaving a clean gap around each hazard.
function clearCansOnObstacles(seg) {
  const cans = seg.userData.cans;
  if (!cans) return;
  for (const ob of seg.userData.obstacles) {
    if (!ob.visible) continue;
    for (const can of cans) {
      if (can.visible && can.userData.lane === ob.userData.lane && Math.abs(can.position.z - ob.position.z) < CAN_CLEAR_DZ) {
        can.visible = false;
      }
    }
  }
}

function hideObstacles(seg) {
  if (!seg.userData.obstacles) return;
  for (const ob of seg.userData.obstacles) ob.visible = false;
}
