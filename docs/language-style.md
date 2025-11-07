## Estilo de lenguaje para la UI

- Todo el contenido visible en español debe escribirse con ortografía completa (acentos, eñes, signos de interrogación/exclamación dobles, etc.).
- Los archivos del repositorio se guardan en UTF-8. Evita convertirlos a otra codificación.
- Prefiere textos naturales para el usuario final. Si necesitas mensajes técnicos, confirma si se mostrarán al usuario o solo en logs.
- Revisa las traducciones antes de enviar cambios; los revisores rechazarán strings con moji­bake (`sesi\u00f3n` → "sesión") o sin acentos.
- Para formatos de fecha/hora usa `es-ES` (o la variante específica requerida) y/o `dayjs` con `locale("es")`.
