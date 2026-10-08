import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireSession } from './components/RequireSession';
import { SessionProvider } from './data/session';
import { AccountScreen } from './screens/AccountScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { LoginScreen } from './screens/LoginScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/logowanie" element={<LoginScreen />} />
        <Route element={<RequireSession />}>
          <Route element={<AppShell />}>
            <Route index element={<CollectionScreen />} />
            <Route path="konto" element={<AccountScreen />} />
            <Route path="*" element={<NotFoundScreen />} />
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  );
}
