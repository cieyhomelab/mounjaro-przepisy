import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { DELETE_CONFIRMATION } from '../../shared/contracts/account';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiDownload } from '../data/api';
import { errorMessage } from '../data/errors';
import { useSession } from '../data/session';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60';

/** Hands the received file to the browser as a download. */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExportData() {
  const { run, retry, busy, errorCode } = useAction();
  const [done, setDone] = useState(false);

  const start = () =>
    void run(async () => {
      setDone(false);
      const file = await apiDownload('/api/account/export');
      saveFile(file.blob, file.filename);
      setDone(true);
    });

  return (
    <section aria-labelledby="export-heading" className="flex flex-col gap-2">
      <h2 id="export-heading" className="text-lg font-semibold">
        Eksport danych
      </h2>
      <p>
        Pobierzesz jeden plik ZIP: wszystkie Twoje dane w pliku <code>dane.json</code> oraz zdjęcia
        przepisów w katalogu <code>zdjecia</code>.
      </p>
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={start}
          className={`${buttonClass} bg-neutral-900 text-white`}
        >
          Eksportuj dane
        </button>
      </div>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
      {done && !errorCode ? <p role="status">Plik z danymi został pobrany.</p> : null}
    </section>
  );
}

function DeleteAccount() {
  const { deleteAccount } = useSession();
  const { run, retry, busy, errorCode, clear } = useAction();
  const [asking, setAsking] = useState(false);
  const [word, setWord] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const cancel = () => {
    setAsking(false);
    setWord('');
    setMismatch(false);
    clear();
  };

  const confirm = (event?: FormEvent) => {
    event?.preventDefault();
    if (word.trim().normalize('NFC') !== DELETE_CONFIRMATION) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    // On success the session ends and the login screen replaces this one.
    void run(() => deleteAccount(DELETE_CONFIRMATION));
  };

  if (!asking) {
    return (
      <section aria-labelledby="delete-heading" className="flex flex-col gap-2">
        <h2 id="delete-heading" className="text-lg font-semibold">
          Usunięcie konta
        </h2>
        <p>Trwale usuwa konto razem ze wszystkimi Twoimi danymi.</p>
        <div>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className={`${buttonClass} border border-red-800 text-red-900`}
          >
            Usuń konto i wszystkie dane
          </button>
        </div>
      </section>
    );
  }
  return (
    <form
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onSubmit={confirm}
      className="flex flex-col gap-3 rounded-lg border border-red-800 bg-red-50 p-4"
    >
      <h2 id="delete-account-title" className="text-lg font-semibold">
        Usunąć konto i wszystkie dane?
      </h2>
      <p>
        Przepisy, oceny, kolekcje, historia ugotowań i ustawienia zostaną usunięte, a Ty wylogowany.
        Tej operacji nie można cofnąć. Dane znikną też z kopii zapasowych na serwerze, najpóźniej po
        30 dniach.
      </p>
      <label className="flex flex-col gap-1">
        <span>Aby potwierdzić, wpisz słowo „{DELETE_CONFIRMATION}”</span>
        <input
          type="text"
          value={word}
          onChange={(event) => setWord(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="min-h-11 rounded-lg border border-neutral-400 bg-white px-3"
        />
      </label>
      {mismatch ? <p role="alert">{errorMessage('confirmation_mismatch')}</p> : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`${buttonClass} bg-red-800 text-white`}>
          Usuń konto
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className={`${buttonClass} border border-neutral-400`}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

/** Settings → "Moje dane": export of all data and deletion of the account (S16). */
export function MyDataScreen() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to="/ustawienia" className="inline-flex min-h-11 items-center font-medium underline">
          ← Ustawienia
        </Link>
        <h1 className="text-2xl font-semibold">Moje dane</h1>
      </div>
      <ExportData />
      <DeleteAccount />
    </section>
  );
}
