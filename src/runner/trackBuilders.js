import * as THREE from 'three';
import { dressSegment } from './segmentDressers.js';
import { SEGMENT_LENGTH } from './trackConstants.js';
import { addTrackBase } from './trackBase.js';
import { addTrackDecorations } from './trackDecorations.js';

export { SEGMENT_LENGTH, dressSegment };

export function createSegment() {
  const group = new THREE.Group();
  addTrackBase(group);
  addTrackDecorations(group);
  return group;
}
