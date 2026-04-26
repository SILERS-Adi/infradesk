import { canTransition, assertTransition, allowedNextStates, isTerminal } from '../../src/utils/ticketStateMachine';

describe('ticketStateMachine', () => {
  it('allows NEW → OPEN', () => {
    expect(canTransition('NEW', 'OPEN')).toBe(true);
  });
  it('denies NEW → IN_PROGRESS', () => {
    expect(canTransition('NEW', 'IN_PROGRESS')).toBe(false);
  });
  it('allows reopening CLOSED → OPEN', () => {
    expect(canTransition('CLOSED', 'OPEN')).toBe(true);
  });
  it('treats CANCELLED as terminal', () => {
    expect(allowedNextStates('CANCELLED')).toEqual([]);
    expect(isTerminal('CANCELLED')).toBe(true);
  });
  it('IN_PROGRESS → RESOLVED', () => {
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
  });
  it('assertTransition throws on illegal move', () => {
    expect(() => assertTransition('NEW', 'CLOSED')).toThrow();
  });
});
