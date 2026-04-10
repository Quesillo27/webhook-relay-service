# Webhook Relay Service

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white) ![Express](https://img.shields.io/badge/Express-4-000000?logo=express) ![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite) ![License](https://img.shields.io/badge/license-MIT-green)

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
```

## Ejemplo

```bash
# 1. Crear una ruta de relay
curl -X POST http://localhost:4500/api/routes \
  -H "Content-Type: application/json" \
  -d '{"name": "Mi App", "path": "/my-app"}'
# → {"id":1,"name":"Mi App","path":"/my-app"}

# 2. Agregar un destino
curl -X POST http://localhost:4500/api/routes/1/destinations \
  -H "Content-Type: application/json" \
  -d '{"url": "https://my-service.example.com/webhook"}'
# → {"id":1,"route_id":1,"url":"https://my-service.example.com/webhook"}

# 3. Enviar un webhook a la ruta
curl -X POST http://localhost:4500/hooks/my-app \
  -H "Content-Type: application/json" \
  -d '{"event": "order.created", "id": "ord_123"}'
# → {"ok":true,"event_id":1,"delivered":1,"total_destinations":1}
```

## API

### Rutas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/api/routes` | Listar todas las rutas |
| `POST` | `/api/routes` | Crear ruta (`name`, `path` requeridos) |
| `DELETE` | `/api/routes/:id` | Eliminar ruta (cascada sobre destinations/events) |
| `GET`  | `/api/stats` | Stats globales (eventos, deliveries, success rate) |

### Destinos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/routes/:id/destinations` | Agregar destino (`url` requerida) |
| `DELETE` | `/api/destinations/:id` | Eliminar destino |
| `PATCH` | `/api/destinations/:id/toggle` | Activar/desactivar destino |

### Logs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET`  | `/api/routes/:id/events` | Ver eventos de una ruta (últimos 50) |

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

## Características

- **Fan-out en paralelo**: retransmite a todos los destinos al mismo tiempo
- **Reintentos con backoff exponencial**: `delay * attempt` para no saturar destinos caídos
- **Log completo**: cada intento registrado en SQLite con status code, duración y errores
- **Toggle por destino**: activa/desactiva destinos sin eliminarlos
- **Sin dependencias externas**: solo Express + better-sqlite3
- **Docker-ready**: Dockerfile incluido con healthcheck

## Docker

```bash
docker build -t webhook-relay .
docker run -p 4500:4500 -v $(pwd)/data:/app/data \
  -e DB_PATH=/app/data/relay.db \
  -e API_KEY=mysecretkey \
  webhook-relay
```

## Contribuir

PRs bienvenidos. Corre `npm test` antes de enviar.
