# Reporte de QA - Proyecto FARO

## Entornos
- **STG URL:** https://faropulse-git-develop-faropulse-debugs-projects.vercel.app
- **Nota de Acceso STG:** STG se encuentra bloqueado por la protección de preview de Vercel (Vercel SSO / HTTP 302 hacia `/sso-api`). Debido a esto, la suite de tests automatizados (E2E) ha sido configurada para ejecutarse apuntando a `http://localhost:3000` levantando el servidor local a través de `npm run dev`.

---

## Bugs Reportados

### Bug 1: Renderizados en cascada (Cascading Renders) en Componente de Roles
- **Ubicación:** `app/dashboard/owner/v2/page.tsx:101:32`
- **Severidad/Riesgo:** Alto
- **Descripción:** El linter estático ha identificado un problema de React Hooks (`react-hooks/set-state-in-effect`). Se está llamando a `setActiveTab('resumen')` de forma síncrona dentro de un `useEffect` que depende de las variables `role` y `hasTabAccess`. Modificar el estado local de esta manera dentro de la fase de commit causa un renderizado adicional en cascada (cascading render), lo cual degrada la performance de la UI y puede generar inconsistencias o interacciones no deseadas al momento en que Next.js resuelve los accesos a cada Tab.
- **Cómo Reproducirlo:**
  1. Ejecutar el comando de chequeo estático: `npm run lint`.
  2. Observar el output que reporta `Error: Calling setState synchronously within an effect can trigger cascading renders` sobre el archivo de la vista del Owner.
- **Sugerencia de Fix:**
  Se debe refactorizar la lógica para evitar este patrón. En lugar de actualizar el estado dentro de un efecto, se puede derivar el estado directamente durante el ciclo de renderizado, o manejar la validación/fallback de forma condicional en los eventos que originan el cambio de rol/acceso sin forzar al componente a actualizarse repetidamente de forma manual.
