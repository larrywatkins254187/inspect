'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconX } from '../icons';

export interface Citation {
  factId: number;
  broker: string;
  href: string;
  sourceUrl: string;
  label: string;
}
export type AnswerPart =
  | { kind: 'verified'; text: string; citations: Citation[] }
  | { kind: 'general'; text: string }
  | { kind: 'no_data' };
interface Turn {
  question: string;
  parts: AnswerPart[];
}

const MESSAGES: Record<string, string> = {
  INVALID: 'That question could not be accepted. Keep it under 500 characters and try again.',
  TURNSTILE_FAILED: 'Verification failed or expired. Please verify again.',
  RATE_LIMITED: 'Too many questions from this connection in the last hour. Please try again later.',
  CHAT_RESTING: 'Ask is resting after today’s question limit. Please try again tomorrow.',
  UNAVAILABLE: 'Ask could not answer right now. Your question is kept below — try again shortly.',
  NETWORK: 'The request did not complete. Check your connection and try again.',
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

let turnstileLoading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        turnstileLoading = null;
        reject(new Error('load'));
      };
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
}

/** Ask ForexInspect: Turnstile loads only when the visitor asks; every submission needs a fresh token. */
export function AskPanel({ siteKey }: { siteKey: string }) {
  const id = useId();
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState<Turn[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const widgetBox = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const closeDialog = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => {
      setStatus('idle');
      setToken(null);
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      // Restore focus after the dialog closes (also covers Escape/cancel).
      requestAnimationFrame(() => opener.current?.focus());
    };
    d.addEventListener('close', onClose);
    return () => d.removeEventListener('close', onClose);
  }, []);

  const open = async () => {
    setError(null);
    if (!question.trim()) {
      setError('Enter a question first.');
      return;
    }
    dialog.current?.showModal();
    setStatus('verifying');
    try {
      await loadTurnstile();
      if (!widgetBox.current || !window.turnstile) throw new Error('load');
      widgetId.current = window.turnstile.render(widgetBox.current, {
        sitekey: siteKey,
        action: 'ask',
        callback: (t: string) => setToken(t),
        'expired-callback': () => setToken(null),
        'error-callback': () => setToken(null),
      });
    } catch {
      setError('The verification check could not load. Try again later.');
      closeDialog();
    }
  };

  const submit = async () => {
    if (!token) return;
    setStatus('sending');
    const history = thread.slice(-3).flatMap((t) => [
      { role: 'user' as const, text: t.question.slice(0, 1500) },
      {
        role: 'assistant' as const,
        text: t.parts
          .map((p) => (p.kind === 'no_data' ? 'No verified data.' : p.text))
          .join(' ')
          .slice(0, 1500),
      },
    ]);
    let code = 'NETWORK';
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), token, history: history.slice(-6) }),
      });
      const body = (await res.json().catch(() => null)) as
        { ok: true; parts: AnswerPart[] } | { ok: false; code: string } | null;
      if (body && body.ok) {
        setThread((t) => [...t, { question: question.trim(), parts: body.parts }].slice(-3));
        setQuestion('');
        setError(null);
        closeDialog();
        return;
      }
      code = body && !body.ok ? body.code : 'UNAVAILABLE';
    } catch {
      code = 'NETWORK';
    }
    setError(MESSAGES[code] ?? MESSAGES.UNAVAILABLE!);
    closeDialog();
  };

  return (
    <div className="ask card">
      <div className="field">
        <label htmlFor={`${id}-q`}>Ask about published broker evidence</label>
        <textarea
          id={`${id}-q`}
          className="input"
          rows={3}
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-err` : ''}`}
          aria-invalid={error ? true : undefined}
        />
        <p id={`${id}-hint`} className="hint">
          Answers cite published ForexInspect evidence or say plainly when we have none. No rankings,
          suitability judgements or personal advice. Questions and answers are kept for 30 days to prevent
          abuse — do not include personal details.
        </p>
        <p id={`${id}-count`} className="hint" aria-live="off">
          {question.length}/500 characters
        </p>
        {error ? (
          <p id={`${id}-err`} className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="row">
        <button ref={opener} type="button" className="btn btn-primary" onClick={open}>
          Ask
        </button>
        {thread.length ? (
          <button type="button" className="btn btn-ghost" onClick={() => setThread([])}>
            Clear conversation
          </button>
        ) : null}
      </div>

      <dialog ref={dialog} className="dialog" aria-labelledby={`${id}-dlg`}>
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id={`${id}-dlg`} style={{ margin: 0, fontSize: '1.25rem' }}>
              Quick verification
            </h2>
            <button type="button" className="btn btn-ghost icon-btn" onClick={closeDialog}>
              <IconX />
              <span className="visually-hidden">Cancel</span>
            </button>
          </div>
          <p className="small muted">
            Cloudflare Turnstile checks that a person is asking. It loads only now, when you ask.
          </p>
          <div ref={widgetBox} style={{ minHeight: 70 }} />
          <p className="small" aria-live="polite">
            {status === 'sending'
              ? 'Sending your question…'
              : token
                ? 'Verified. You can send your question.'
                : 'Waiting for verification…'}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={closeDialog}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={!token || status === 'sending'}
            >
              Send question
            </button>
          </div>
        </div>
      </dialog>

      {thread.length ? (
        <ol className="thread" aria-label="Recent answers">
          {thread.map((t, i) => (
            <li key={i} className="panel">
              <p style={{ fontWeight: 650 }}>{t.question}</p>
              {t.parts.map((p, j) =>
                p.kind === 'no_data' ? (
                  <p key={j} className="answer-part" data-kind="no_data">
                    We have no verified data on that.
                  </p>
                ) : p.kind === 'general' ? (
                  <div key={j} className="answer-part" data-kind="general">
                    <p className="small" style={{ fontWeight: 650, margin: 0 }}>
                      General explanation — not verified by ForexInspect
                    </p>
                    <p>{p.text}</p>
                  </div>
                ) : (
                  <div key={j} className="answer-part" data-kind="verified">
                    <p>{p.text}</p>
                    <ul className="chips" aria-label="Evidence">
                      {p.citations.map((c) => (
                        <li key={c.factId}>
                          <a className="chip" href={c.href}>
                            {c.broker}: {c.label}
                          </a>{' '}
                          <a className="small" href={c.sourceUrl} rel="noopener nofollow" target="_blank">
                            official source
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
