// Kaiju — parseur du format texte des quiz (module pur, sans dépendance).
// Format : un bloc par question, blocs séparés par une ou plusieurs lignes vides.
//   Ligne 1        : l'énoncé, avec un suffixe optionnel de durée : [30s] ou [30]
//   Lignes 2 à 5   : 2 à 4 réponses, exactement une marquée d'une étoile (*)
// Voir references/quiz-format.md pour la spécification complète.

export const LIMITS = Object.freeze({
  maxInputChars: 20000,
  maxQuestions: 100,
  minChoices: 2,
  maxChoices: 4,
  maxQuestionLength: 200,
  maxChoiceLength: 80,
  minTimeSec: 5,
  maxTimeSec: 240,
});

export const DEFAULT_TIME_SEC = 20;

const QUESTION_NUMBER = /^\s*(?:Q\s*)?\d{1,3}\s*[.):\]-]\s+/i;
const TIME_SUFFIX = /\s*\[\s*(\d{1,3})\s*s\s*\]\s*$/i; // [30s] — le « s » est obligatoire pour éviter a[2]
const BULLET = /^\s*(?:[-•–]\s+)/;
const LETTER_PREFIX = /^[A-Da-d][.)]\s+/;
const DIGIT_PREFIX = /^[1-4][.)]\s+/;

/**
 * @param {string} input   texte collé par l'animateur
 * @param {{defaultTimeSec?: number}} [options]
 * @returns {{questions: Array<{text: string, choices: string[], correctIndex: number, timeSec: number}>,
 *            errors: Array<{block: number, line: number, message: string}>}}
 * Le quiz n'est utilisable que si errors est vide (tout ou rien : l'animateur corrige puis recolle).
 */
export function parseQuiz(input, { defaultTimeSec = DEFAULT_TIME_SEC } = {}) {
  const errors = [];
  const questions = [];

  if (typeof input !== 'string') {
    return { questions, errors: [{ block: 0, line: 0, message: 'Le quiz doit être du texte.' }] };
  }
  if (input.length > LIMITS.maxInputChars) {
    return {
      questions,
      errors: [{ block: 0, line: 0, message: `Texte trop long (${input.length} caractères, maximum ${LIMITS.maxInputChars}).` }],
    };
  }

  const lines = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');

  // Découpage en blocs en conservant les numéros de ligne (1-based).
  const blocks = [];
  let current = null;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') {
      current = null;
      return;
    }
    if (!current) {
      current = [];
      blocks.push(current);
    }
    current.push({ text: line, lineNo: i + 1 });
  });

  if (blocks.length === 0) {
    return { questions, errors: [{ block: 0, line: 0, message: 'Aucune question trouvée.' }] };
  }
  if (blocks.length > LIMITS.maxQuestions) {
    errors.push({ block: 0, line: 0, message: `Trop de questions (${blocks.length}, maximum ${LIMITS.maxQuestions}).` });
  }

  blocks.forEach((block, b) => {
    const blockNo = b + 1;
    const err = (line, message) => errors.push({ block: blockNo, line, message });
    const [head, ...answerLines] = block;

    // Énoncé + durée optionnelle
    let text = head.text.replace(QUESTION_NUMBER, '');
    let timeSec = defaultTimeSec;
    const t = text.match(TIME_SUFFIX);
    if (t) {
      timeSec = Number(t[1]);
      text = text.replace(TIME_SUFFIX, '');
      if (timeSec < LIMITS.minTimeSec || timeSec > LIMITS.maxTimeSec) {
        err(head.lineNo, `Durée ${timeSec}s hors limites (${LIMITS.minTimeSec} à ${LIMITS.maxTimeSec}s).`);
      }
    }
    text = text.trim();
    if (text.startsWith('*')) err(head.lineNo, "La première ligne d'un bloc est l'énoncé : elle ne peut pas porter l'étoile.");
    if (text === '') err(head.lineNo, 'Énoncé vide.');
    if (text.length > LIMITS.maxQuestionLength) {
      err(head.lineNo, `Énoncé trop long (${text.length} caractères, maximum ${LIMITS.maxQuestionLength}).`);
    }

    // Réponses
    if (answerLines.length < LIMITS.minChoices || answerLines.length > LIMITS.maxChoices) {
      err(head.lineNo, `${answerLines.length} réponse(s) : il en faut entre ${LIMITS.minChoices} et ${LIMITS.maxChoices}.`);
    }

    let entries = answerLines.map(({ text: raw, lineNo }) => {
      let s = raw.replace(BULLET, '');
      let starred = false;
      let escaped = false;
      if (s.startsWith('\\*')) {
        s = s.slice(1); // étoile littérale échappée
        escaped = true;
      } else if (s.startsWith('*')) {
        starred = true;
        s = s.slice(1).trim();
      } else if (/\s\*$/.test(s) && !s.endsWith('\\*')) {
        starred = true;
        s = s.slice(0, -1).trim();
      }
      return { s, starred, escaped, lineNo };
    });

    // Préfixes A) B) ... ou 1) 2) ... retirés seulement s'ils sont présents sur toutes les réponses.
    for (const prefix of [LETTER_PREFIX, DIGIT_PREFIX]) {
      if (entries.length > 0 && entries.every((e) => prefix.test(e.s))) {
        entries = entries.map((e) => ({ ...e, s: e.s.replace(prefix, '') }));
      }
    }
    // Une étoile peut aussi suivre le préfixe : "B) *Yaoundé"
    entries = entries.map((e) => (!e.starred && !e.escaped && e.s.startsWith('*') ? { ...e, starred: true, s: e.s.slice(1).trim() } : e));

    const choices = entries.map((e) => e.s.trim());
    entries.forEach((e, i) => {
      if (choices[i] === '') err(e.lineNo, 'Réponse vide.');
      if (choices[i].length > LIMITS.maxChoiceLength) {
        err(e.lineNo, `Réponse trop longue (${choices[i].length} caractères, maximum ${LIMITS.maxChoiceLength}).`);
      }
    });

    const seen = new Map();
    choices.forEach((c, i) => {
      const key = c.toLocaleLowerCase('fr');
      if (key && seen.has(key)) err(entries[i].lineNo, `Réponse en double : « ${c} ».`);
      seen.set(key, i);
    });

    const starredIdx = entries.flatMap((e, i) => (e.starred ? [i] : []));
    if (starredIdx.length === 0) err(head.lineNo, 'Aucune bonne réponse marquée avec une étoile (*).');
    if (starredIdx.length > 1) err(entries[starredIdx[1]].lineNo, 'Une seule bonne réponse par question en V1.');

    questions.push({ text, choices, correctIndex: starredIdx[0] ?? -1, timeSec });
  });

  return errors.length ? { questions: [], errors } : { questions, errors };
}

/** Formate les erreurs pour l'affichage côté animateur. */
export function formatErrors(errors) {
  return errors
    .map((e) => (e.block ? `Question ${e.block} (ligne ${e.line}) : ${e.message}` : e.message))
    .join('\n');
}
