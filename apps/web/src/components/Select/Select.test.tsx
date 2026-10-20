import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Select } from './Select';

const sampleOptions = [
  { value: 'cs_a', label: 'Computer Engineering A' },
  { value: 'cs_b', label: 'Computer Engineering B' },
];

describe('Select Component', () => {
  it('renders with label and placeholder', () => {
    render(
      <Select
        label="Target Class"
        placeholder="Select class"
        options={sampleOptions}
      />
    );
    expect(screen.getByLabelText(/target class/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /select class/i })).toBeInTheDocument();
  });

  it('renders all options properly', () => {
    render(<Select options={sampleOptions} />);
    expect(screen.getByRole('option', { name: 'Computer Engineering A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Computer Engineering B' })).toBeInTheDocument();
  });

  it('displays field-level validation error message', () => {
    render(
      <Select
        label="Target Class"
        options={sampleOptions}
        error="Class selection is required"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Class selection is required');
  });

  it('triggers onChange when selecting a new option', async () => {
    const handleChange = vi.fn();
    render(<Select options={sampleOptions} onChange={handleChange} />);
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'cs_a');
    expect(handleChange).toHaveBeenCalled();
  });
});
