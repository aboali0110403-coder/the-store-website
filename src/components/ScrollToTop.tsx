import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

// Scrolls to the top whenever the route path changes. Query-only changes
// (shop filters, tracking codes) and in-page anchors keep the current scroll.
const ScrollToTop = () => {
  const [location] = useLocation();
  const pathname = location.split(/[?#]/)[0];
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current !== pathname) {
      previous.current = pathname;
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
