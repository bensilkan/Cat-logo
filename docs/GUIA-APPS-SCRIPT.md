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

1. Arriba, en el selector de funciones (junto a "Ejecutar"), elige **`setup`**.
2. Pulsa **Ejecutar**.
3. Google pedirá permiso. Pulsa **Revisar permisos** y elige tu cuenta.
4. Aparecerá un aviso: *"Google no ha verificado esta aplicación"*. Es normal: el script es tuyo y lo escribiste tú. Pulsa **Configuración avanzada** y luego **Ir a (nombre del proyecto) (no seguro)**.
5. Pulsa **Permitir**.
6. Cuando termine, vuelve a la hoja: verás las pestañas **Productos** (con los 14 productos cargados), **Pedidos** y **Líneas**, con los encabezados en vino y letras marfil.

Si lo ejecutas otra vez no pasa nada malo: no duplica productos ni borra pedidos.

## Parte 3. Publicar como aplicación web

1. En el editor, arriba a la derecha: **Implementar → Nueva implementación**.
2. Junto a "Seleccionar tipo", pulsa el engranaje y elige **Aplicación web**.
3. Configura:
   - **Descripción:** `Catálogo v1`
   - **Ejecutar como:** **Yo**
   - **Quién tiene acceso:** **Cualquier persona**
4. Pulsa **Implementar** (y **Autorizar** si lo pide).
5. Copia la **URL de la aplicación web** (termina en `/exec`).
6. Pruébala: pega la URL en el navegador y agrega `?action=catalog` al final. Debes ver un texto que empieza con `{"ok":true,"products":[...`.

## Parte 4. Conectar con el sitio

Envíame la URL, o pégala tú en el archivo `js/config.js` del proyecto, en el lugar indicado.

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

**Reponer mercadería.** En **Productos**, edita la columna **existencias** y escribe el total físico que tienes ahora (no solo lo nuevo). Ejemplo: había 1 y llegan 3 más, escribe 4. El catálogo descuenta por su cuenta las reservas activas.

**Ocultar un producto.** En **Productos**, pon **FALSE** en la columna **visible**. Para mostrarlo otra vez, pon **TRUE**. No se borra nada.

**Cambiar un precio.** En **Productos**, edita la columna **precio** (solo el número, por ejemplo `12.50`). Los pedidos ya hechos conservan el precio con que se tomaron.

## Consejos y problemas comunes

- No cambies los nombres de las pestañas (`Productos`, `Pedidos`, `Líneas`) ni los encabezados de la fila 1. Puedes cambiar el orden de las columnas.
- Los cambios en la hoja se ven en el catálogo en unos 20 segundos.
- Si el catálogo dice que no puede cargar, revisa que el acceso de la implementación sea **Cualquier persona** y que la URL termine en `/exec`.
- Si ves "ocupado" al confirmar, alguien más estaba reservando en ese instante: basta con reintentar.
