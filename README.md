# NOTHING · INDICADORES — Power-Up de Trello

## Criterio de producto: Trello nativo primero

El Power-Up complementa Trello; no lo sustituye ni duplica campos nativos. Las columnas representan el estado real, las etiquetas existentes representan categorías/prioridades, las checklists son los criterios verificables y los comentarios/adjuntos guardan decisiones y evidencias. Si existen Campos personalizados nativos en el plan del usuario, preferirlos a crear controles duplicados.

El panel propio se limita a información derivada que Trello no presenta directamente: progreso verificable, horas previstas y pendientes con cobertura explícita, dependencias/bloqueos, y propuesta de siguiente tarea con botones reales `Aceptar propuesta` y `Ahora no`. Usar color con significado (rojo bloqueo; amarillo decisión pendiente; verde validado), diseño sobrio, contraste accesible y sin filas de emojis. Una decisión no cambia automáticamente el estado ni ejecuta agentes.

**Pendiente de compatibilidad:** el lector histórico `dependencies.js` interpreta dependencias, propuestas y algunos resúmenes de horas desde bloques Markdown de las descripciones. Una descripción compacta puede dejar esos campos invisibles al Power-Up. Para evolucionarlo, migrar estado propio y decisiones a `t.get/t.set` u otra fuente apropiada y conservar lectores antiguos como compatibilidad transitoria. No almacenar de nuevo datos estructurados del Power-Up en descripciones/comentarios. Si faltan datos, mostrar «Sin estimar» o «Pendiente de migrar», no un éxito falso.

No afirmar despliegue o activación por GitHub Pages o CI solamente: probar en un tablero autenticado con el Power-Up habilitado. Este repositorio es público: no introducir información privada, ejemplos reales del propietario ni tokens.


Panel visual para seguimiento del videojuego **NOTHING BITES** y del estudio **APPARENTLY NOTHING**.

## Tiempo previsto y pendiente

El porcentaje procede de los criterios nativos de Trello. Las **horas previstas** y **horas pendientes** proceden de las estimaciones aproximadas de trabajo anotadas en las mismas checklists, por ejemplo:

```text
Diseñar tipografía pixel art · ≈ 2 h
Probar la tienda con el repartidor · ≈ 3,5 h
```

- El Power-Up muestra **% de criterios completados**, **horas totales previstas** y **horas pendientes**.
- Cuando se marca una casilla estimada, sus horas se descuentan automáticamente del pendiente. El total estimado inicial **no cambia**.
- Las estimaciones son **esfuerzo activo**, no fechas ni tiempo de calendario; pueden revisarse conforme conocemos mejor el trabajo.
- Los criterios sin horas (por ejemplo logros históricos o hitos de comprobación) **no suman horas**. Pueden seguir contando en el porcentaje general: progreso por checklist y esfuerzo estimado son métricas distintas.
- Un avance sin estimar **no vale cero horas**. Si ya existen criterios completados sin horas asignadas, el previsto global queda `Sin cerrar` y el completado queda `Sin estimar` o muestra únicamente la parte que sí tiene horas. El pendiente conserva las estimaciones de las tareas futuras; completar un hito sin horas no descuenta una cantidad arbitraria.
- Los resúmenes que solo estiman trabajo futuro pueden escribir `Pendiente: ≈ N h`, `Trabajo previo: sin estimar` y la referencia de criterios. No presentar ese subtotal como el total de todo el proyecto.
- El botón `NOTHING · Estimar criterios` continúa permitiendo editar horas por criterio. Sus datos guardados tienen prioridad frente a los valores escritos en el nombre.
- `Completado` muestra el esfuerzo **estimado** de los criterios ya completados, calculado como previsto menos pendiente. No es un cronómetro ni convierte el porcentaje en horas. Si hay una dedicación histórica documentada, se muestra como `Dedicación`, retrospectiva y no cronometrada.
- El panel interior utiliza el detalle actual de criterios y, si Trello no lo proporciona, un cálculo guardado compatible con el progreso o el resumen `ESTIMACIÓN DE TRABAJO` de la descripción. Un resumen desactualizado conserva el previsto, pero pide revisar el pendiente; nunca supone horas exactas a partir del porcentaje.
- IDEAS sin alcance aprobado no reciben cifras de horas ficticias; las tareas POR HACER/EN CURSO sí se estiman.

## Desarrollo y seguridad

- `connector.html` es el punto de entrada activo del Power-Up: no confundir con `index.html` ni conectores históricos `connector-v*.html`.
- `dependencies.js` define los lectores de encabezados Markdown y de horas. El conector incluye una copia embebida para evitar llamadas adicionales que puedan exceder el tiempo de respuesta de Trello.
- `progress-panel.html` + `progress-panel.js`: panel por tarjeta, progreso y tres magnitudes de tiempo.
- `estimate.html` + `estimate.js` + `core.js`: edición opcional del esfuerzo.
- Ejecutar `node --test tests/*.test.cjs`. La PR valida sin desplegar. El workflow GitHub Pages de main publica solo tras integrar cambios probados y compara los archivos publicados con ese mismo commit.
- El repositorio del Power-Up es público: **nunca** almacenar en él descripciones privadas de fichas, credenciales, secretos ni información interna del juego. Las estimaciones y decisiones concretas permanecen en Trello y documentación privada de NOTHING BITES.

## Propuesta amarilla de siguiente tarea

La sugerencia nace de una revisión del proyecto completo en ChatGPT: tareas activas y pendientes, resultados comprobados, dependencias y estado técnico en GitHub. El Power-Up presenta esa conclusión; no ejecuta una IA en segundo plano ni decide a partir de porcentajes, horas, etiquetas o posición de tarjetas.

- **Rojo:** bloqueo por una dependencia sin resolver.
- **Amarillo — Propuesta · siguiente tarea:** recomendación pendiente de la decisión del propietario. El panel explica acción, motivo, resultado esperado y fecha de revisión.
- **Aceptar propuesta:** registra la elección y muestra **Próxima acordada**. Para comenzar se mantiene el flujo habitual: el propietario elige la tarjeta en EN CURSO y dice «Mira Trello». No mueve tarjetas, no inicia agentes, no modifica código ni aprueba costes o assets.
- La respuesta guardada no envía un mensaje a ChatGPT ni inicia una revisión. El conector de lectura de tarjetas no expone estos datos del Power-Up; ChatGPT respeta la selección manual en EN CURSO y cualquier decisión explícita del propietario.
- **Ahora no:** aparca esa propuesta y retira su insignia amarilla. El panel conserva el motivo y permite revisar la decisión.
- Una propuesta editada requiere una decisión nueva: no hereda una aceptación de otro texto. Un fallo de lectura o de escritura no se presenta como aceptación guardada.
- Si hay bloqueo o dependencias sin comprobar, la sugerencia queda **en espera**; aceptarla no elimina el bloqueo.
- Solo se propone trabajo de **POR HACER**. No se muestran estas prioridades en IDEAS, EN CURSO ni HECHO. El orden manual y la tarea activa se conservan.
- Mantener **una sola propuesta operativa** tras cada revisión global; al cambiar de candidata, actualizar el análisis y retirar la sección de la anterior. Una elección del propietario no se sustituye silenciosamente: se explica cualquier propuesta alternativa.

La conclusión se conserva de forma legible en la tarjeta candidata, sin contenido privado en este repositorio público:

```text
**PROPUESTA DE SIGUIENTE TAREA**
Acción: Comprobar un recorrido completo de ejemplo.
Motivo: La prueba conecta piezas ya disponibles antes de ampliar el alcance.
Resultado: Un recorrido repetible y sus incidencias registradas.
Revisión: 2026-11-07
```

El panel escribe únicamente la respuesta explícita del usuario en `nothing_next_task_decision_v1` (datos compartidos de esa tarjeta), manteniendo las estimaciones separadas. Requiere permiso de edición; los lectores ven la propuesta sin controles de escritura. La lectura opcional tiene un tiempo límite para no ocultar progreso/horas ante una conexión lenta. La sección se limita a 1600 caracteres para mantener pequeñas las respuestas guardadas; si Trello rechaza un guardado, el panel lo indica sin reintentar automáticamente.

Las pruebas incluyen las regresiones de horas y progreso, ausencia de escrituras al abrir, decisión por teclado, aceptar/aparcar/reconsiderar, propuesta modificada, lectura y escritura fallidas, permisos y reflujo a 320 px. Los navegadores de CI usan datos sintéticos y una frontera Trello simulada: no son evidencia de una sesión autenticada en el tablero del propietario.
