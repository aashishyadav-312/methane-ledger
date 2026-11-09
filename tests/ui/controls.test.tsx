import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, Chip, Segmented, Slider, Tag, VerdictPill } from '../../src/ui';

afterEach(() => cleanup());

function ChipDemo() {
  const [pressed, setPressed] = useState(false);
  return (
    <Chip pressed={pressed} onPressedChange={setPressed}>
      CCTS floor
    </Chip>
  );
}

function SegmentedDemo() {
  const [value, setValue] = useState<'power' | 'flare'>('power');
  return (
    <Segmented
      label="Use the drained gas to"
      value={value}
      onChange={setValue}
      options={[
        { value: 'power', label: 'Make power' },
        { value: 'flare', label: 'Flare it' },
      ]}
    />
  );
}

describe('Chip', () => {
  it('toggles aria-pressed by click', async () => {
    const user = userEvent.setup();
    render(<ChipDemo />);
    const chip = screen.getByRole('button', { name: 'CCTS floor' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles by keyboard with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<ChipDemo />);
    const chip = screen.getByRole('button', { name: 'CCTS floor' });
    await user.tab();
    expect(document.activeElement).toBe(chip);
    await user.keyboard('{Enter}');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard(' ');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Segmented', () => {
  it('names the group from its label and marks one segment pressed', () => {
    render(<SegmentedDemo />);
    const group = screen.getByRole('group', { name: 'Use the drained gas to' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make power' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Flare it' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('moves the pressed segment by click', async () => {
    const user = userEvent.setup();
    render(<SegmentedDemo />);
    await user.click(screen.getByRole('button', { name: 'Flare it' }));
    expect(screen.getByRole('button', { name: 'Flare it' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Make power' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('works by keyboard: Tab to a segment, then Enter or Space', async () => {
    const user = userEvent.setup();
    render(<SegmentedDemo />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Make power' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Flare it' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Flare it' }).getAttribute('aria-pressed')).toBe('true');
    await user.tab({ shift: true });
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Make power' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('can hide its label from sight and keep it for screen readers', () => {
    render(
      <Segmented
        label="Discount rate"
        hideLabel
        value="a"
        onChange={() => {}}
        options={[{ value: 'a', label: 'A' }]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Discount rate' })).toBeTruthy();
    expect(screen.getByText('Discount rate').className).toBe('sr-only');
  });
});

describe('Button', () => {
  it('renders a link when given an href, and a button otherwise', () => {
    render(
      <>
        <Button href="#/method">Method</Button>
        <Button>Reset</Button>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Method' }).getAttribute('href')).toBe('#/method');
    expect(screen.getByRole('button', { name: 'Reset' }).getAttribute('type')).toBe('button');
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(
      <Button disabled onClick={() => (clicks += 1)}>
        Go
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(clicks).toBe(0);
  });
});

describe('Slider, Tag and VerdictPill', () => {
  it('labels the range input and exposes its value text', () => {
    render(<Slider label="Drained gas" valueText="20 Mm³ / yr" min={5} max={80} value={20} onChange={() => {}} />);
    const input = screen.getByRole('slider', { name: 'Drained gas' });
    expect(input.getAttribute('aria-valuetext')).toBe('20 Mm³ / yr');
  });

  it('shows a tag label for every kind', () => {
    render(
      <>
        <Tag kind="measured" />
        <Tag kind="estimated" />
        <Tag kind="literature" />
        <Tag kind="dummy" />
        <Tag kind="illustrative" />
      </>,
    );
    for (const text of ['Measured', 'Estimated', 'Literature', 'Dummy', 'Illustrative inputs']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('puts the verdict in words', () => {
    render(<VerdictPill verdict="short">Short by $3.50 a tonne</VerdictPill>);
    expect(screen.getByText('Short by $3.50 a tonne')).toBeTruthy();
  });
});
