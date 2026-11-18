export interface RulesStats {
  rules: number;
  words: number;
  chars: number;
}

export function computeRulesStats(text: string): RulesStats {
  const normalized = (text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let activeRules = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().length > 0) {
      activeRules += 1;
    }
  }

  const trimmed = normalized.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  return {
    rules: activeRules,
    words,
    chars: normalized.length,
  };
}

export function formatRulesLabel(count: number): string {
  return count === 1 ? '1 regra' : `${count} regras`;
}

export function formatWordsLabel(count: number): string {
  return count === 1 ? '1 palavra' : `${count} palavras`;
}

export function formatCharsLabel(count: number): string {
  return count === 1 ? '1 caractere registrado' : `${count} caracteres registrados`;
}
