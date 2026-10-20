import { useEffect, useRef, useState } from 'react';
import { connectSocket, emitAck, newSubmissionId, type KaijuSocket } from '../../lib/socket.js';
import { useI18n } from '../../ui/I18nProvider.js';
import { Card, Button, Badge } from '../../ui/primitives.js';
import type { PublicActivityView, AggregateResults, QaItemView, MessageKey } from '@kaiju/shared';

interface Props {
  code: string;
  reconnectToken: string;
  pseudonym: string;
  sessionTitle: string;
}

export function ParticipantLive({ code, reconnectToken, pseudonym, sessionTitle }: Props) {
  const { t } = useI18n();
  const socketRef = useRef<KaijuSocket | null>(null);
  const [activity, setActivity] = useState<PublicActivityView | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [results, setResults] = useState<AggregateResults | null>(null);
  const [qa, setQa] = useState<QaItemView[]>([]);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    socket.on('connect', () => {
      void emitAck(socket, 'participant:hello', { code, reconnectToken });
    });
    socket.on('activity:changed', ({ activity: a }) => {
      setActivity(a);
      setResults(null);
      setSubmittedFor(null);
      setQa([]);
    });
    socket.on('activity:tick', ({ remainingMs }) => setRemaining(remainingMs));
    socket.on('results:update', (r) => setResults(r));
    socket.on('qa:update', ({ items }) => setQa(items));
    socket.on('notice', ({ messageKey }) => setNotice(t(messageKey as MessageKey)));
    socket.on('submission:ack', ({ accepted, reason }) => {
      if (!accepted && reason) setNotice(t(reason as MessageKey));
    });
    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, reconnectToken]);

  const submitQuiz = async (choiceIndex: number): Promise<void> => {
    if (!activity || !socketRef.current) return;
    setSubmittedFor(activity.id);
    const res = await emitAck<{ ok: boolean; errorKey?: string }>(
      socketRef.current,
      'participant:quiz:submit',
      { activityId: activity.id, selectedIndexes: [choiceIndex], clientSubmissionId: newSubmissionId() },
    );
    if (!res.ok) {
      setSubmittedFor(null);
      if (res.errorKey) setNotice(t(res.errorKey as MessageKey));
    }
  };

  const seconds = remaining !== null ? Math.ceil(remaining / 1000) : null;
  const running = activity?.state === 'running';
  const answered = submittedFor === activity?.id;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <Badge>{pseudonym}</Badge>
        {running && seconds !== null && (
          <span className={`font-mono text-lg font-bold ${seconds <= 5 ? 'text-danger' : 'text-fg'}`}>
            {seconds}s
          </span>
        )}
      </div>

      {notice && (
        <p className="mb-3 rounded-md bg-surface-elevated px-3 py-2 text-sm text-muted">{notice}</p>
      )}

      {!activity && (
        <div className="text-center">
          <h1 className="font-display text-xl font-bold tracking-tight">{sessionTitle}</h1>
          <p className="mt-2 text-muted">{t('join.waiting')}</p>
        </div>
      )}

      {activity && activity.type === 'quiz' && (
        <Card>
          <h2 className="mb-4 text-lg font-medium">{activity.question}</h2>
          {!running && <p className="mb-3 text-sm text-muted">{t(`activity.state.${activity.state}` as const)}</p>}
          <div className="space-y-2">
            {activity.choices?.map((c, i) => {
              const isCorrect = results?.correctIndexes?.includes(i);
              return (
                <button
                  key={i}
                  disabled={!running || answered}
                  onClick={() => submitQuiz(i)}
                  className={`w-full rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                    isCorrect
                      ? 'border-success bg-brand-soft text-fg'
                      : 'border-border bg-bg hover:border-brand'
                  }`}
                >
                  {c.text}
                </button>
              );
            })}
          </div>
          {answered && !results && <p className="mt-3 text-sm text-success">Réponse enregistrée.</p>}
          {results?.explanation && (
            <p className="mt-4 rounded-md bg-surface-elevated p-3 text-sm text-muted">
              {results.explanation}
            </p>
          )}
        </Card>
      )}

      {activity && activity.type === 'qa' && (
        <QaPanel
          items={qa}
          onSubmit={(text, anonymous) =>
            socketRef.current &&
            emitAck(socketRef.current, 'participant:qa:submit', {
              activityId: activity.id,
              text,
              anonymous,
              clientSubmissionId: newSubmissionId(),
            })
          }
          onVote={(questionId) =>
            socketRef.current &&
            emitAck(socketRef.current, 'participant:qa:vote', {
              questionId,
              clientSubmissionId: newSubmissionId(),
            })
          }
        />
      )}
    </div>
  );
}

function QaPanel({
  items,
  onSubmit,
  onVote,
}: {
  items: QaItemView[];
  onSubmit: (text: string, anonymous: boolean) => void;
  onVote: (questionId: string) => void;
}) {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  return (
    <Card>
      <h2 className="mb-3 font-medium">Questions</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            onSubmit(text.trim(), anon);
            setText('');
          }
        }}
        className="mb-4 space-y-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Posez votre question…"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg outline-none focus:border-brand"
          rows={2}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Anonyme
          </label>
          <Button type="submit">Envoyer</Button>
        </div>
      </form>
      <ul className="space-y-2">
        {items.map((q) => (
          <li key={q.id} className="flex items-start justify-between gap-2 rounded-md bg-surface-elevated px-3 py-2">
            <span className="text-sm">
              {q.text}
              {q.author && <span className="ml-2 text-xs text-muted">— {q.author}</span>}
            </span>
            <button onClick={() => onVote(q.id)} className="shrink-0 font-mono text-xs text-brand">
              ▲ {q.votes}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
