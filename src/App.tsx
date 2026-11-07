import React from 'react';
import { Route, Switch } from 'wouter';
import { BoutiqueProvider } from './components/SiteShell';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import CustomDesign from './pages/CustomDesign';
import Story from './pages/Story';
import Policies from './pages/Policies';
import Admin from './pages/Admin';
import TrackOrder from './pages/TrackOrder';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BoutiqueProvider>
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
    </BoutiqueProvider>
  );
}
