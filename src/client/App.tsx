import { useEffect, useRef } from 'react';
import { Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireSession } from './components/RequireSession';
import { ScrollToTop } from './components/ScrollToTop';
import { CollectionProvider, useCollection } from './data/collection';
import { CollectionViewProvider } from './data/collectionView';
import { renewStaleSubscription } from './data/push';
import { SessionProvider } from './data/session';
import { AccountScreen } from './screens/AccountScreen';
import { DoseFormScreen } from './screens/DoseFormScreen';
import { DoseLogScreen } from './screens/DoseLogScreen';
import { DoseReminderScreen } from './screens/DoseReminderScreen';
import { WellbeingFormScreen } from './screens/WellbeingFormScreen';
import { WellbeingLogScreen } from './screens/WellbeingLogScreen';
import { ReminderScreen } from './screens/ReminderScreen';
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
      <PushRenewal />
      <CollectionViewProvider>
        <Outlet />
      </CollectionViewProvider>
    </CollectionProvider>
  );
}

/** Once per start, when the local copy is ready: puts this device back on the server for the reminder. */
function PushRenewal() {
  const { state } = useCollection();
  const ready = state.status === 'ready';
  const reminderEnabled = state.status === 'ready' && state.settings.reminderEnabled;
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    void renewStaleSubscription(reminderEnabled);
  }, [ready, reminderEnabled]);

  return null;
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
              <Route path="dawki" element={<DoseLogScreen />} />
              <Route path="dawki/przypomnienie" element={<DoseReminderScreen />} />
              <Route path="dawki/nowy" element={<DoseFormScreen />} />
              <Route path="dawki/:id/edycja" element={<DoseFormScreen />} />
              <Route path="waga" element={<WellbeingLogScreen />} />
              <Route path="waga/nowy" element={<WellbeingFormScreen />} />
              <Route path="szukaj" element={<SearchScreen />} />
              <Route path="kolekcje" element={<OwnCollectionsScreen />} />
              <Route path="ustawienia" element={<SettingsScreen />} />
              <Route path="ustawienia/progi-filtrow" element={<ThresholdsScreen />} />
              <Route path="ustawienia/przypomnienie" element={<ReminderScreen />} />
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
