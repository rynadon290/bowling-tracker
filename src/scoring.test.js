import { describe, it, expect } from 'vitest';
import { strictPartial } from './BowlingTracker.jsx';

function frame(n, fields) {
  return { frame: String(n), ballNum: null, ...fields };
}
function tenthBall(n, fields) {
  return { frame: '10', ballNum: n, ...fields };
}

describe('strictPartial — full game scoring', () => {
  it('a perfect game (12 strikes) scores 300', () => {
    const shots = [];
    for (let f = 1; f <= 9; f++) shots.push(frame(f, { result: 'Strike' }));
    shots.push(tenthBall(1, { result: 'Strike' }));
    shots.push(tenthBall(2, { result: 'Strike' }));
    shots.push(tenthBall(3, { result: 'Strike' }));
    expect(strictPartial(shots)).toBe(300);
  });

  it('every frame open at 9 pins (no strikes/spares ever triggering a bonus) scores 90', () => {
    const shots = [];
    for (let f = 1; f <= 9; f++) {
      shots.push(frame(f, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }));
    }
    shots.push(tenthBall(1, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }));
    expect(strictPartial(shots)).toBe(90);
  });

  it('a mix of strikes, a single-pin spare, and an open 10th resolves to a real total', () => {
    const shots = [];
    for (let f = 1; f <= 8; f++) shots.push(frame(f, { result: 'Strike' }));
    shots.push(frame(9, { result: 'Other Leave', otherLeave: ['5'], spareMade: 'Yes' }));
    shots.push(tenthBall(1, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }));
    expect(strictPartial(shots)).toBe(257);
  });

  it('an empty game returns null, not zero', () => {
    expect(strictPartial([])).toBeNull();
  });

  it('a single open frame missing its pin count is genuinely incomplete and returns null', () => {
    const shots = [frame(1, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '' })];
    expect(strictPartial(shots)).toBeNull();
  });

  it('a strike followed by a frame whose spare outcome is not yet decided returns null for both', () => {
    // Frame 1 (strike) needs frame 2 as its bonus, but frame 2's own
    // spareMade hasn't been chosen yet — neither frame can resolve.
    const shots = [
      frame(1, { result: 'Strike' }),
      frame(2, { result: 'Other Leave', otherLeave: ['7', '8'], spareMade: '' }),
    ];
    expect(strictPartial(shots)).toBeNull();
  });
});
