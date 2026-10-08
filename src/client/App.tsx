import { Route, Routes } from 'react-router';
import { StartScreen } from './screens/StartScreen';

export function App() {
  return (
    <Routes>
      <Route path="*" element={<StartScreen />} />
    </Routes>
  );
}
