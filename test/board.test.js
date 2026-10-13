import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, railColumns, BOARDS } from '../src/board/board.js';
import { createCamera } from '../src/core/camera.js';
import { v3 } from '../src/core/vec.js';

test('the 830 board has 830 holes', () => {
  const board = createBoard('bb830');
  assert.equal(board.holes.size, 830);
  assert.equal(railColumns(BOARDS.bb830).length, 50);
});

test('the 400 board has 400 holes', () => {
  assert.equal(createBoard('bb400').holes.size, 400);
});

test('holes in a strip share a node, across the channel they do not', () => {
  const board = createBoard();
  assert.equal(board.find('a12').node, board.find('e12').node);
  assert.notEqual(board.find('e12').node, board.find('f12').node);
  assert.notEqual(board.find('a12').node, board.find('a13').node);
  assert.equal(board.find('T+3').node, board.find('T+61').node);
});

test('hole names are case-insensitive and gaps in the rails do not exist', () => {
  const board = createBoard();
  assert.equal(board.find('C10').id, 'c10');
  assert.equal(board.find('t+3').id, 'T+3');
  assert.equal(board.find('T+8'), undefined);
  assert.equal(board.find('k1'), undefined);
  assert.equal(board.find('a64'), undefined);
});

test('neighbouring holes are one pitch apart', () => {
  const board = createBoard();
  const a = board.find('a1').pos;
  const b = board.find('a2').pos;
  const c = board.find('b1').pos;
  assert.ok(Math.abs(b.x - a.x - 2.54) < 1e-9);
  assert.ok(Math.abs(a.y - c.y - 2.54) < 1e-9);
});

test('isometric camera: front view puts higher columns to the right and up is up', () => {
  const cam = createCamera({ view: 'front', scale: 1 });
  const o = cam.project(v3(0, 0, 0));
  const x = cam.project(v3(10, 0, 0));
  const z = cam.project(v3(0, 0, 10));
  const back = cam.project(v3(0, 10, 0));
  assert.ok(x.x > o.x, 'x goes right');
  assert.ok(z.y < o.y, 'z goes up the screen');
  assert.ok(back.y < o.y, 'the back of the board is higher on screen');
  assert.ok(back.depth > o.depth, 'the back is farther away');
  // True isometric: the x axis makes 30° with the horizontal.
  assert.ok(Math.abs(Math.atan2(x.y - o.y, x.x - o.x) * (180 / Math.PI) - 30) < 1e-6);
});

test('the back view sees the board from the opposite corner', () => {
  const front = createCamera({ view: 'front' });
  const back = createCamera({ view: 'back' });
  assert.ok(front.toViewer.y < 0 && back.toViewer.y > 0);
});
