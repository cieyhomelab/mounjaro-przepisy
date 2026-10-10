import { Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireSession } from './components/RequireSession';
import { ScrollToTop } from './components/ScrollToTop';
import { CollectionProvider } from './data/collection';
import { CollectionViewProvider } from './data/collectionView';
import { SessionProvider } from './data/session';
import { AccountScreen } from './screens/AccountScreen';
import { CookScreen } from './screens/CookScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { ImportScreen } from './screens/ImportScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OwnCollectionsScreen } from './screens/OwnCollectionsScreen';
import { MyDataScreen } from './screens/MyDataScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { PlannerScreen } from './screens/PlannerScreen';
import { RecipeEditScreen, RecipeFormScreen } from './screens/RecipeFormScreen';
import { RecipeScreen } from './screens/RecipeScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ShoppingScreen } from './screens/ShoppingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ThresholdsScreen } from './screens/ThresholdsScreen';
import { TrustedSitesScreen } from './screens/TrustedSitesScreen';

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
      <ScrollToTop />
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
              <Route path="planer" element={<PlannerScreen />} />
              <Route path="zakupy" element={<ShoppingScreen />} />
              <Route path="szukaj" element={<SearchScreen />} />
              <Route path="kolekcje" element={<OwnCollectionsScreen />} />
              <Route path="ustawienia" element={<SettingsScreen />} />
              <Route path="ustawienia/progi-filtrow" element={<ThresholdsScreen />} />
              <Route path="ustawienia/zaufane-serwisy" element={<TrustedSitesScreen />} />
              <Route path="ustawienia/moje-dane" element={<MyDataScreen />} />
              <Route path="konto" element={<AccountScreen />} />
              <Route path="*" element={<NotFoundScreen />} />
            </Route>
            <Route path="przepisy/:id/gotuj" element={<CookScreen />} />
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  );
}
