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

function validateDestinationBody(req, res, next) {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'url es requerida' });
  }
  let parsed;
  try { parsed = new URL(url); } catch {
    return res.status(400).json({ success: false, error: 'url inválida' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ success: false, error: 'url debe usar protocolo http o https' });
  }
  next();
}

module.exports = { validateRouteBody, validateDestinationBody };
