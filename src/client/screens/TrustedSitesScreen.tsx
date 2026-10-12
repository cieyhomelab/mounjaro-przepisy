import { useState, type FormEvent } from 'react';
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
import { Button } from '../components/ui/Button';
import { ConfirmPanel } from '../components/ui/ConfirmPanel';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

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
    <Card as="li" compact className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-col">
        <span className="font-medium">{site.name}</span>
        <span className="text-ink-muted">{site.host}</span>
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
        <Button
          disabled={busy}
          onClick={() => onAskDelete(site)}
          aria-label={`Usuń serwis ${site.name}`}
          variant="danger-outline"
        >
          Usuń
        </Button>
      </div>
    </Card>
  );
}

/** Settings → "Zaufane serwisy": switch sites on and off, remove them (S18). */
export function TrustedSitesScreen() {
  const { state, changeSaved } = useCollection();
  const { run, retry, busy, errorCode, clear } = useAction();
  const [deleting, setDeleting] = useState<TrustedSite | null>(null);
  const [address, setAddress] = useState('');

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

  const add = () =>
    void run(async () => {
      const response = trustedSiteResponseSchema.parse(
        await apiRequest('/api/trusted-sites', { method: 'POST', body: { url: address.trim() } }),
      );
      setAddress('');
      await changeSaved({ trustedSite: response.site }, response.dataVersion);
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (address.trim() !== '' && !busy) add();
  };

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
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="site-address" className="font-medium">
          Adres serwisu
        </label>
        <Input
          id="site-address"
          type="text"
          inputMode="url"
          autoComplete="off"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="w-full"
        />
        <div>
          <Button type="submit" disabled={busy || address.trim() === ''}>
            Dodaj serwis
          </Button>
        </div>
        {busy ? (
          <p role="status" className="text-ink-muted">
            Sprawdzam serwis…
          </p>
        ) : null}
      </form>
      {deleting ? (
        <ConfirmPanel titleId="delete-site-title" title={<>Usunąć serwis {deleting.name}?</>}>
          <p>Przepisy zapisane z tego serwisu zostaną w Twojej kolekcji.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => remove(deleting)} variant="danger">
              Usuń serwis
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                clear();
                setDeleting(null);
              }}
              variant="secondary"
            >
              Anuluj
            </Button>
          </div>
        </ConfirmPanel>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </section>
  );
}
