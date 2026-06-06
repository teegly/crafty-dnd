import { pickRandom, randRange } from './util.js';

export function dressSegment(seg) {
  const patterns = [
    { left: 'arch', right: 'shelf' },
    { left: 'gap', right: 'arch' },
    { left: 'shelf', right: 'gap' },
    { left: 'wall', right: 'arch' },
  ];
  const pattern = pickRandom(patterns);

  for (const wallSet of seg.userData.wallSets) {
    const side = wallSet.userData.side;
    const mode = side < 0 ? pattern.left : pattern.right;
    dressWallSet(wallSet, mode);
  }

  for (const shelf of seg.userData.shelves) {
    const side = shelf.userData.side;
    const mode = side < 0 ? pattern.left : pattern.right;
    shelf.visible = mode === 'shelf' || Math.random() < 0.72;
    shelf.position.z = shelf.userData.baseZ + randRange(-0.8, 0.8);
    shelf.rotation.y = side * randRange(0.04, 0.12);
  }

  for (const stack of seg.userData.bookStacks) {
    stack.visible = Math.random() < 0.55;
    stack.position.z = stack.userData.baseZ + randRange(-7, 7);
    stack.rotation.y = Math.random() * Math.PI * 2;
  }

  for (const lantern of seg.userData.lanterns) {
    lantern.visible = Math.random() < 0.62;
    lantern.position.z = lantern.userData.baseZ + randRange(-0.8, 0.8);
    lantern.scale.setScalar(randRange(0.72, 0.95));
  }

  for (const banner of seg.userData.banners) {
    banner.visible = Math.random() < 0.55;
    banner.position.z = banner.userData.baseZ + randRange(-1.5, 1.5);
    banner.scale.y = randRange(0.85, 1.2);
  }

  for (const archway of seg.userData.archways) {
    archway.visible = Math.random() < 0.95;
    archway.position.z = archway.userData.baseZ + randRange(-0.9, 0.9);
    archway.scale.y = randRange(0.85, 1.12);
  }
  dressArchwayCreepers(seg.userData.archways);

  for (const curtain of seg.userData.vineCurtains) {
    curtain.visible = Math.random() < 0.82;
    curtain.position.z = curtain.userData.baseZ + randRange(-0.75, 0.75);
  }

  for (const ceiling of seg.userData.ceiling) {
    ceiling.visible = Math.random() < 0.32;
    ceiling.position.z = ceiling.userData.baseZ + randRange(-1, 1);
    ceiling.rotation.z = randRange(-0.12, 0.12);
    ceiling.scale.x = randRange(0.75, 1.25);
  }

  for (const pillar of seg.userData.pillars) {
    pillar.visible = Math.random() < 0.45;
    pillar.scale.setScalar(randRange(0.88, 1.08));
  }
  seg.userData.heroArchway.visible = Math.random() < 0.4;
}

function dressWallSet(group, mode) {
  const { lower, topLeft, topRight, archTop, moss, stoneChips, sconce } = group.userData.parts;
  group.visible = mode !== 'gap' || Math.random() < 0.45;
  lower.visible = mode !== 'gap';
  topLeft.visible = mode === 'arch' || mode === 'wall' || Math.random() < 0.45;
  topRight.visible = mode === 'arch' || mode === 'wall' || Math.random() < 0.45;
  archTop.visible = mode === 'arch' || Math.random() < 0.25;
  moss.visible = Math.random() < 0.75;
  for (const chip of stoneChips) {
    chip.visible = mode !== 'gap' && Math.random() < 0.8;
  }
  sconce.visible = mode !== 'gap' && Math.random() < 0.5;
  group.position.z = group.userData.baseZ + randRange(-0.8, 0.8);
  group.scale.y = randRange(0.9, 1.15);
}

function dressArchwayCreepers(archways) {
  let previousSide = 0;
  let sameSideRun = 0;

  for (const archway of archways) {
    let mode = Math.random() < 0.32 ? (Math.random() < 0.28 ? 3 : (Math.random() < 0.5 ? -1 : 1)) : 0;
    if (mode !== 0 && mode !== 3 && mode === previousSide && sameSideRun >= 1) {
      mode = Math.random() < 0.55 ? -mode : 0;
    }

    const leftVisible = mode === -1 || mode === 3;
    const rightVisible = mode === 1 || mode === 3;
    setArchwayCreeper(archway.userData.creepersLeft, leftVisible, -1);
    setArchwayCreeper(archway.userData.creepersRight, rightVisible, 1);
    setArchwayLoop(archway.userData.loopLeft, !leftVisible && Math.random() < 0.16, -1);
    setArchwayLoop(archway.userData.loopRight, !rightVisible && Math.random() < 0.16, 1);

    if (mode === previousSide && mode !== 0 && mode !== 3) sameSideRun++;
    else sameSideRun = mode === 0 || mode === 3 ? 0 : 1;
    previousSide = mode === 3 ? 0 : mode;
  }
}

function setArchwayCreeper(creeper, visible, side) {
  creeper.visible = visible;
  if (!visible) return;
  const flip = Math.random() < 0.5 ? -1 : 1;
  creeper.scale.set(flip * randRange(0.52, 0.72), randRange(0.52, 0.72), 1);
  creeper.position.x = side * randRange(1.65, 2.35);
  creeper.position.y = randRange(3.35, 3.58);
}

function setArchwayLoop(loop, visible, side) {
  loop.visible = visible;
  if (!visible) return;
  const flip = side < 0 ? -1 : 1;
  loop.scale.set(flip * randRange(0.48, 0.62), randRange(0.48, 0.62), 1);
  loop.position.x = side * randRange(1.75, 2.35);
  loop.position.y = randRange(3.65, 3.9);
  loop.rotation.z = side * randRange(-0.06, 0.08);
}
