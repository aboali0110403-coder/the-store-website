import React, { Suspense, lazy } from 'react';
import { Route, Switch } from 'wouter';
import { BoutiqueProvider } from './components/SiteShell';
import Home from './pages/Home';
import Shop from './pages/Shop';
import NotFound from './pages/NotFound';

// Lazy load non-critical and heavy routes to prevent loading Admin or Checkout chunks on Home
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CustomDesign = lazy(() => import('./pages/CustomDesign'));
const Story = lazy(() => import('./pages/Story'));
const Policies = lazy(() => import('./pages/Policies'));
const Admin = lazy(() => import('./pages/Admin'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-12 text-[#806f77] text-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-[#49343f] border-t-transparent rounded-full animate-spin" />
        <span className="font-serif italic">Mero Atelier…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BoutiqueProvider>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/shop" component={Shop} />
          <Route path="/shop/:slug" component={ProductDetail} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/custom-design" component={CustomDesign} />
          <Route path="/our-story" component={Story} />
          <Route path="/policies/:slug" component={Policies} />
          <Route path="/track-order" component={TrackOrder} />
          <Route path="/track" component={TrackOrder} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </BoutiqueProvider>
  );
}

