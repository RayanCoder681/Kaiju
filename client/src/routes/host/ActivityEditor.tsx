import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { useI18n } from '../../ui/I18nProvider.js';
import { Button, Input } from '../../ui/primitives.js';
import type { MessageKey } from '@kaiju/shared';

type Kind = 'quiz' | 'poll' | 'qa';
type QuizFormat = 'single' | 'multiple' | 'truefalse';
type PollFormat = 'single' | 'multiple' | 'text' | 'scale' | 'wordcloud';

/** Éditeur d'activité : quiz (3 formats), sondage (5 formats), Q&A. Crée puis attache. */
export function ActivityEditor({ sessionId, onAdded }: { sessionId: string; onAdded: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>('quiz');
  const [quizFormat, setQuizFormat] = useState<QuizFormat>('single');
  const [pollFormat, setPollFormat] = useState<PollFormat>('single');
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState(['', '']);
  const [correct, setCorrect] = useState<number[]>([0]);
  const [timer, setTimer] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usesChoices =
    (kind === 'quiz' && quizFormat !== 'truefalse') ||
    (kind === 'poll' && (pollFormat === 'single' || pollFormat === 'multiple'));
  const multiCorrect = kind === 'quiz' && quizFormat === 'multiple';

  const toggleCorrect = (i: number): void => {
    if (multiCorrect) setCorrect((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
    else setCorrect([i]);
  };

  const buildDraft = (): Record<string, unknown> | null => {
    const base = { title: (title || question).trim().slice(0, 140), contentLocale: 'fr' };
    if (kind === 'qa') {
      if (!base.title) return null;
      return { ...base, type: 'qa', allowAnonymous: true };
    }
    if (!question.trim()) return null;

    if (kind === 'quiz') {
      const effChoices =
        quizFormat === 'truefalse' ? [{ text: 'Vrai' }, { text: 'Faux' }] : choices.map((c) => c.trim()).filter(Boolean).map((text) => ({ text }));
      if (quizFormat !== 'truefalse' && effChoices.length < 2) return null;
      const effCorrect = quizFormat === 'truefalse' ? [correct[0] ?? 0] : correct.filter((i) => i < effChoices.length);
      if (effCorrect.length === 0) return null;
      return {
        ...base, type: 'quiz', format: quizFormat, question: question.trim(),
        choices: effChoices, correctIndexes: effCorrect, timerSec: timer,
        scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: multiCorrect ? 'linear' : 'none', wrongPenalty: 0 },
      };
    }
    // poll
    const pollChoices = usesChoices ? choices.map((c) => c.trim()).filter(Boolean).map((text) => ({ text })) : [];
    return {
      ...base, type: 'poll', format: pollFormat, question: question.trim(),
      choices: pollChoices, timerSec: timer, resultVisibility: 'immediate',
    };
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const draft = buildDraft();
    if (!draft) {
      setError('Complétez les champs requis (titre/question et choix).');
      return;
    }
    setBusy(true);
    try {
      const lib = await api.post<{ activity: { id: string } }>('/api/activities', draft);
      await api.post(`/api/sessions/${sessionId}/activities`, { libraryId: lib.activity.id });
      setTitle('');
      setQuestion('');
      setChoices(['', '']);
      setCorrect([0]);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? t(err.errorKey as MessageKey) : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
      <p className="font-mono text-xs uppercase tracking-wider text-brand">Ajouter une activité</p>

      <div className="flex gap-2">
        {(['quiz', 'poll', 'qa'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md border px-3 py-1.5 text-sm ${kind === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted'}`}
          >
            {k === 'quiz' ? 'Quiz' : k === 'poll' ? 'Sondage' : 'Q&A'}
          </button>
        ))}
      </div>

      {kind === 'quiz' && (
        <select
          value={quizFormat}
          onChange={(e) => setQuizFormat(e.target.value as QuizFormat)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
        >
          <option value="single">Choix unique</option>
          <option value="multiple">Choix multiples</option>
          <option value="truefalse">Vrai / Faux</option>
        </select>
      )}
      {kind === 'poll' && (
        <select
          value={pollFormat}
          onChange={(e) => setPollFormat(e.target.value as PollFormat)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
        >
          <option value="single">Choix unique</option>
          <option value="multiple">Choix multiples</option>
          <option value="text">Texte libre</option>
          <option value="scale">Échelle</option>
          <option value="wordcloud">Nuage de mots</option>
        </select>
      )}

      {kind === 'qa' ? (
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la session Q&A" maxLength={140} />
      ) : (
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" maxLength={1000} />
      )}

      {usesChoices && (
        <div className="space-y-2">
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {kind === 'quiz' && (
                <input
                  type={multiCorrect ? 'checkbox' : 'radio'}
                  name="correct"
                  checked={correct.includes(i)}
                  onChange={() => toggleCorrect(i)}
                  aria-label={`Marquer le choix ${i + 1} comme correct`}
                />
              )}
              <Input value={c} onChange={(e) => setChoices((cs) => cs.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={`Choix ${i + 1}`} maxLength={300} />
            </div>
          ))}
          {choices.length < 10 && (
            <button type="button" onClick={() => setChoices((cs) => [...cs, ''])} className="text-xs text-brand hover:underline">
              + Ajouter un choix
            </button>
          )}
        </div>
      )}

      {kind === 'quiz' && quizFormat === 'truefalse' && (
        <div className="flex gap-3 text-sm">
          {['Vrai', 'Faux'].map((label, i) => (
            <label key={i} className="flex items-center gap-2">
              <input type="radio" name="tf" checked={(correct[0] ?? 0) === i} onChange={() => setCorrect([i])} /> {label}
            </label>
          ))}
        </div>
      )}

      {kind !== 'qa' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">Minuteur (s)</span>
          <Input type="number" min={5} max={600} value={timer} onChange={(e) => setTimer(Number(e.target.value))} className="w-24" />
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? t('common.saving') : 'Ajouter à la session'}
      </Button>
    </form>
  );
}
