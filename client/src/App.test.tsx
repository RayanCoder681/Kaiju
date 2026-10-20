import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('affiche l’accueil Kaiju avec le champ de code', () => {
    render(<App />);
    expect(screen.getAllByText('Kaiju').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/code de la session/i)).toBeInTheDocument();
  });
});
