import { Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireSession } from './components/RequireSession';
import { CollectionProvider } from './data/collection';
import { SessionProvider } from './data/session';
import { AccountScreen } from './screens/AccountScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { LoginScreen } from './screens/LoginScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { RecipeFormScreen } from './screens/RecipeFormScreen';
import { RecipeScreen } from './screens/RecipeScreen';

/** Local copy of the user's data, kept in step with the server while a session exists. */
function DataLayout() {
  return (
    <CollectionProvider>
      <Outlet />
    </CollectionProvider>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/logowanie" element={<LoginScreen />} />
        <Route element={<RequireSession />}>
          <Route element={<DataLayout />}>
            <Route element={<AppShell />}>
              <Route index element={<CollectionScreen />} />
              <Route path="przepisy/nowy" element={<RecipeFormScreen />} />
              <Route path="przepisy/:id" element={<RecipeScreen />} />
              <Route path="konto" element={<AccountScreen />} />
              <Route path="*" element={<NotFoundScreen />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  );
}
