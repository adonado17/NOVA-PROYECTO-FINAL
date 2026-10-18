# NOVA Studio - backend de autenticación

Esta API de Node.js está integrada en el repositorio de NOVA Studio, el centro de bienestar y estética del frontend HTML/CSS. Se incorporó con asistencia de Codex a partir de un proyecto de práctica. Si la actividad académica exige escritura manual, el estudiante debe realizar y documentar su propia implementación; los commits de esta rama registran la integración actual.

## Qué hace

- Conecta Express a MongoDB Atlas mediante Mongoose.
- Registra usuarios con nombre, correo y contraseña.
- Valida los datos con `express-validator`.
- Guarda únicamente un hash de la contraseña con `bcryptjs`.
- Inicia sesión y entrega un token JWT con vigencia de 2 horas.
- Protege la ruta de perfil con el token.
- Devuelve errores claros sin exponer contraseñas ni detalles internos.

## Requisitos

- Node.js 24 LTS y npm.
- Un clúster gratuito M0 de MongoDB Atlas.
- Un usuario de base de datos y la IP actual autorizada en Atlas.
- Postman para mostrar los endpoints en el video.

## Preparación local

En PowerShell, dentro de esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env
```

Abre `.env` y reemplaza `MONGODB_URI` por la cadena de conexión de Atlas. Elige un `JWT_SECRET` aleatorio de al menos 32 caracteres. Si la contraseña del usuario de base de datos tiene caracteres especiales, codifícalos para una URL al ponerla en la cadena. Nunca compartas el archivo `.env` ni lo subas a GitHub.

Después ejecuta:

```powershell
npm start
```

La consola debe mostrar `NOVA API en http://localhost:3000`. La ruta `GET /api/health` debe devolver `"database": "connected"`.

## Endpoints

| Método | Ruta | Para qué sirve | Respuesta esperada |
| --- | --- | --- | --- |
| GET | `/api/health` | Confirma API y conexión a MongoDB | 200 |
| POST | `/api/auth/register` | Registra un usuario | 201 |
| POST | `/api/auth/login` | Autentica y entrega JWT | 200 |
| GET | `/api/auth/me` | Devuelve perfil con token Bearer | 200 |

Ejemplo de cuerpo JSON para registro:

```json
{
  "name": "Cliente NOVA",
  "email": "cliente.nova@example.com",
  "password": "Clave12345"
}
```

Para iniciar sesión se envían únicamente `email` y `password`. Para consultar el perfil se envía `Authorization: Bearer TU_TOKEN`.

El correo duplicado devuelve 409, los datos inválidos 422, la contraseña incorrecta o el token ausente 401.

## Pruebas con Postman

Importa `postman/NOVA-Studio.postman_collection.json`. La colección contiene ocho peticiones en orden. La petición de registro válido crea automáticamente un correo de prueba nuevo y guarda el token para la petición de perfil. Ejecuta cada petición para entender su respuesta o usa `Run collection` para probarlas juntas.

## Comprobación automática

```powershell
npm test
```

Las pruebas simulan las operaciones del modelo de usuario en memoria. No necesitan credenciales de Atlas ni descargan MongoDB. Cubren registro, validación, correo duplicado, inicio de sesión, JWT, perfil protegido y JSON inválido. La conexión real a Atlas se verifica por separado con `/api/health` al iniciar la API.

## Relación con el proyecto frontend

El sitio estático en la raíz de este repositorio presenta la marca, sus servicios y un formulario de contacto. Esta API permite crear y autenticar clientes, pero el frontend aún no llama a estas rutas. Un siguiente módulo podría gestionar servicios y reservas; esas funciones **todavía no están implementadas** aquí.

## Entrega de la actividad

La consigna pide un repositorio con ramas y commits reales, un video probando los endpoints en Postman y un único PDF con enlaces al video y al repositorio más un resumen ejecutivo. Este código y estos commits son la integración asistida hecha ahora; no representan una implementación escrita manualmente por el estudiante.
