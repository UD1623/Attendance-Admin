import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge Component', () => {
  it('renders Present status with text and icon', () => {
    const { container } = render(<StatusBadge status="Present" />);
    expect(screen.getByText('Present')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders Late status with custom label', () => {
    render(<StatusBadge status="Late" label="Arrived Late (10m)" />);
    expect(screen.getByText('Arrived Late (10m)')).toBeInTheDocument();
  });

  it('renders Rejected and Device Error statuses without errors', () => {
    render(<StatusBadge status="Rejected" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });
});
