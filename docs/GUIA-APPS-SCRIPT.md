# Guía: conectar la hoja de Google con el catálogo

Esta guía te lleva paso a paso, sin necesidad de saber programar. Solo se hace
una vez (unos 10 minutos). Necesitas tu hoja de Google **"Catálogo — Pedidos"**
y los tres archivos de la carpeta `apps-script/` de este proyecto:
`logic.js`, `Seed.gs` y `Code.gs`.

## Parte 1. Pegar el código

1. Abre tu hoja de Google.
2. En el menú, entra a **Extensiones → Apps Script**. Se abre una pestaña nueva con un editor.
3. Verás un archivo llamado `Código.gs` (o `Code.gs`) con algo escrito. Bórrale todo el contenido y pega ahí el contenido completo de nuestro `Code.gs`.
4. Crea los otros dos archivos: haz clic en el **+** junto a "Archivos" → **Secuencia de comandos** y ponles estos nombres:
   - `logic` (Apps Script le agrega `.gs`). Pega el contenido de `logic.js`.
   - `Seed`. Pega el contenido de `Seed.gs`.
5. Haz clic en el icono del disquete (**Guardar proyecto**). Ahora debes tener tres archivos: `Code`, `logic` y `Seed`.

## Parte 2. Preparar la hoja (`setup`)

1. **Zona horaria (para que las fechas de los pedidos sean las de aquí).** En el editor de Apps Script, pulsa el engranaje de la izquierda (**Configuración del proyecto**), busca **Zona horaria** y elige **(GMT-06:00) Hora central - El Salvador** (`America/El_Salvador`). Luego, en la hoja de Google: **Archivo → Configuración → Zona horaria**, y elige la misma.
2. Abre el archivo **`Code`** en la lista de la izquierda (si tienes abierto `Seed`, el selector no mostrará `setup`).
3. Arriba, en el selector de funciones (junto a "Ejecutar"), elige **`setup`**.
4. Pulsa **Ejecutar**.
5. Google pedirá permiso. Pulsa **Revisar permisos** y elige tu cuenta.
6. Aparecerá un aviso: *"Google no ha verificado esta aplicación"*. Es normal: el script es tuyo y lo escribiste tú. Pulsa **Configuración avanzada** y luego **Ir a (nombre del proyecto) (no seguro)**.
7. Pulsa **Permitir**.
8. Cuando termine, vuelve a la hoja: verás las pestañas **Productos** (con los 14 productos cargados), **Pedidos** y **Líneas**, con los encabezados en vino y letras marfil. Si existía una hoja vacía llamada "Hoja 1", se elimina sola.

Si lo ejecutas otra vez no pasa nada malo: no duplica productos ni borra pedidos.

## Parte 3. Publicar como aplicación web

1. En el editor, arriba a la derecha: **Implementar → Nueva implementación**.
2. Junto a "Seleccionar tipo", pulsa el engranaje y elige **Aplicación web**.
3. Configura:
   - **Descripción:** `Catálogo v1`
   - **Ejecutar como:** **Yo**
   - **Quién tiene acceso:** **Cualquier persona** (no elijas «Cualquier persona con cuenta de Google» ni «Solo yo»: el catálogo dejaría de funcionar para tus clientes)
4. Pulsa **Implementar** (y **Autorizar** si lo pide).
5. Copia la **URL de la aplicación web** (termina en `/exec`).
6. Pruébala: pega la URL en el navegador y agrega `?action=catalog` al final. Debes ver un texto que empieza con `{"ok":true,"products":[...`.

## Parte 4. Conectar con el sitio

Envíame la URL, o pégala tú en el archivo `js/config.js` del proyecto, en `API_URL`. En ese mismo archivo, `STORE_WHATSAPP` es el número de WhatsApp de la tienda con código de país y sin signos (por ejemplo `'50370000000'`): con él, el catálogo muestra un enlace para escribirte.

## Actualizar el código después de un cambio

Si cambian los archivos de código, pega la versión nueva y luego:

1. **Implementar → Administrar implementaciones**.
2. Pulsa el lápiz (editar) de tu implementación.
3. En **Versión**, elige **Nueva versión**.
4. Pulsa **Implementar**. La URL sigue siendo la misma.

Si usas "Nueva implementación" en lugar de esto, obtendrás una URL distinta.

## Tareas del día a día (todas en la hoja)

**Ver los pedidos.** Pestaña **Pedidos**: cada fila es un pedido con el nombre, el WhatsApp, la zona y un resumen legible. La pestaña **Líneas** es de uso interno; no la edites.

**Cancelar un pedido.** En **Pedidos**, cambia la columna **estado** a **Cancelado** (hay una lista desplegable). Las unidades reservadas vuelven solas al catálogo.

**Cambiar el estado de un pedido.** Usa la misma lista: Pendiente, Confirmado, Entregado o Cancelado.

**Reponer mercadería.** La columna **existencias** es el total de unidades que has puesto a la venta desde el inicio. Cuando llegue mercadería, **suma lo nuevo al número que ya está**. No restes nada cuando vendes o entregas: el catálogo ya descuenta solo todos los pedidos que no estén Cancelados.
Ejemplo: en existencias dice 5 y llegan 3 más para vender; escribe **8**. Tengas o no pedidos pendientes, el número sigue siendo 8: el catálogo muestra 8 menos lo reservado.
Si entre lo que llega hay unidades para cubrir encargos, **no las sumes**: son de quien las encargó. Suma solo las que sobren para la venta.

**Anular un pedido o cambiar cantidades.** Para anular un pedido, cambia su estado a **Cancelado**. **Nunca borres filas** de **Pedidos** ni de **Líneas**: borrar una fila de Líneas libera existencias y puede causar sobreventa. Para cambiar la cantidad de un pedido que ya existe, cancela ese pedido y pide al cliente (o haz tú) uno nuevo.

**Agregar un producto nuevo.** En **Productos**, agrega una fila al final con un **sku** único (sin repetir, por ejemplo `elf-gloss-rosa`) y llena las demás columnas. La foto debe agregarse a la carpeta `img/products/` del proyecto con el nombre `<sku>.webp` (pídeselo a tu desarrollador). Si dejas **imagen** en blanco, o la foto no carga, el catálogo muestra un recuadro marfil con el nombre de la marca. Escribe los precios con punto decimal (`12.50`); la coma (`12,50`) también se entiende.

**Ocultar un producto.** En **Productos**, pon **FALSE** en la columna **visible**. Para mostrarlo otra vez, pon **TRUE**. No se borra nada.

**Cambiar un precio.** En **Productos**, edita la columna **precio** (solo el número, por ejemplo `12.50`). Los pedidos ya hechos conservan el precio con que se tomaron.

## Consejos y problemas comunes

- No cambies los nombres de las pestañas (`Productos`, `Pedidos`, `Líneas`) ni los encabezados de la fila 1. Puedes cambiar el orden de las columnas.
- Los cambios en la hoja se ven en el catálogo en unos 20 segundos.
- Si el catálogo dice que no puede cargar, revisa que el acceso de la implementación sea **Cualquier persona** y que la URL termine en `/exec`.
- No borres filas de **Pedidos** ni de **Líneas**; para anular un pedido usa el estado **Cancelado**.
