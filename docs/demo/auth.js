// Versão de navegador de server/auth.js, SOMENTE para a demonstração estática.
// Não há servidor: senhas e tokens não são protegidos criptograficamente aqui.
// Na hospedagem real (Node) vale server/auth.js, com scrypt e tokens assinados com HMAC.

export const hashPassword = (password) => `demo$${String(password)}`;
export const verifyPassword = (password, stored) => stored === `demo$${String(password)}`;

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export function signToken(payload) {
  return btoa(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
}

export function verifyToken(token) {
  try {
    const payload = JSON.parse(atob(token));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export const checkLoginRate = () => true;
export const registerLoginFailure = () => {};
export const clearLoginFailures = () => {};
