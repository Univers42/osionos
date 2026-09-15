markdown
# 1. Pruebas de Encabezados
# H1 Grande
## H2 Normal
### H3 Sutil
#### H4 Pequeño
##### H5 Muy pequeño
###### H6 Mínimo

# 2. Énfasis y Estilos de Texto
*Este texto es cursiva con asteriscos.*
_Este texto es cursiva con guiones bajos._

**Este texto es negrita con asteriscos.**
__Este texto es negrita con guiones bajos.__

***Negrita e Italica combinadas***
~~Texto tachado (GFM)~~

**Negrita con _cursiva interna_** y viceversa.

# 3. Listas (Anidamiento y Mezcla)
* Elemento 1
* Elemento 2
    * Sub-elemento indentado (4 espacios)
    * Otro sub-elemento
        1. Lista numerada interna
        2. Segundo ítem
* Elemento 3 con `código embebido`

1. Uno
2. Dos
    - Mezclando viñetas dentro de números
    - Otro más
3. Tres
- [x] Hacer la compra :warning: :check:
- [ ] Comerse la comida :smile:
- [X] Evacuar la comida :wave:

# 4. Enlaces e Imágenes
[Enlace simple a Google](https://google.com)
[Enlace con título](https://google.com "Buscador de Google")
Enlace directo: <https://github.com>

Imagen con Alt Text:
![Logo Markdown](https://markdown-here.com)

# 5. Bloques de Código (Code Blocks)
`Código en línea (inline code)` con caracteres raros: `< > / \\ * _\`

```python
# Bloque de código con resaltado de sintaxis
def hola_mundo():
    print("Hola, Markdown Engine!")
    return True
```

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | NestJS | 11 |
| Frontend | React + Vite | 19 / 6 |
| Language | TypeScript strict | 5.7 |
| ORM | Prisma | 7 |
| Database | PostgreSQL | 16 |
| Cache / Pub-Sub | Redis | 7 |
| Package manager | pnpm workspaces | 10 |
| Reverse proxy | nginx | — |
| Containerization | Docker Compose | — |
| Styling | SCSS design system | — |

> [!tip] tip
> Keep working on the MVP

> [!note] note
> Finish the MVP

> [!error] error
> The MVP is not finished

> [!faq] faq
> FAQ me

> [!todo] todo
> Finish the MVP

> [!example] example
> Example me that MVP


```mermaid
graph TB
    Browser

    subgraph Compose["Docker Compose"]
        Nginx["nginx  ·  :80"]
        Frontend["React + Vite  ·  :5173"]
        Backend["NestJS  ·  :3000"]
        WS["WebSocket Gateway"]
        PG[("PostgreSQL  ·  :5432")]
        Redis[("Redis  ·  :6379")]
    end

    OAuth["42 OAuth 2.0"]

    Browser -->|"HTTP / WS"| Nginx
    Nginx --> Frontend
    Nginx --> Backend
    Backend --> WS
    Backend -->|"Prisma ORM"| PG
    Backend --> Redis
    Backend -->|"token exchange"| OAuth

    style Compose fill:#f8fafc,stroke:#cbd5e1,color:#1e293b
    style Frontend fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f
    style Backend fill:#ede9fe,stroke:#7c3aed,color:#3b1f6e
    style WS fill:#ede9fe,stroke:#7c3aed,color:#3b1f6e
    style PG fill:#dcfce7,stroke:#22c55e,color:#14532d
    style Redis fill:#fecaca,stroke:#dc2626,color:#7f1d1d
    style Nginx fill:#fef3c7,stroke:#d97706,color:#78350f
    style OAuth fill:#fce7f3,stroke:#db2777,color:#831843
```
