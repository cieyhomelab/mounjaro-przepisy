import { useState } from 'react';
import { Link } from 'react-router';
import {
  trustedSiteDeletedResponseSchema,
  trustedSiteResponseSchema,
  type TrustedSite,
} from '../../shared/contracts/trustedSite';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60';

function SiteRow({
  site,
  busy,
  onToggle,
  onAskDelete,
}: {
  site: TrustedSite;
  busy: boolean;
  onToggle: (site: TrustedSite) => void;
  onAskDelete: (site: TrustedSite) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-col">
        <span className="font-medium">{site.name}</span>
        <span className="text-neutral-600">{site.host}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={site.active}
            disabled={busy}
            onChange={() => onToggle(site)}
            aria-label={`Aktywny: ${site.name}`}
            className="size-6"
          />
          <span>{site.active ? 'Aktywny' : 'Wyłączony'}</span>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAskDelete(site)}
          aria-label={`Usuń serwis ${site.name}`}
          className={`${buttonClass} border border-red-800 text-red-900`}
        >
          Usuń
        </button>
      </div>
    </li>
  );
}

/** Settings → "Zaufane serwisy": switch sites on and off, remove them (S18). */
export function TrustedSitesScreen() {
  const { state, changeSaved } = useCollection();
  const { run, retry, busy, errorCode, clear } = useAction();
  const [deleting, setDeleting] = useState<TrustedSite | null>(null);

  const toggle = (site: TrustedSite) =>
    void run(async () => {
      const response = trustedSiteResponseSchema.parse(
        await apiRequest(`/api/trusted-sites/${site.id}`, {
          method: 'PATCH',
          body: { active: !site.active },
        }),
      );
      await changeSaved({ trustedSite: response.site }, response.dataVersion);
    });

  const remove = (site: TrustedSite) =>
    void run(async () => {
      const response = trustedSiteDeletedResponseSchema.parse(
        await apiRequest(`/api/trusted-sites/${site.id}`, { method: 'DELETE' }),
      );
      setDeleting(null);
      await changeSaved({ removeTrustedSiteId: site.id }, response.dataVersion);
    });

  const sites = state.status === 'ready' ? state.trustedSites : [];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link to="/ustawienia" className="inline-flex min-h-11 items-center font-medium underline">
          ← Ustawienia
        </Link>
        <h1 className="text-2xl font-semibold">Zaufane serwisy</h1>
      </div>
      <p>Wyszukiwanie przepisów obejmuje tylko aktywne serwisy z tej listy.</p>
      {state.status === 'ready' && sites.length === 0 ? (
        <p>
          Nie masz żadnych zaufanych serwisów, więc wyszukiwanie w serwisach nie ma gdzie szukać.
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {sites.map((site) => (
          <SiteRow
            key={site.id}
            site={site}
            busy={busy}
            onToggle={toggle}
            onAskDelete={(chosen) => {
              clear();
              setDeleting(chosen);
            }}
          />
        ))}
      </ul>
      {deleting ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-site-title"
          className="flex flex-col gap-3 rounded-lg border border-red-800 bg-red-50 p-4"
        >
          <h2 id="delete-site-title" className="text-lg font-semibold">
            Usunąć serwis {deleting.name}?
          </h2>
          <p>Przepisy zapisane z tego serwisu zostaną w Twojej kolekcji.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(deleting)}
              className={`${buttonClass} bg-red-800 text-white`}
            >
              Usuń serwis
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                clear();
                setDeleting(null);
              }}
              className={`${buttonClass} border border-neutral-400`}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </section>
  );
}
