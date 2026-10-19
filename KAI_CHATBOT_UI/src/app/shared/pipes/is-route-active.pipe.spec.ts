import { IsRouteActivePipe } from './is-route-active.pipe';

describe('IsRouteActivePipe', () => {
  let pipe: IsRouteActivePipe;

  beforeEach(() => {
    pipe = new IsRouteActivePipe();
  });

  it('should return true if currentUrl starts with path', () => {
    expect(pipe.transform('/chatbot', '/chatbot/session/123')).toBeTrue();
    expect(pipe.transform('/hr-portal', '/hr-portal')).toBeTrue();
  });

  it('should return false if currentUrl does not start with path', () => {
    expect(pipe.transform('/admin', '/chatbot')).toBeFalse();
  });

  it('should handle invalid/null inputs without throwing exceptions', () => {
    expect(pipe.transform('/admin', null as any)).toBeFalse();
  });
});
