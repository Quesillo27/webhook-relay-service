'use strict';

function validateRouteBody(req, res, next) {
  const { name, path: routePath } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'name es requerido' });
  }
  if (name.length > 100) {
    return res.status(400).json({ success: false, error: 'name no puede superar 100 caracteres' });
  }
  if (!routePath || typeof routePath !== 'string') {
    return res.status(400).json({ success: false, error: 'path es requerido' });
  }
  if (!routePath.startsWith('/')) {
    return res.status(400).json({ success: false, error: "path debe comenzar con '/'" });
  }
  if (/^\/api(\/|$)/.test(routePath) || routePath === '/health' || /^\/hooks(\/|$)/.test(routePath)) {
    return res.status(400).json({ success: false, error: 'path reservado' });
  }
  next();
}

function validateHeaders(headers) {
  if (headers === undefined) return null;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return 'headers debe ser un objeto JSON';
  }
  return null;
}

function validateUrl(url, required) {
  if (url === undefined || url === null || url === '') {
    return required ? 'url es requerida' : null;
  }
  if (typeof url !== 'string') {
    return 'url inválida';
  }
  let parsed;
  try { parsed = new URL(url); } catch {
    return 'url inválida';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'url debe usar protocolo http o https';
  }
  return null;
}

function validateDestinationCreateBody(req, res, next) {
  const urlError = validateUrl(req.body.url, true);
  if (urlError) {
    return res.status(400).json({ success: false, error: urlError });
  }

  const headersError = validateHeaders(req.body.headers);
  if (headersError) {
    return res.status(400).json({ success: false, error: headersError });
  }

  next();
}

function validateDestinationUpdateBody(req, res, next) {
  if (req.body.url === undefined && req.body.headers === undefined) {
    return res.status(400).json({ success: false, error: 'Se requiere al menos url o headers' });
  }

  const urlError = validateUrl(req.body.url, false);
  if (urlError) {
    return res.status(400).json({ success: false, error: urlError });
  }

  const headersError = validateHeaders(req.body.headers);
  if (headersError) {
    return res.status(400).json({ success: false, error: headersError });
  }

  next();
}

module.exports = {
  validateRouteBody,
  validateDestinationCreateBody,
  validateDestinationUpdateBody,
};
