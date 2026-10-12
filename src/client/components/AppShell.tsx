import { useEffect } from 'react';
import { BookOpen, CalendarDays, HeartPulse, ShoppingBasket, type LucideIcon } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useCollection } from '../data/collection';
import { useCollectionView } from '../data/collectionView';
import { NAV_ITEMS, placementOf, type NavItemId } from '../navigation';
import { OfflineBadge } from './OfflineBadge';
import { ReminderBanner } from './ReminderBanner';

const ICONS: Record<NavItemId, LucideIcon> = {
  recipes: BookOpen,
  planner: CalendarDays,
  shopping: ShoppingBasket,
  health: HeartPulse,
};

/** Bottom bar on a phone (below 768 px): a floating pill; the active item shows its label. */
function BottomBar({ active }: { active: NavItemId | null }) {
  return (
    <nav
      aria-label="Nawigacja główna"
      className="fixed inset-x-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between rounded-full bg-nav p-2 shadow-nav md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.id];
        const current = item.id === active;
        return (
          <Link
            key={item.id}
            to={item.to}
            aria-current={current ? 'page' : undefined}
            aria-label={current ? undefined : item.label}
            className={`flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-full px-4 font-medium ${
              current ? 'bg-bg text-ink' : 'text-on-nav'
            }`}
          >
            <Icon aria-hidden="true" size={22} />
            {current ? <span>{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Side menu on a computer (768 px and wider): app name, the four items and own collections. */
function SideMenu({ active }: { active: NavItemId | null }) {
  const { state } = useCollection();
  const { collectionId, setCollectionId } = useCollectionView();
  const navigate = useNavigate();
  const collections = state.status === 'ready' ? state.collections : [];

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 overflow-y-auto bg-surface-muted p-4 md:flex">
      <Link to="/" className="flex min-h-touch items-center font-heading text-xl font-bold">
        Mounjaro Przepisy
      </Link>
      <nav aria-label="Nawigacja główna">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.id];
            const current = item.id === active;
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  aria-current={current ? 'page' : undefined}
                  className={`flex min-h-touch items-center gap-3 rounded-full px-4 font-medium ${
                    current ? 'bg-bg text-ink' : 'text-ink-muted'
                  }`}
                >
                  <Icon aria-hidden="true" size={22} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {collections.length > 0 ? (
        <section aria-labelledby="side-collections" className="flex flex-col gap-1">
          <h2 id="side-collections" className="px-4 text-sm font-semibold text-ink-muted">
            Moje kolekcje
          </h2>
          <ul className="flex flex-col gap-1">
            {collections.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button"
                  aria-pressed={collectionId === collection.id}
                  onClick={() => {
                    setCollectionId(collection.id);
                    void navigate('/');
                  }}
                  className={`flex min-h-touch w-full cursor-pointer items-center rounded-full px-4 text-left ${
                    collectionId === collection.id ? 'bg-primary-soft text-on-primary-soft' : ''
                  }`}
                >
                  {collection.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

/** Layout of every screen available after login: navigation and the offline marker above the content. */
export function AppShell() {
  const { pathname } = useLocation();
  const { item, area } = placementOf(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (area === 'health') root.setAttribute('data-area', 'health');
    else root.removeAttribute('data-area');
    return () => root.removeAttribute('data-area');
  }, [area]);

  return (
    <div className="flex min-h-dvh">
      <SideMenu active={item} />
      <div className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col">
        <div className="flex px-4 pt-2 empty:hidden">
          <OfflineBadge />
        </div>
        <ReminderBanner />
        <main className="flex-1 p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-4">
          <Outlet />
        </main>
      </div>
      <BottomBar active={item} />
    </div>
  );
}
