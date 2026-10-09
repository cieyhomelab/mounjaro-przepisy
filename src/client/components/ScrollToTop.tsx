import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** A new screen starts at the top, as after a full page load. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
