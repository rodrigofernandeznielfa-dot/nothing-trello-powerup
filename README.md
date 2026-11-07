# NOTHING · INDICADORES — Power-Up de Trello

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
