#### **Fase 1: Preparación del Entorno**
* **Punto 1.1:** Instalación de la dependencia `zundo`.
* **Punto 1.2:** Creación de un entorno de pruebas controlado (una página de test) para no afectar al trabajo real mientras calibramos el historial.
* **Punto 1.3:** Verificación de las versiones de Zustand para asegurar compatibilidad total con el middleware.

#### **Fase 2: Modelado del Historial (Filtrado)**
* **Punto 2.1:** Definición del `partialize`: Decidir qué campos del `usePageStore` **entran** en la maleta (ej: `pages`, `activePage`) y cuáles **se quedan fuera** (ej: `loadingIds`, `seeded`, `showTrash`).
* **Punto 2.2:** Configuración del límite de la pila: Establecer el tope de 50 movimientos para evitar desbordamientos de memoria.

#### **Fase 3: Lógica de Snapshots Inteligentes**
* **Punto 3.1:** Implementación de la "Vía Rápida" (Estructural): Configurar las acciones `delete`, `move` y `add` para que disparen un snapshot inmediato sin esperas.
* **Punto 3.2:** Implementación de la "Vía Lenta" (Contenido): Configurar el **Debounce** de 1.5s - 2s para las actualizaciones de texto (`updateBlock`).
* **Punto 3.3:** Regla del "Foco Perdido": Programar que el sistema fuerce un snapshot cuando el usuario hace clic fuera de un bloque (Blur), cerrando esa sesión de edición.

#### **Fase 4: Controladores de Usuario (Input)**
* **Punto 4.1:** Creación del `useHistoryActions`: Un pequeño hook o selector para acceder a las funciones `undo()`, `redo()`, y `clear()`.
* **Punto 4.2:** Listener de Teclado Global: Configurar el sistema para que escuche `Ctrl+Z` y `Ctrl+Y` / `Ctrl+Shift+Z` en toda la aplicación.
* **Punto 4.3:** Prevención de colisiones: Asegurar que el `Ctrl+Z` del sistema no interfiera con el `Ctrl+Z` nativo del navegador si hay un input de sistema enfocado.

#### **Fase 5: Sincronización y "Efectos Secundarios"**
* **Punto 5.1:** Re-sincronización de caché: Al hacer Undo, disparar la persistencia local para que el `localStorage` sepa que hemos vuelto al pasado.
* **Punto 5.2:** Gestión de la API: Decidir si el Undo debe enviar una petición al servidor inmediatamente o esperar al siguiente guardado automático.
* **Punto 5.3:** Manejo de la "Página Activa": Si deshacemos la creación de una página en la que estamos situados, el sistema debe redirigirnos automáticamente a una página válida.

#### **Fase 6: Pulido y Testing**
* **Punto 6.1:** Stress Test: Realizar 100 ediciones rápidas para verificar que el límite de la pila y el debounce funcionan bajo presión.
* **Punto 6.2:** Auditoría de Memoria: Usar las herramientas de desarrollador de Chrome para medir cuántos KB consume cada snapshot.
