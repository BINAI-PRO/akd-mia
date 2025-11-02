# Stripe Setup Guide

## Credenciales necesarias

- **Stripe Secret Key** (`sk_live_xxx` o `sk_test_xxx`) -> `STRIPE_SECRET_KEY`
- **Stripe Publishable Key** (`pk_live_xxx` o `pk_test_xxx`) -> `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Webhook Signing Secret** (`whsec_xxx`) del endpoint configurado en Developers -> Webhooks -> `STRIPE_WEBHOOK_SECRET`

Opcional por entorno:

- `STRIPE_CHECKOUT_SUCCESS_URL` (debe contener `{CHECKOUT_SESSION_ID}` o se agregara como query param)
- `STRIPE_CHECKOUT_CANCEL_URL`

## Variables de entorno

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CHECKOUT_SUCCESS_URL=https://admin.midominio.com/pagos/exito?session_id={CHECKOUT_SESSION_ID}
STRIPE_CHECKOUT_CANCEL_URL=https://admin.midominio.com/pagos/cancelado
```

Configura estas claves en `.env.local` y en el proveedor de despliegue.

## Webhook en Stripe

1. En Stripe ve a Developers -> Webhooks.
2. Crea un endpoint apuntando a `POST /api/payments/stripe/webhook`.
   - En local usa `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`.
3. Habilita al menos el evento `checkout.session.completed`.
4. Copia el `Signing secret` y guardalo en `STRIPE_WEBHOOK_SECRET`.

## Flujo implementado

1. El admin llama `POST /api/payments/stripe/checkout` con `{ clientId, planTypeId, modality, ... }`.
2. El backend valida membresia/plan y genera un Checkout Session de Stripe.
3. Stripe redirige a la URL de exito o cancelacion.
4. Cuando el pago termina, Stripe envia `checkout.session.completed` al webhook.
5. El webhook vuelve a validar, crea `plan_purchases`, genera reservas para planes fijos y registra el pago con `provider_ref = session.id`.

## Pruebas locales

1. Usa claves de prueba (`sk_test`, `pk_test`) en `.env.local`.
2. Ejecuta `npm run dev:admin`.
3. En otra terminal: `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`.
4. Completa un checkout con tarjeta de prueba (4242 4242 4242 4242).

## Manejo de errores

- Validaciones de negocio (membresia vencida, datos faltantes) responden 4xx y no reintentan en Stripe.
- Errores de infraestructura responden 500 para que Stripe reprograme el webhook.
- Pagos duplicados se ignoran reutilizando `provider_ref = session.id`.

## Siguientes pasos recomendados

1. Mostrar en la UI los estados de pago usando `session_id`.
2. Guardar `stripe_customer_id` por cliente para reusar metodos de pago.
3. Agregar verificaciones adicionales (comparar `amount_total` con datos internos, registrar auditoria, etc.).
