import { useEffect } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/** A new screen starts at the top, as after a full page load; going back keeps the position. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === NavigationType.Pop) return;
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  return null;
}
