Javier BDM PWA v2 SEGURA — migración

IMPORTANTE:
- Esta versión NO contiene data.json ni la base de clientes.
- Conserva la misma llave localStorage de v1, por lo que al actualizar el MISMO sitio, el iPhone debe conservar sus datos actuales.
- Incluye Respaldo / Restaurar en formato JSON.
- Si se abre en un dispositivo/origen nuevo sin datos locales, pide restaurar un respaldo.
- El Service Worker v2 elimina la caché v1, incluyendo el antiguo data.json cacheado.

Paso recomendado:
1) Subir estos archivos al sitio actual (eliminando data.json del contenido actual).
2) Abrir Javier BDM en el iPhone y confirmar que siguen apareciendo 133 empresas / 345 contactos / 79 actividades.
3) Ir a Respaldo / Restaurar y descargar un respaldo.
4) SOLO después de confirmar el respaldo, migrar a un repositorio limpio/nuevo y eliminar el repositorio público anterior para evitar que data.json permanezca accesible en el historial Git.
