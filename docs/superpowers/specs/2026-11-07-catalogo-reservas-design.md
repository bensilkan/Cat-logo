# Catálogo de belleza con reservas — Diseño

Fecha: 2026-11-07
Estado: aprobado

## 1. Objetivo

Un catálogo web, abierto desde un enlace, donde los clientes ven productos de
maquillaje importado de forma elegante, los agregan a un carrito y "compran".
No hay pago: cada pedido es una **reserva** de existencias reales, o un
**encargo** para envíos futuros cuando el producto está agotado. Los pedidos se
registran en una hoja de Google y el inventario disponible se actualiza en el
catálogo casi en tiempo real.

Criterios de éxito:

- Nadie puede reservar más unidades de las que existen, ni siquiera si dos
  personas confirman a la vez.
- Un producto agotado sigue visible, marcado "Agotado", con la opción de encargar.
- La dueña ve cada pedido en su hoja de Google con los datos de contacto del cliente.
- Al cancelar un pedido en la hoja, sus unidades vuelven solas al catálogo.
- El aspecto es premium: elegante, serio, con fotos limpias y bien recortadas.
  Funciona impecable en celular.

## 2. Arquitectura

```
[Cliente: navegador]
   │  GitHub Pages (HTML/CSS/JS estático, sin framework)
   │  - GET catálogo + disponibles (cada ~20 s y antes de confirmar)
   │  - POST pedido
   ▼
[Google Apps Script — Web App] ──► [Google Sheet "Catálogo — Pedidos"]
   - LockService: un pedido a la vez        pestañas: Productos, Pedidos, Líneas
   - valida existencias, escribe filas
```

- **Hosting:** GitHub Pages desde `bensilkan/cat-logo` (repositorio público).
  URL esperada: `https://bensilkan.github.io/cat-logo/`.
- **Base de datos:** una hoja de Google en el Drive de la usuaria, creada con
  el conector de Google Drive.
- **API:** un Apps Script vinculado a la hoja y publicado como aplicación web
  ("Ejecutar como: yo", "Acceso: cualquier persona"). La usuaria lo publica una
  vez siguiendo una guía paso a paso; luego pega la URL resultante en
  `config.js`, o me la pasa a mí.
- **"Tiempo real":** Sheets no envía cambios por su cuenta, así que el
  catálogo consulta el inventario cada 20 s, al volver a la pestaña y justo
  antes de confirmar. El servidor vuelve a validar las existencias al recibir
  el pedido, que es la verdad final.

## 3. Modelo de datos (Google Sheet)

### Pestaña `Productos` — una fila por variante vendible (SKU)

| Columna | Ejemplo | Notas |
|---|---|---|
| sku | `nooni-appleberry` | id único de la variante |
| producto_id | `nooni-lip-oil` | agrupa variantes en una sola tarjeta |
| marca | nooni | |
| nombre | Apple Seed Lip Oil | |
| variante | Appleberry | vacío si no hay variantes |
| categoria | Labios | Rostro / Cejas y pestañas / Ojos / Labios |
| precio | 12.50 | USD |
| existencias | 1 | stock físico total; la usuaria la edita al llegar mercadería |
| desc_atractiva | … | del PDF |
| virtud | … | del PDF |
| tecnica | … | del PDF |
| imagen | `img/products/nooni-appleberry.webp` | ruta en el repo |
| visible | TRUE | para ocultar sin borrar |

Los precios y existencias se leen siempre de la hoja; el sitio no los fija en el código.

### Pestaña `Pedidos` — una fila por pedido (para leer de un vistazo)

`pedido_id` (p. ej. `R-251107-4821`), `fecha`, `tipo` (Reserva / Encargo /
Mixto), `nombre`, `whatsapp`, `direccion_zona`, `resumen` (texto legible:
"2× e.l.f. Brow Pencil — $16.00; …"), `total_reserva`, `total_encargo`,
`estado` (lista desplegable: Pendiente · Confirmado · Entregado · Cancelado),
`notas`.

### Pestaña `Líneas` — una fila por producto de cada pedido (la usa el script)

`pedido_id`, `sku`, `cantidad`, `tipo_linea` (Reserva / Encargo), `precio_unit`.

### Regla de disponibilidad

```
disponible(sku) = existencias(sku)
                − Σ cantidad de Líneas con tipo_linea = Reserva
                    cuyo pedido NO esté en estado "Cancelado"
```

Así, cancelar un pedido devuelve automáticamente sus unidades. Los encargos
nunca descuentan existencias.

## 4. API del Apps Script

- `GET ?action=catalog` → `{ products: [...], updatedAt }`. Cada SKU incluye su
  `disponible` y todos sus datos de presentación.
- `POST` (cuerpo `text/plain` con JSON, para evitar la verificación previa de
  CORS) con `{ cliente: {nombre, whatsapp, direccion_zona}, items: [{sku, cantidad, tipo}] }`:
  1. Toma `LockService.getScriptLock()` (espera máx. 10 s).
  2. Valida los datos del cliente y los SKU, y que la cantidad sea un entero ≥ 1.
     Encargo: máximo 10 por SKU.
  3. Recalcula `disponible` para cada línea de Reserva. Si alguna excede lo
     disponible, **no escribe nada** y responde
     `{ ok:false, error:"sin_existencias", conflictos:[{sku, pedido, disponible}] }`.
  4. Si todo cuadra, escribe la fila en Pedidos y las filas en Líneas, libera
     el candado y responde `{ ok:true, pedido_id }`.
- La lógica pura (cálculo de disponibilidad y validación del pedido) vive en
  funciones sin dependencias de Google, para poder probarla en Node.

## 5. Catálogo de lanzamiento

| SKU / producto | Variantes | Exist. | Precio |
|---|---|---|---|
| e.l.f. Camo Liquid Bronzer & Contour | — | 1 | $14.00 |
| e.l.f. Camo Color Corrector (verde) | — | 1 | $9.50 |
| e.l.f. Instant Lift Brow Pencil, Neutral Brown | — (se vende por unidad) | 2 | $8.00 c/u |
| e.l.f. Clear Brow & Lash Mascara | — (se vende por unidad) | 2 | $8.00 c/u |
| wet n wild 16H Breakup Proof Skinny Liquid Eyeliner | — | 2 | $8.00 |
| wet n wild perfectpout Gel Lip Liner, 661D Lay Down the Mauves | — | 1 | $5.50 |
| wet n wild coloricon Lip Liner, 715 Plumberry | — | 1 | $3.50 |
| wet n wild Labial en barra, 813B Extra Cinnamon, Please | — | 1 | $6.00 |
| wet n wild perfectpout Rouge à Lèvres | — | 1 | $5.50 |
| wet n wild Labiales clásicos (tapa transparente) | Dorado/Marrón · Rojizo | 1 + 1 | $4.50 |
| Maybelline Lash Sensational Sky High, 801 Very Black | — | 1 | $16.00 |
| nooni Apple Seed Lip Oil, Applecherry (individual) | — | 1 | $12.50 |
| LANGMANNI Set de Labios Matte & Nude (4 piezas) | — | 1 | $14.00 |

Decisiones confirmadas:

- perfectpout a $5.50 aplica al labial Rouge à Lèvres y al delineador en gel 661D.
- nooni: solo hay 1 unidad, tono Applecherry, vendida suelta. Los otros tonos no
  se muestran.
- Brow Pencil y Clear Brow & Lash: los sets se venden como 2 unidades sueltas;
  los textos dicen "unidad" en vez de "set de 2".

## 6. Experiencia del cliente

1. **Portada:** nombre de la tienda, una frase corta y una imagen editorial.
   Debajo van los logos de las marcas como franja.
2. **Catálogo:** se puede filtrar por categoría (Todo · Rostro · Cejas y
   pestañas · Ojos · Labios) o por marca. Las tarjetas muestran foto, marca,
   nombre, precio, descripción atractiva y una insignia de disponibilidad:
   "Disponible", "Última unidad", "Quedan 2" o "Agotado".
3. **Detalle del producto** (ventana modal o panel): galería, descripción
   atractiva, virtud principal, ficha técnica, selector de tono si aplica,
   cantidad y botón.
4. **Selector de tono:** una sola tarjeta con muestras de color tipo
   *switch*. Al cambiar de tono cambian la foto, la disponibilidad y el botón.
5. **Botones:**
   - Con existencias: **"Reservar"**. La cantidad está limitada a lo disponible
     menos lo que ya está en el carrito.
   - Agotado: tarjeta atenuada con la etiqueta "Agotado" y el botón
     **"Encargar para el próximo envío"**.
6. **Carrito:** panel lateral con dos secciones, "Reservas" y "Encargos", con
   subtotales y un total. Se guarda en `localStorage`, así que sobrevive al
   cierre del navegador. Al recibir un inventario nuevo, si una reserva del
   carrito ya excede lo disponible, se muestra un aviso con la opción de
   "Pasar a encargo" o "Quitar".
7. **Confirmación:** formulario con nombre completo, WhatsApp (formato SV
   `+503 ____-____`, aunque acepta otros) y dirección o zona. Se envía el
   pedido y aparece una pantalla de "Pedido recibido" con el número, el
   resumen y una nota: "Te contactaremos por WhatsApp". Después se vacía el
   carrito.
8. **Conflicto al confirmar:** si el servidor responde `sin_existencias`, se
   muestran las líneas afectadas y se ofrece pasarlas a encargo con un clic y
   reenviar.
9. **Errores de red:** mensaje discreto y reintento. El carrito no se pierde.

## 7. Dirección visual

- **Paleta:** marfil cálido `#FAF6F1` de fondo, vino profundo `#6E2A3F` (del
  encabezado del PDF) para el color principal, dorado champán `#C9A96E` para
  acentos y líneas finas, y tinta `#2A1F22` para el texto.
- **Tipografía:** Cormorant Garamond para los títulos (serif editorial) y
  Manrope para la interfaz y los textos (sans limpia), desde Google Fonts.
- **Estilo:** mucho espacio en blanco, filetes dorados finos y fotos sobre
  fondo neutro uniforme, con la misma luz y la misma sombra suave en todas.
  Microanimaciones discretas: fundidos y elevación de tarjetas al pasar el
  cursor. Nada de colores chillones ni insignias tipo oferta.
- **Móvil primero:** 2 columnas en celular, 3–4 en escritorio y el carrito como
  hoja inferior en móvil.
- **Accesibilidad:** contraste AA, foco visible y textos alternativos en las fotos.

## 8. Imágenes

- **Fuente:** las fotos de producto que publican las tiendas que venden estos
  artículos (Ulta, Target, Walmart, Amazon, CVS y las tiendas oficiales de
  cada marca), y los logos oficiales de cada marca para la franja.
- **Proceso por foto:**
  1. Descargar la mejor resolución disponible.
  2. Recortar el fondo cuando no sea blanco limpio (eliminación automática de
     fondo y revisión visual).
  3. Componerla centrada sobre el lienzo de la marca, a tamaño uniforme
     (cuadrado de 1200 px) con sombra suave de contacto.
  4. Exportarla a WebP.
- Cada foto se revisa a ojo para confirmar que coincida con el tono y la
  presentación del PDF (por ejemplo, 661D Lay Down the Mauves o 801 Very
  Black).
- **Casos difíciles:** para los "labiales clásicos de tapa transparente" no
  hay una ficha exacta; se usa la foto más cercana de la línea correspondiente
  de wet n wild, y se avisa a la usuaria para que la cambie por una foto
  propia si lo desea.
- Todas las imágenes se guardan en el repositorio (`img/`) para que no dependan
  de enlaces externos.

## 9. Estructura del repositorio

```
index.html
css/styles.css
js/config.js        ← URL del Apps Script
js/api.js           ← fetch catálogo / enviar pedido, sondeo
js/cart.js          ← estado del carrito + localStorage (lógica pura testeable)
js/ui.js            ← render de tarjetas, modal, carrito, formulario
js/app.js           ← arranque
img/products/*.webp, img/brands/*
apps-script/Code.gs ← doGet/doPost + lógica de disponibilidad
apps-script/logic.js← funciones puras compartidas (probadas en Node)
data/products.seed.csv ← contenido inicial de la pestaña Productos
tests/              ← pruebas de lógica (node:test) y de humo con Playwright
docs/GUIA-APPS-SCRIPT.md ← pasos para publicar el script
```

## 10. Pruebas

- **Unitarias (node:test):**
  - cálculo de `disponible`, con pedidos cancelados y encargos;
  - validación de pedidos: cantidades, SKU inválidos, conflicto de
    existencias y tope de encargo;
  - reglas del carrito: tope por disponible, paso a encargo y persistencia.
- **De humo (Playwright, con API simulada):**
  - carga del catálogo;
  - cambio de tono;
  - agregar al carrito hasta el tope;
  - un producto agotado muestra "Encargar";
  - el flujo de confirmación;
  - el conflicto de existencias que ofrece pasar a encargo.
  - Capturas en móvil y escritorio para revisar el aspecto.
- **De extremo a extremo:** una vez publicado el Apps Script, un pedido de
  prueba real que luego se cancela, para comprobar que la unidad regresa.

## 11. Fuera de alcance

Pagos, cuentas de usuario, panel de administración aparte de la hoja,
notificaciones automáticas por WhatsApp o correo, y vencimiento automático de
reservas.

## 12. Entregables

1. Enlace del catálogo publicado en GitHub Pages.
2. Enlace de la hoja de Google donde caen los pedidos.
3. Guía corta para publicar el Apps Script (una sola vez).
