import { lazy, Suspense, useEffect, useState } from 'react';
import { Landing } from './ui/Landing';

// El simulador (Three.js + WASM) se carga solo al entrar: la portada abre al instante
const Simulator = lazy(() => import('./Simulator').then((m) => ({ default: m.Simulator })));

type Route = 'landing' | 'sim';

function currentRoute(): Route {
  if (location.hash.startsWith('#/simulador')) return 'sim';
  // Un enlace compartido (?t=…&focus=…) abre directamente el simulador
  const q = new URLSearchParams(location.search);
  return q.has('t') || q.has('focus') ? 'sim' : 'landing';
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'sim') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-space" />}>
        <Simulator
          onExit={() => {
            location.hash = '';
            history.replaceState(null, '', location.pathname);
            setRoute('landing');
          }}
        />
      </Suspense>
    );
  }
  return <Landing onEnter={() => (location.hash = '#/simulador')} />;
}
