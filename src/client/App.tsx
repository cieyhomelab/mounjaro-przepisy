import { Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireSession } from './components/RequireSession';
import { CollectionProvider } from './data/collection';
import { CollectionViewProvider } from './data/collectionView';
import { SessionProvider } from './data/session';
import { AccountScreen } from './screens/AccountScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { ImportScreen } from './screens/ImportScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OwnCollectionsScreen } from './screens/OwnCollectionsScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { RecipeEditScreen, RecipeFormScreen } from './screens/RecipeFormScreen';
import { RecipeScreen } from './screens/RecipeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ThresholdsScreen } from './screens/ThresholdsScreen';

/** Local copy of the user's data, kept in step with the server while a session exists. */
function DataLayout() {
  return (
    <CollectionProvider>
      <CollectionViewProvider>
        <Outlet />
      </CollectionViewProvider>
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
              <Route path="przepisy/z-linku" element={<ImportScreen />} />
              <Route path="przepisy/:id/edycja" element={<RecipeEditScreen />} />
              <Route path="przepisy/:id" element={<RecipeScreen />} />
              <Route path="kolekcje" element={<OwnCollectionsScreen />} />
              <Route path="ustawienia" element={<SettingsScreen />} />
              <Route path="ustawienia/progi-filtrow" element={<ThresholdsScreen />} />
              <Route path="konto" element={<AccountScreen />} />
              <Route path="*" element={<NotFoundScreen />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  );
}
