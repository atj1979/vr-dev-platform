const KEY = 'vrdev.ai.settings';

export const PROVIDER_DEFAULTS = {
  openai: {
    label: 'OpenAI-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
  },
};

const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
  model: PROVIDER_DEFAULTS.openai.model,
  apiKey: '',
  agentSocketUrl: '',
};

function read() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function write(settings) {
  if (typeof localStorage === 'undefined') return settings;
  localStorage.setItem(KEY, JSON.stringify(settings));
  return settings;
}

export function loadSettings() {
  return read();
}

export function publicSettings(settings = read()) {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasKey: Boolean(settings.apiKey),
    agentSocketUrl: settings.agentSocketUrl || '',
    connected: false,
  };
}

export function updateSettings(partial) {
  const current = read();
  const next = { ...current };
  if (partial.provider && PROVIDER_DEFAULTS[partial.provider] && partial.provider !== current.provider) {
    next.provider = partial.provider;
    const defaults = PROVIDER_DEFAULTS[partial.provider];
    const previous = PROVIDER_DEFAULTS[current.provider];
    if (!partial.baseUrl && (!current.baseUrl || current.baseUrl === previous?.baseUrl)) next.baseUrl = defaults.baseUrl;
    if (!partial.model && (!current.model || current.model === previous?.model)) next.model = defaults.model;
  }
  if (typeof partial.baseUrl === 'string' && partial.baseUrl.trim()) next.baseUrl = partial.baseUrl.trim();
  if (typeof partial.model === 'string' && partial.model.trim()) next.model = partial.model.trim();
  if (typeof partial.agentSocketUrl === 'string') next.agentSocketUrl = partial.agentSocketUrl.trim();
  if (typeof partial.apiKey === 'string' && partial.apiKey) next.apiKey = partial.apiKey;
  if (partial.clearKey) next.apiKey = '';
  write(next);
  return publicSettings(next);
}

export function secretSettings() {
  return read();
}
