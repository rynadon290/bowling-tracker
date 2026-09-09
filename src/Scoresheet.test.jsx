import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Scoresheet from './Scoresheet.jsx';

// Real clicks on real frames.
//
// The scoresheet is the main way frames get edited, and tapping one now
// does four different things depending on context -- including one that
// SAVES a shot. Render tests can prove the marks and totals are right;
// only a click can prove the right thing happens when a bowler taps.
//
// Every bug this file guards against was a real one: a filter that
// matched no shots left every frame with `shot: null`, so taps silently
// did nothing and the frames never filled in.

const strike = (f, b = null) => ({
  frame: String(f), ballNum: b, result: 'Strike',
  otherLeave: [], spareMade: '', pinCount: '',
});
const spare = f => ({
  frame: String(f), ballNum: null, result: 'Other Leave',
  otherLeave: ['10'], spareMade: 'Yes', pinCount: '9',
});
const open = (f, total) => ({
  frame: String(f), ballNum: null, result: 'Other Leave',
  otherLeave: ['7', '10'], spareMade: 'No', pinCount: String(total),
});

// Frames are buttons labelled "Frame N, ...", so this finds one by number
// regardless of what it currently shows.
const frame = n => screen.getByRole('button', { name: new RegExp(`^Frame ${n}[,$]`) });

describe('tapping a frame', () => {
  it('passes the shot back for a frame that was bowled', () => {
    const onSelectFrame = vi.fn();
    const first = strike(1);
    render(<Scoresheet shots={[first]} currentFrame="2" onSelectFrame={onSelectFrame} />);

    fireEvent.click(frame(1));

    expect(onSelectFrame).toHaveBeenCalledTimes(1);
    const [frameArg, shotArg] = onSelectFrame.mock.calls[0];
    expect(String(frameArg)).toBe('1');
    expect(shotArg).toBe(first);
  });

  // The caller distinguishes "edit this" from "move here" by whether a
  // shot came back, so an unbowled frame MUST pass a falsy shot.
  it('passes no shot for a frame that was not bowled', () => {
    const onSelectFrame = vi.fn();
    render(<Scoresheet shots={[strike(1)]} currentFrame="2" onSelectFrame={onSelectFrame} />);

    fireEvent.click(frame(7));

    const [frameArg, shotArg] = onSelectFrame.mock.calls[0];
    expect(String(frameArg)).toBe('7');
    expect(shotArg).toBeFalsy();
  });

  it('makes every frame tappable, not just bowled ones', () => {
    const onSelectFrame = vi.fn();
    render(<Scoresheet shots={[strike(1)]} currentFrame="2" onSelectFrame={onSelectFrame} />);

    for (let n = 1; n <= 10; n++) fireEvent.click(frame(n));

    expect(onSelectFrame).toHaveBeenCalledTimes(10);
  });

  it('does not throw when no handler is given', () => {
    render(<Scoresheet shots={[strike(1)]} currentFrame="2" />);
    expect(() => fireEvent.click(frame(1))).not.toThrow();
  });
});

describe('what the frames show', () => {
  it('fills in a strike once its bonus balls are thrown', () => {
    // Hand-computed: X, X, 9/, 8- -> 29, 49, 67, 75.
    render(<Scoresheet shots={[strike(1), strike(2), spare(3), open(4, 8)]} currentFrame="5" />);

    expect(frame(1)).toHaveTextContent('29');
    expect(frame(2)).toHaveTextContent('49');
    expect(frame(3)).toHaveTextContent('67');
    expect(frame(4)).toHaveTextContent('75');
  });

  // Frame 1 genuinely isn't scoreable until frames 2 and 3 are bowled.
  // A paper scoresheet leaves it blank; a provisional number would be a
  // lie about the score.
  //
  // Asserted via the accessible name rather than the visible text: the
  // frame shows its own number ("1") alongside the mark, so a plain
  // digit check can't tell "frame 1" from "scored 1".
  it('leaves a frame blank when its score is not yet knowable', () => {
    render(<Scoresheet shots={[strike(1)]} currentFrame="2" />);
    expect(frame(1)).toHaveAccessibleName('Frame 1, X');
    expect(frame(1)).not.toHaveAccessibleName(/running/);
  });

  it('labels an unbowled frame as such for screen readers', () => {
    render(<Scoresheet shots={[strike(1)]} currentFrame="2" />);
    expect(frame(6)).toHaveAccessibleName(/not bowled/);
  });

  it('scores a perfect game', () => {
    const nine = [...Array(9)].map((_, i) => strike(i + 1));
    render(<Scoresheet shots={[...nine, strike(10, 1), strike(10, 2), strike(10, 3)]} />);
    expect(frame(10)).toHaveTextContent('300');
  });

  // Nothing bowled and nothing in progress: ten empty boxes before the
  // first ball is noise, not information.
  it('renders nothing before a game starts', () => {
    const { container } = render(<Scoresheet shots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('appears as soon as a frame is in progress', () => {
    render(<Scoresheet shots={[]} currentFrame="1" />);
    expect(frame(1)).toBeInTheDocument();
  });
});
