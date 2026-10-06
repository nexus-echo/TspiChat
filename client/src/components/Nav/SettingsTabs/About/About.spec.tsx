import React from 'react';
import { render, screen } from '@testing-library/react';
import About, { TSPI_DIGITAL_VERSION } from './About';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('About (TSPI Digital)', () => {
  it('shows the TSPI Digital version', () => {
    render(<About />);
    expect(screen.getByText('com_nav_about_tspi_version')).toBeInTheDocument();
    expect(screen.getByText(TSPI_DIGITAL_VERSION)).toBeInTheDocument();
    expect(TSPI_DIGITAL_VERSION).toBe('v1.0.0');
  });

  it('does not show commit, branch, build date or the diagnostics copy button', () => {
    render(<About />);
    expect(screen.queryByText('com_nav_about_commit')).not.toBeInTheDocument();
    expect(screen.queryByText('com_nav_about_branch')).not.toBeInTheDocument();
    expect(screen.queryByText('com_nav_about_build_date')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
