# NOVA en AWS

Aplicación publicada: [https://3.19.116.135/](https://3.19.116.135/). Verificada el 23 de noviembre de 2026 desde un cliente externo, con HTTPS válido y MongoDB conectado.

## Arquitectura

Una instancia EC2 Amazon Linux 2023 ejecuta Node 24 y Nginx. Express sirve Angular compilado y la API desde el mismo origen; el frontend mantiene `apiUrl = '/api'`. La base de datos continúa en MongoDB Atlas.

- Una Elastic IP proporciona una dirección estable y permite autorizar solamente esa IP `/32` en Atlas.
- Nginx atiende HTTPS en el puerto 443 y reenvía al proceso Node local en el puerto 3000.
- El puerto 80 sirve el desafío ACME y, después de activar TLS, redirige hacia HTTPS. Antes de la activación solo muestra mantenimiento.
- El grupo de seguridad no abre SSH ni el puerto 3000. La administración usa Systems Manager.
- El ZIP está en un bucket S3 privado. La instancia solo puede descargar el objeto de esa aplicación.
- `MONGODB_URI` y `JWT_SECRET` se guardan en dos parámetros SecureString Standard. El rol de la instancia limita la lectura a esos dos ARN.

No se crean balanceadores, NAT Gateway, bases de datos RDS ni dominios de pago.

## Archivos y preparación

Se necesita PowerShell 7, Node 24.15 o posterior dentro de la versión 24 y AWS CLI v2. El equipo que compila debe tener instaladas las dependencias del frontend y del backend con `npm ci` en cada carpeta.

| Archivo | Función |
| --- | --- |
| `scripts/package-aws.ps1` | Compila Angular y crea el ZIP mediante una lista explícita de archivos permitidos. Verifica el lock y descarta archivos privados. |
| `deploy/aws/infra.yaml` | Crea EC2, EBS cifrado, IP fija, grupo de seguridad, bucket privado y permisos de ejecución. |
| `scripts/configure-aws-secrets.ps1` | Envía las dos variables del `.env` local a Parameter Store sin imprimir sus valores ni incluirlos en argumentos de procesos. |
| `scripts/deploy-aws.ps1` | Valida la cuenta y la plantilla, crea la infraestructura, sube el ZIP y ejecuta la activación por SSM. |
| `deploy/aws/activate.sh` | Instala la aplicación, obtiene su entorno privado, comprueba MongoDB y configura HTTPS con renovación. |
| `scripts/smoke-aws.cjs` | Comprueba el sitio desplegado; opcionalmente prueba autenticación y CRUD con registros desechables que retira al terminar. |

Desde la raíz del repositorio:

```powershell
npm --prefix frontend ci
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend test -- --watch=false
./scripts/package-aws.ps1
```

El ZIP predeterminado queda en `outputs/nova-aws.zip`, carpeta excluida de Git. No se incluyen `node_modules` de Windows ni se compila Angular en la instancia pequeña.

## Acceso e infraestructura

Usa credenciales temporales de tu cuenta AWS. Para crear el perfil de despliegue:

```powershell
aws login --profile nova-deploy --region us-east-2
aws sts get-caller-identity --profile nova-deploy
```

Si utilizas `aws login --remote`, introduce el código de verificación únicamente en la herramienta AWS que inició el acceso. No lo publiques ni lo compartas en el chat.

Comprueba en facturación que el plan gratuito esté activo. La instancia, el disco y la IPv4 consumen créditos: este despliegue no garantiza alojamiento gratuito permanente. No cambies al plan de pago para ejecutar estos pasos.

Configura la ruta de tu AWS CLI y el ID de tu propia cuenta; el script rechaza una cuenta diferente:

```powershell
$awsExe = (Get-Command aws).Source
$accountId = 'ID_DE_TU_CUENTA'
./scripts/deploy-aws.ps1 -AwsExe $awsExe -ExpectedAccountId $accountId -Phase Validate
./scripts/deploy-aws.ps1 -AwsExe $awsExe -ExpectedAccountId $accountId -Phase Infrastructure
./scripts/deploy-aws.ps1 -AwsExe $awsExe -ExpectedAccountId $accountId -Phase Upload
```

La fase de infraestructura usa la VPC y una subnet públicas predeterminadas existentes. Exige una ruta activa a Internet y no crea una red adicional. Los identificadores y la IP quedan en `outputs/aws-deployment.json`; la URL todavía no estará activa durante esta fase.

## Variables privadas y Atlas

Revisa y autoriza que las variables privadas del backend se guarden en tu cuenta AWS antes de ejecutar:

```powershell
./scripts/configure-aws-secrets.ps1 -AwsExe $awsExe
```

Este paso crea o actualiza `/nova/prod/mongodb-uri` y `/nova/prod/jwt-secret`. Su contenido no se guarda en el ZIP, Git, UserData o la plantilla. Los archivos temporales locales tienen acceso restringido y se retiran al terminar. El archivo de entorno del servidor pertenece a root y tiene permisos `0600`.

En Atlas, agrega la Elastic IP que aparece en `outputs/aws-deployment.json` como entrada `/32` en Network Access. Conserva las entradas existentes que aún se necesiten. No es necesario autorizar `0.0.0.0/0`.

## HTTPS y activación

La activación solicita un certificado público para la IP a Let's Encrypt. Requiere aceptar su [acuerdo de suscripción](https://letsencrypt.org/repository/). La IP debe estar asociada y ser accesible por el puerto 80 para validar su control.

```powershell
./scripts/deploy-aws.ps1 -AwsExe $awsExe -ExpectedAccountId $accountId -Phase Activate -CertificateAgreementAccepted
```

La aplicación solo se publica después de comprobar el backend y la base de datos. Si falla la activación, el script intenta restaurar la versión y las variables anteriores. La primera activación fallida detiene la aplicación.

Los certificados para IP duran aproximadamente seis días. `nova-certbot-renew.timer` revisa su renovación cada doce horas y recarga Nginx al renovarlos. La comprobación HTTPS mantiene la verificación normal del certificado: no usa `--insecure`.

## Comprobación de la entrega

Abre la URL HTTPS desde un equipo externo y verifica:

1. La portada y las rutas directas `/login`, `/register`, `/profile` y `/reservations` cargan Angular.
2. `/api/ready` responde `200` con `{"status":"ready"}` y `/api/health` indica `database: connected`.
3. Las rutas de perfil y citas rechazan peticiones sin token con `401`.
4. Registro, inicio de sesión y CRUD funcionan con una cuenta de prueba. Las citas de otra cuenta no se pueden consultar, editar o eliminar.
5. HTTP redirige a HTTPS y el navegador confía en el certificado.
6. En SSM, `nova.service`, `nginx` y `nova-certbot-renew.timer` están activos. Comprueba también `systemctl list-timers nova-certbot-renew.timer`.

Las pruebas automatizadas del backend usan modelos simulados. La prueba del endpoint desplegado es la que confirma la conexión real con Atlas; ambas verificaciones son necesarias.

La comprobación externa de solo lectura se ejecuta con:

```powershell
node scripts/smoke-aws.cjs https://3.19.116.135
```

Para probar también autenticación, CRUD y aislamiento entre cuentas, agrega `--allow-test-data`. Ese modo requiere el `.env` local y acceso a la misma base de datos para retirar únicamente los usuarios y la cita desechables de esa ejecución. Nunca muestra contraseñas ni tokens. La verificación del despliegue inicial completó 49 comprobaciones y retiró sus registros de prueba.

## Mantenimiento

Para actualizar, compila un nuevo ZIP y repite Upload y Activate. La Elastic IP y la autorización de Atlas se conservan mientras mantengas esa infraestructura. Revisa el saldo de créditos y la fecha de vencimiento del plan.

Detener EC2 no elimina el almacenamiento ni libera una Elastic IP. Para retirar el despliegue, revisa los recursos del stack y elimina únicamente los artefactos de NOVA del bucket antes de eliminar el stack. Retira también su entrada `/32` de Atlas cuando deje de usarse. Este procedimiento no elimina datos de la base de datos.

Referencias: [Node en AL2023](https://docs.aws.amazon.com/linux/al2023/ug/nodejs.html), [Systems Manager sin SSH](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html), [certificados públicos para IP](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [Certbot y certificados cortos](https://letsencrypt.org/2026/03/11/shorter-certs-certbot), [planes gratuitos de AWS](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html).
