# Catálogo de reservas

Catálogo en línea de productos de belleza importados. Tus clientas ven lo que hay, reservan sus piezas o hacen un encargo, y el pedido llega a tu hoja de Google. No hay pagos en línea: tú las contactas por WhatsApp para confirmar la entrega y el pago.

- Catálogo: https://bensilkan.github.io/Cat-logo/
- Hoja de pedidos: https://docs.google.com/spreadsheets/d/1EPXdTO_qclR6dqlXj4EKwP5cwef0cuolgH4Yd2hHBC4/edit

## Cómo funciona

- **Productos** (en la hoja) guarda lo que vendes y cuántas unidades pusiste a la venta (`existencias`).
- El catálogo muestra lo **disponible**: existencias menos las reservas de pedidos que no estén Cancelados. Se actualiza solo cada 20 segundos.
- Si no hay unidades, la clienta puede hacer un **encargo** (no descuenta existencias; lo pides en el próximo envío).
- Cada pedido aparece en **Pedidos** con su estado (Pendiente, Confirmado, Entregado o Cancelado). Para anular uno, cámbialo a **Cancelado**; nunca borres filas.

## Configuración inicial y tareas del día a día

Todo está explicado paso a paso en [docs/GUIA-APPS-SCRIPT.md](docs/GUIA-APPS-SCRIPT.md): conectar la hoja, reponer mercadería, agregar productos, cancelar pedidos.

## Conectar el sitio (`js/config.js`)

- `API_URL`: la URL de la aplicación web de Apps Script (termina en `/exec`). Vacía = modo demostración, los pedidos no se registran.
- `STORE_WHATSAPP`: el WhatsApp de la tienda en dígitos internacionales, por ejemplo `'50370000000'`. Con él aparece un enlace de contacto en el pie y en el aviso de "sin confirmación". Vacío = sin enlace.

## Fotos

Las fotos provienen de las fichas de los vendedores originales. Puedes reemplazarlas por las tuyas: guarda tu imagen en `img/products/` con el mismo nombre de archivo (`<sku>.webp`). Si un producto no tiene foto, se muestra un recuadro con el nombre de la marca.

## Para desarrolladores

- `npm test`: pruebas unitarias (lógica de pedidos y Apps Script).
- `npm run smoke`: pruebas de navegador con Playwright (usa el Playwright global; no hace falta instalarlo).
- En `localhost` se puede abrir `?mock=1` para probar con datos locales sin API.
- Estructura: `index.html`, `css/`, `js/` (sitio estático), `apps-script/` (`logic.js`, `Code.gs`, `Seed.gs`), `docs/`.
