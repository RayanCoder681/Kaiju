import { describe, it, expect } from 'vitest';
import {
  canTransitionSession,
  canTransitionActivity,
  activityAcceptsAnswers,
  joinAllowedWhileActivity,
} from './states.js';

describe('machine à états — session', () => {
  it('autorise preparation -> active', () => {
    expect(canTransitionSession('preparation', 'active')).toBe(true);
  });
  it('rejette closed -> active (état terminal)', () => {
    expect(canTransitionSession('closed', 'active')).toBe(false);
  });
  it('rejette preparation -> suspended (transition absente)', () => {
    expect(canTransitionSession('preparation', 'suspended')).toBe(false);
  });
});

describe('machine à états — activité', () => {
  it('autorise running -> paused -> running', () => {
    expect(canTransitionActivity('running', 'paused')).toBe(true);
    expect(canTransitionActivity('paused', 'running')).toBe(true);
  });
  it('n’accepte des réponses que pendant running', () => {
    expect(activityAcceptsAnswers('running')).toBe(true);
    expect(activityAcceptsAnswers('paused')).toBe(false);
    expect(activityAcceptsAnswers('closed')).toBe(false);
  });
});

describe('verrouillage d’entrée participant', () => {
  it('autorise l’entrée sans activité', () => {
    expect(joinAllowedWhileActivity(null)).toBe(true);
  });
  it('bloque l’entrée pendant une activité en cours', () => {
    expect(joinAllowedWhileActivity('running')).toBe(false);
    expect(joinAllowedWhileActivity('countdown')).toBe(false);
    expect(joinAllowedWhileActivity('paused')).toBe(false);
  });
  it('réautorise l’entrée entre deux activités', () => {
    expect(joinAllowedWhileActivity('closed')).toBe(true);
    expect(joinAllowedWhileActivity('prepared')).toBe(true);
  });
});
