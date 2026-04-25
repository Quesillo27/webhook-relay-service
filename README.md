# Webhook Relay Service

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white) ![Express](https://img.shields.io/badge/Express-4-000000?logo=express) ![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite) ![tests](https://img.shields.io/badge/tests-42%20passing-brightgreen) ![License](https://img.shields.io/badge/license-MIT-green)

Servicio que recibe webhooks entrantes y los retransmite a múltiples destinos en paralelo, con reintentos automáticos y log completo de cada entrega. Útil para desarrollo, debugging y producción.

## Instalación en 3 comandos

```bash
git clone https://github.com/Quesillo27/webhook-relay-service
cd webhook-relay-service
npm install
```

## Uso

```bash
npm start   # inicia el servicio en puerto 4500
npm run dev # modo desarrollo con hot-reload (nodemon)
npm test    # corre los 40 tests
```

## Ejemplo

```bash
# 1. Crear una ruta de relay
curl -X POST http://localhost:4500/api/routes \
  -H "Content-Type: application/json" \
  -d '{"name": "Mi App", "path": "/my-app"}'
# → {"success":true,"data":{"id":1,"name":"Mi App","path":"/my-app"}}

# 2. Agregar un destino
curl -X POST http://localhost:4500/api/routes/1/destinations \
  -H "Content-Type: application/json" \
  -d '{"url": "https://my-service.example.com/webhook"}'
# → {"success":true,"data":{"id":1,"route_id":1,"url":"https://my-service.example.com/webhook","active":1}}

# 3. Enviar un webhook a la ruta
curl -X POST http://localhost:4500/hooks/my-app \
  -H "Content-Type: application/json" \
  -d '{"event": "order.created", "id": "ord_123"}'
# → {"success":true,"data":{"event_id":1,"delivered":1,"total_destinations":1}}
```

## API

### Rutas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/api/routes` | Listar todas las rutas con sus destinos |
| `GET`  | `/api/routes/:id` | Obtener ruta individual con destinos |
| `POST` | `/api/routes` | Crear ruta (`name`, `path` requeridos) |
| `PATCH`| `/api/routes/:id` | Actualizar nombre y/o descripción |
| `DELETE` | `/api/routes/:id` | Eliminar ruta (cascada sobre destinations/events) |
| `GET`  | `/api/stats` | Stats globales + desglose por ruta |

### Destinos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/routes/:id/destinations` | Agregar destino (`url` requerida, solo http/https) |
| `GET`  | `/api/destinations/:id` | Obtener destino individual |
| `PATCH`| `/api/destinations/:id` | Actualizar URL y/o headers del destino |
| `DELETE` | `/api/destinations/:id` | Eliminar destino |
| `PATCH` | `/api/destinations/:id/toggle` | Activar/desactivar destino |

### Eventos & Logs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET`  | `/api/routes/:id/events` | Eventos de una ruta (paginados: `limit`, `offset`) |
| `GET`  | `/api/events/:id` | Evento individual con todos sus deliveries |
| `POST` | `/api/events/:id/retry` | Reenviar manualmente un evento fallido |

### Recibir webhooks

```
ANY /hooks/<path>
```

Envía el webhook al path de la ruta creada previamente. Acepta cualquier método HTTP y body JSON.

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `4500` | Puerto del servidor |
| `DB_PATH` | `./relay.db` | Ruta al archivo SQLite |
| `API_KEY` | `""` | API key (vacío = sin autenticación) |
| `MAX_RETRIES` | `3` | Intentos máximos por destino |
| `RETRY_DELAY_MS` | `2000` | Delay base entre reintentos (exponencial) |
| `REQUEST_TIMEOUT_MS` | `10000` | Timeout por request a destino |
| `LOG_LEVEL` | `info` | Nivel de log (debug, info, warn, error) |
| `BODY_LIMIT` | `1mb` | Tamaño máximo del body recibido |

## Características

- **Fan-out en paralelo**: retransmite a todos los destinos al mismo tiempo
- **Reintentos con backoff exponencial**: `delay × attempt` para no saturar destinos caídos
- **Log completo**: cada intento registrado en SQLite con status code, duración y errores
- **Toggle por destino**: activa/desactiva destinos sin eliminarlos
- **Retry manual**: reenvía un evento específico con `POST /api/events/:id/retry`
- **Stats por ruta**: `GET /api/stats` incluye desglose de eventos y deliveries por ruta
- **Validación estricta**: URLs solo http/https, paths no reservados, `headers` debe ser un objeto JSON
- **Sin dependencias externas**: solo Express + better-sqlite3
- **Docker-ready**: Dockerfile incluido con healthcheck
- **Logger estructurado**: JSON con nivel (debug/info/warn/error), controlado por `LOG_LEVEL`

## Docker

```bash
docker build -t webhook-relay .
docker run -p 4500:4500 -v $(pwd)/data:/app/data \
  -e DB_PATH=/app/data/relay.db \
  -e API_KEY=mysecretkey \
  webhook-relay
```

## Estructura del proyecto

```
src/
  config.js              # constantes y configuración
  logger.js              # logger estructurado JSON
  db/index.js            # conexión SQLite + migraciones
  middleware/
    auth.js              # validación API key
    validate.js          # validación de body (routes, destinations)
  services/relay.js      # lógica de fan-out y reintentos
  routes/
    routes.js            # CRUD de rutas
    destinations.js      # agregar destino a ruta
    destinationActions.js # get/patch/delete/toggle destino
    events.js            # listar eventos, evento individual, retry
    stats.js             # estadísticas globales y por ruta
    webhooks.js          # receptor de webhooks entrantes
server.js                # entry point
tests/
  db.test.js             # 10 tests: capa DB, migraciones, cascada
  api.test.js            # 32 tests: endpoints HTTP completos
```

## Roadmap

- **Dashboard web**: interfaz HTML para ver rutas, eventos y estado de deliveries en tiempo real
- **Filtros en eventos**: búsqueda por método, rango de fechas, estado de delivery
- **Transformaciones**: mapear/filtrar el payload antes de retransmitir (via config JSON)
- **Webhooks de salida con firma HMAC**: agregar header `X-Relay-Signature` para que destinos puedan verificar autenticidad
- **Soporte multi-tenant**: separar rutas por proyecto con API keys propias por tenant

## Contribuir

PRs bienvenidos. Corre `npm test` antes de enviar (42 tests, 100% pass).
