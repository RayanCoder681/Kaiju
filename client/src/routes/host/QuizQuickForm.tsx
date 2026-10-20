import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { useI18n } from '../../ui/I18nProvider.js';
import { Button, Input } from '../../ui/primitives.js';
import type { MessageKey } from '@kaiju/shared';

/** Ajout rapide d'un quiz à choix unique (création bibliothèque + attachement snapshot). */
export function QuizQuickForm({ sessionId, onAdded }: { sessionId: string; onAdded: () => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState(['', '']);
  const [correct, setCorrect] = useState(0);
  const [timer, setTimer] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setChoice = (i: number, v: string): void =>
    setChoices((cs) => cs.map((c, idx) => (idx === i ? v : c)));

  const addChoice = (): void => setChoices((cs) => (cs.length < 10 ? [...cs, ''] : cs));

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const cleaned = choices.map((c) => c.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2 || correct >= cleaned.length) {
      setError('Renseignez une question et au moins deux choix valides.');
      return;
    }
    setBusy(true);
    try {
      const draft = {
        type: 'quiz' as const,
        title: question.trim().slice(0, 80),
        format: 'single' as const,
        question: question.trim(),
        choices: cleaned.map((text) => ({ text })),
        correctIndexes: [correct],
        timerSec: timer,
        scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: 'none', wrongPenalty: 0 },
        contentLocale: 'fr' as const,
      };
      const lib = await api.post<{ activity: { id: string } }>('/api/activities', draft);
      await api.post(`/api/sessions/${sessionId}/activities`, { libraryId: lib.activity.id });
      setQuestion('');
      setChoices(['', '']);
      setCorrect(0);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? t(err.errorKey as MessageKey) : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
      <p className="font-mono text-xs uppercase tracking-wider text-brand">Ajouter un quiz</p>
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" maxLength={1000} />
      <div className="space-y-2">
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              checked={correct === i}
              onChange={() => setCorrect(i)}
              aria-label={`Marquer le choix ${i + 1} comme correct`}
              className="accent-[var(--kj-color-brand)]"
            />
            <Input value={c} onChange={(e) => setChoice(i, e.target.value)} placeholder={`Choix ${i + 1}`} maxLength={300} />
          </div>
        ))}
        {choices.length < 10 && (
          <button type="button" onClick={addChoice} className="text-xs text-brand hover:underline">
            + Ajouter un choix
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-xs uppercase tracking-wider text-muted">Minuteur (s)</span>
        <Input
          type="number"
          min={5}
          max={600}
          value={timer}
          onChange={(e) => setTimer(Number(e.target.value))}
          className="w-24"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? t('common.saving') : 'Ajouter à la session'}
      </Button>
    </form>
  );
}
