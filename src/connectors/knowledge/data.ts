export interface ReportFormat {
  name: string;
  description: string;
  instructions: string[];
  mixpanelQueries: string[];
  hubspotQueries: string[];
}

export const reportFormats: Record<string, ReportFormat> = {
  "alta": {
    name: "Reporte de Alta (exitosa o fallida)",
    description: "Reporte completo del proceso de alta de un prospecto, desde la primera visita al cotizador hasta el resultado del pago. Incluye recorrido en arma-tu-plan, gestión comercial, y portal de candidatos.",
    instructions: [
      "1. DATOS PRINCIPALES (tabla resumen arriba de todo):",
      "   - Link directo a HubSpot: https://app.hubspot.com/contacts/39759085/record/0-1/{contactId}",
      "   - Nombre, DNI, edad, sexo, estado civil, teléfono, email",
      "   - Plan elegido (nombre, ID, precio) — del evento cotizador__intencion_de_alta o cotizador__paso_5__redirect",
      "   - Tipo de contratación (particular, monotributo, RD) — del evento cotizador__formulario_datos__complete (campo tipo_trabajo)",
      "   - Modalidad (individual, grupo familiar) — del evento proceso_portal_express (campo modalidad)",
      "   - Flujo del portal (express vs normal, particular vs RD) — del evento proceso_portal_express (campo tipo_flujo)",
      "   - Cartilla elegida — del evento cotizador__tipo_cartilla__select (campo cartilla_tipo)",
      "   - Plan mujer — del evento cotizador__paso4_view__portal o paso_5__redirect",
      "   - Dispositivo, ubicación, zona, AB test",
      "",
      "2. RECORRIDO COMPLETO EN ARMA TU PLAN (cotizador):",
      "   Buscar TODAS las sesiones, no solo la del día del alta.",
      "   Para encontrar eventos pre-verificación (usan device_id anónimo):",
      "   a) Buscar por email en cotizador__envio_codigo_verificacion → obtener device_id",
      "   b) Buscar por ese device_id para obtener eventos anteriores (paso_1, paso_2, paso_3 que no tienen email)",
      "   c) Puede haber múltiples sesiones en días diferentes y dispositivos diferentes",
      "   Incluir para cada sesión:",
      "   - Fecha y dispositivo (desktop/mobile)",
      "   - Referrer y UTMs (google.com, medicus.com.ar, directo)",
      "   - Cada paso del cotizador con timestamp",
      "   - Cartilla seleccionada y si cambió entre opciones",
      "   - Si hizo clic en Contactarse o Prefiero que me llamen",
      "   - Intención de alta: plan, precio, origen del clic (boton_sidebar, etc.)",
      "   - Redirect al portal: URL express y negocio_id",
      "",
      "3. GESTIÓN COMERCIAL (HubSpot):",
      "   - Conversaciones WhatsApp (hubspot_get_contact_communications) — incluir texto de los mensajes",
      "   - Llamadas (hubspot_get_contact_calls)",
      "   - Emails (hubspot_get_contact_emails)",
      "   - Notas de asesores (hubspot_get_contact_notes)",
      "   - Cronología completa con nombre del asesor y contenido de cada interacción",
      "",
      "4. RECORRIDO COMPLETO EN PORTAL DE CANDIDATOS (Mixpanel):",
      "   Buscar por deal ID ($user_id). Incluir TODOS los eventos:",
      "   - Page Views ($mp_web_page_view) con referrer (especialmente returns de 4i4id y Digilogix)",
      "   - Clicks ($mp_click) con página donde ocurrieron",
      "   - Page Leaves ($mp_page_leave)",
      "   - Cada paso: captura_DNI, carga_datos, Verificacion_Biometrica, DDJJ, recotizacion, resumen, Generacion_documentos, firma_solicitud, pago",
      "   - Para cada paso: checkIn, checkOut, success, tiempo_en_proceso",
      "   - Datos capturados en carga_datos checkOut: codigo_postal, localidad, edad, email, vigencia",
      "   - Sesiones posteriores al alta (si volvió al portal después)",
      "",
      "5. CUSTOM OBJECTS DEL DEAL:",
      "   - Integrantes (2-41300066): datos del titular y familiares, estado_en_binary, plan_mujer, preexistencias",
      "   - DDJJ Antecedentes (2-41300045): preexistencias declaradas (si hay registros = declaró algo)",
      "   - Medios de pago (2-46523154): forma_de_pago, estado, descripcion del resultado",
      "",
      "6. ESTADO ACTUAL EN HUBSPOT:",
      "   - Deal stage, asociado_a_medicus, lead status",
      "   - Alertas o inconsistencias encontradas (ej: tipo_trabajo diferente entre cotizador y HubSpot)",
    ],
    mixpanelQueries: [
      "Buscar eventos cotizador por email: Events where properties.email == '{email}' AND event starts with 'cotizador__'",
      "Buscar device_id del cotizador: del evento cotizador__envio_codigo_verificacion obtener $device_id",
      "Buscar sesiones pre-verificación: Events where properties.$device_id == '{device_id}' AND event starts with 'cotizador__'",
      "Buscar eventos del portal por deal: Events where properties.$user_id == '{dealId}'",
      "Incluir todos los eventos: NO filtrar $mp_click, $mp_web_page_view, $mp_page_leave — son necesarios para el reporte completo",
    ],
    hubspotQueries: [
      "hubspot_get_contact: con properties completas (email, dni, edad, hs_lead_status, lifecyclestage, hubspot_owner_id, canal, categoria, amba, forma_de_contratacion, etc.)",
      "hubspot_get_contact_communications: todas las conversaciones WhatsApp/SMS",
      "hubspot_get_contact_calls: llamadas",
      "hubspot_get_contact_emails: emails",
      "hubspot_get_contact_notes: notas de asesores + notas automáticas de cotización",
      "hubspot_get_contact_deals: deals asociados",
      "hubspot_get_deal: detalle del deal con stage",
      "hubspot_get_deal_notes: notas del deal (incluye nota de firma digital OK)",
      "hubspot_get_deal_custom_objects con 2-41300066 (integrantes): estado_en_binary, plan_mujer, preexistencias",
      "hubspot_get_deal_custom_objects con 2-41300045 (DDJJ antecedentes): preexistencias declaradas",
      "hubspot_get_deal_custom_objects con 2-46523154 (medios de pago): forma_de_pago, estado_de_pago",
    ],
  },
};

export interface MixpanelEvent {
  name: string;
  trigger: string;
  properties: string[];
  component: string;
  step?: string;
}

export interface HubSpotOperation {
  method: string;
  endpoint: string;
  description: string;
  trigger: string;
  dataFlow: "read" | "write" | "both";
}

export interface ProjectKnowledge {
  name: string;
  description: string;
  framework: string;
  role: string;
  mixpanelEvents: MixpanelEvent[];
  hubspotOperations: HubSpotOperation[];
  userJourney?: string[];
  notes: string[];
}

export const projects: Record<string, ProjectKnowledge> = {
  "arma-tu-plan": {
    name: "arma-tu-plan",
    description: "Cotizador web de planes de salud. Punto de entrada principal para usuarios que quieren cotizar y contratar un plan de Medicus online.",
    framework: "Next.js (React)",
    role: "Frontend - Punto de entrada web del funnel de ventas",
    mixpanelEvents: [
      // Page views
      { name: "Page Viewed", trigger: "Cada navegacion de pagina", properties: ["page", "domain", "referrer"], component: "MixPanelTracker.tsx", step: "global" },

      // Paso 1: Tipo de cobertura y datos personales
      { name: "cotizador__paso_1__view", trigger: "Se monta el formulario principal del cotizador", properties: ["URL", "referrer", "device"], component: "plan-builder.tsx", step: "paso-1" },
      { name: "cotizador__tipo_cobertura__select", trigger: "Usuario selecciona Individual o Grupal", properties: ["tipo_cobertura", "device"], component: "plan-builder.tsx", step: "paso-1" },
      { name: "cotizador__formulario_datos__complete", trigger: "Validacion del formulario pasa (todos los campos completos)", properties: ["fecha_nacimiento", "localidad", "tipo_trabajo", "cobertura_seleccionada", "device"], component: "plan-builder.tsx", step: "paso-1" },
      { name: "cotizador__envio_codigo_verificacion", trigger: "Usuario clickea 'Continuar' y se envia codigo de verificacion por SMS/email", properties: ["fecha_nacimiento", "localidad", "tipo_trabajo", "cobertura_seleccionada", "contact_method", "email", "telefono", "device"], component: "plan-builder.tsx", step: "paso-1" },
      { name: "cotizador__codigo_verificacion__autofill", trigger: "Codigo de verificacion se autocompleta (WebOTP, clipboard, iOS)", properties: ["method", "device", "timestamp"], component: "verificationModal.tsx", step: "paso-1" },

      // Paso 2: Seleccion de cartilla
      { name: "cotizador__paso_2__view", trigger: "Pagina de seleccion de cartilla carga", properties: ["URL", "referrer", "device"], component: "cartillaSelection.tsx", step: "paso-2" },
      { name: "cotizador__tipo_cartilla__select", trigger: "Usuario selecciona cartilla (Esencial/Amplia/Completa)", properties: ["cartilla_tipo"], component: "cartillaSelection.tsx", step: "paso-2" },

      // Paso 3: Resultados y seleccion de plan
      { name: "cotizador__paso_3__view", trigger: "Pagina de resultados de planes carga", properties: ["URL", "referrer", "device"], component: "plan-results.tsx", step: "paso-3" },
      { name: "cotizador__plan_opcion__select", trigger: "Usuario clickea una tarjeta de plan", properties: ["plan_id", "plan_nombre", "precio", "plan_mujer"], component: "PlanCard.tsx", step: "paso-3" },
      { name: "cotizador__intencion_de_alta", trigger: "Usuario expresa intencion de darse de alta (antes del modal de confirmacion)", properties: ["plan_id", "plan_nombre", "precio", "device", "origen", "tipo_trabajo", "coverage_type", "timestamp"], component: "plan-results.tsx / useUnifiedPlan.ts", step: "paso-3" },
      { name: "cotizador__boton_confirmar_plan__click", trigger: "Usuario clickea 'Darme de alta online'", properties: [], component: "plan-results.tsx", step: "paso-3" },
      { name: "cotizador__aporte_cubre_cuota", trigger: "El aporte estimado cubre el 100% de la cuota (importeTotal = 0)", properties: ["codigo_postal", "genero", "email", "telefono", "plan_base", "cuota_fija", "cartilla", "tipo_cartilla", "importe_total", "importe_estimado_aporte", "importe_sin_iva", "importe_iva"], component: "plan-results.tsx / useUnifiedPlan.ts", step: "paso-3" },

      // Drawers de personalizacion (mobile)
      { name: "cotizador__drawer_cartilla__open", trigger: "Usuario abre drawer de cartilla en mobile", properties: ["device", "timestamp"], component: "mobile-unified-view.tsx", step: "paso-3" },
      { name: "cotizador__drawer_personalizacion__open", trigger: "Usuario abre drawer de personalizacion en mobile", properties: ["device", "timestamp"], component: "mobile-unified-view.tsx", step: "paso-3" },
      { name: "cotizador__drawer_personalizacion__select", trigger: "Usuario confirma seleccion en drawer (copagos/reintegros)", properties: ["tipo_cartilla", "opcion", "device", "timestamp"], component: "personalization-drawer.tsx", step: "paso-3" },

      // Paso 4: Confirmacion
      { name: "cotizador__paso_4__view", trigger: "Pagina de confirmacion/exito carga tras verificacion", properties: ["nombre", "apellido", "fecha_nacimiento", "coverage_type", "tipo_trabajo", "contact_method", "localidad", "plan_id", "plan_nombre", "precio", "plan_mujer", "URL", "referrer", "device", "timestamp"], component: "success-page.tsx", step: "paso-4" },
      { name: "cotizador__paso4_view__portal", trigger: "Modal de confirmacion para portal express carga", properties: ["nombre", "apellido", "fecha_nacimiento", "coverage_type", "tipo_trabajo", "plan_id", "plan_nombre", "precio", "plan_mujer"], component: "plan-results.tsx / useUnifiedPlan.ts", step: "paso-4" },

      // Paso 5: Redireccion
      { name: "cotizador__paso_5__redirect", trigger: "Se redirige al usuario al portal express de registro", properties: ["negocio_id", "url_express", "plan_id", "plan_nombre", "precio", "URL", "referrer", "device", "timestamp"], component: "plan-results.tsx / useUnifiedPlan.ts", step: "paso-5" },

      // Contacto y ayuda
      { name: "cotizador__contactarse__click", trigger: "Usuario clickea boton de contacto/ayuda", properties: ["origen", "device", "timestamp"], component: "plan-results.tsx / cartillaSelection.tsx", step: "contacto" },
      { name: "cotizador__alta_online_modal__click", trigger: "Usuario clickea 'Darme de alta online ahora' en modal de contacto", properties: ["device", "timestamp"], component: "plan-results.tsx", step: "contacto" },
      { name: "cotizador__prefiero_que_me_llamen__click", trigger: "Usuario clickea 'Prefiero que me llamen' en modal de contacto", properties: ["device", "timestamp"], component: "plan-results.tsx", step: "contacto" },

      // A/B Test
      { name: "ab_test_wp", trigger: "App carga - registra variante de A/B test como super property", properties: ["variant"], component: "useABTest.ts", step: "global" },
    ],
    hubspotOperations: [
      { method: "POST", endpoint: "/cotizador-online/prospecto", description: "Crear prospecto/contacto en HubSpot con datos del formulario, grupo familiar y contactos", trigger: "Despues de verificacion telefonica exitosa (paso 1)", dataFlow: "write" },
      { method: "POST", endpoint: "/cotizador-online/cotizacion", description: "Registrar cotizacion con detalles del plan seleccionado, importes y grupo familiar", trigger: "Despues de seleccionar cartilla y cargar plan (paso 2-3)", dataFlow: "write" },
    ],
    userJourney: [
      "1. Page Load → 'Page Viewed'",
      "2. Formulario monta → 'cotizador__paso_1__view'",
      "3. Selecciona Individual/Grupal → 'cotizador__tipo_cobertura__select'",
      "4. Completa datos → 'cotizador__formulario_datos__complete'",
      "5. Pide verificacion → 'cotizador__envio_codigo_verificacion'",
      "6. Codigo autofill → 'cotizador__codigo_verificacion__autofill'",
      "7. Verificacion OK → POST HubSpot /cotizador-online/prospecto (crea contacto)",
      "8. Mixpanel identifyUser() con prospectoId",
      "9. Navega a cartilla → 'cotizador__paso_2__view'",
      "10. Selecciona cartilla → 'cotizador__tipo_cartilla__select' + POST HubSpot /cotizador-online/cotizacion",
      "11. Resultados cargan → 'cotizador__paso_3__view'",
      "12. Selecciona plan → 'cotizador__plan_opcion__select'",
      "13. Intencion de alta → 'cotizador__intencion_de_alta'",
      "14. Confirma plan → 'cotizador__boton_confirmar_plan__click'",
      "15. Vista portal → 'cotizador__paso4_view__portal'",
      "16. Redireccion express → 'cotizador__paso_5__redirect'",
    ],
    notes: [
      "Token Mixpanel: NEXT_PUBLIC_MIXPANEL_TOKEN (fallback hardcoded: 8cb603a2ebb0d3ac705d58c0601958ca)",
      "Cookie domain: .medicus.com",
      "Session recording habilitado al 1%",
      "Autocapture desactivado (pageview, click, input, scroll, submit)",
      "Device detection: window.innerWidth <= 768 → mobile, sino desktop",
      "Deduplicacion: shouldTrackStep() previene duplicados por URL+step",
      "Facebook Pixel tambien trackea cotizador_paso_3_view_facebook",
      "GTM ID: GTM-WCZN2TN",
      "HubSpot se conecta via gateway en NEXT_PUBLIC_HUBSPOT_BASE_URL (default: services-test.apps.medicus.com.ar)",
      "Embed de HubSpot script: //js.hs-scripts.com/39759085.js",
    ],
  },

  "portal-socios": {
    name: "portal-socios",
    description: "Portal de registro/afiliacion online. El usuario llega redirigido desde arma-tu-plan para completar el proceso de alta: documentos, biometria, DDJJ, pago y firma.",
    framework: "Next.js (web) + Express (server)",
    role: "Frontend + Backend - Portal de registro completo post-cotizacion",
    mixpanelEvents: [
      // Autenticacion
      { name: "form_submit_success", trigger: "Login exitoso (por token o cookies)", properties: [], component: "auth/action.ts", step: "login" },
      { name: "proceso_portal_express", trigger: "Autenticacion exitosa, inicia flujo express", properties: ["checkIn", "tipo_flujo", "modalidad", "source", "origen"], component: "auth/action.ts", step: "login" },

      // Recotizacion
      { name: "recotizacion", trigger: "Pantalla de pricing carga / pricing exitoso", properties: ["checkIn", "success", "checkOut", "tiempo_en_proceso"], component: "hooks/usePricing.ts", step: "pricing" },

      // Carga de datos personales
      { name: "carga_datos", trigger: "Pantalla de datos personales carga / formulario enviado", properties: ["checkIn", "checkOut", "success", "email", "telefono", "codigo_postal", "localidad", "vigencia", "edad", "tiempo_en_proceso"], component: "personalData/index.tsx + data-next/layout.tsx", step: "datos" },

      // Captura DNI
      { name: "captura_DNI", trigger: "Pantalla de camara frontal carga / captura trasera exitosa", properties: ["checkIn", "checkOut", "tiempo_en_proceso"], component: "camera/front/page.tsx + cameraCapture/index.tsx", step: "dni" },

      // Verificacion biometrica
      { name: "Verificacion_Biometrica", trigger: "Pantalla de biometria carga / resultado HIT o fallo", properties: ["checkIn", "checkOut", "success", "numero_intentos", "tiempo_en_proceso"], component: "biometric/layout.tsx + hooks/useBiometricResult.ts", step: "biometria" },

      // DDJJ (Declaracion Jurada)
      { name: "DDJJ", trigger: "Pantalla de DDJJ carga / formulario enviado (CARPETA.OK o fallo)", properties: ["checkIn", "checkOut", "success", "tiempo_en_proceso", "error_context"], component: "hooks/useDDAA.ts + ddaa/page.tsx", step: "ddjj" },

      // Generacion de documentos para firma
      { name: "Generacion_documentos", trigger: "Proceso de generacion de documentos inicia / link de firma generado o fallo", properties: ["checkIn", "checkOut", "success", "tiempo_en_proceso"], component: "hooks/useSign.ts", step: "documentos" },

      // Firma
      { name: "firma_solicitud", trigger: "Pantalla de firma carga / usuario completa firma (exito o rechazo)", properties: ["checkIn", "checkOut", "success", "tiempo_en_proceso"], component: "sign/page.tsx + hooks/useFirmaResult.ts", step: "firma" },

      // Resumen
      { name: "resumen", trigger: "Pantalla de resumen de plan carga / usuario navega a firma", properties: ["checkIn", "checkOut", "tiempo_en_resumen"], component: "details/page.tsx", step: "resumen" },

      // Pago
      { name: "pago", trigger: "Proceso de pago inicia / pago exitoso, reintento o error", properties: ["checkIn", "checkOut", "success", "tiempo_en_proceso"], component: "hooks/usePaymentTrack.ts", step: "pago" },
    ],
    hubspotOperations: [
      { method: "GET", endpoint: "/portal-afiliacion/prospecto/{idRegistro}", description: "Obtener datos del prospecto al hacer login", trigger: "Login del usuario", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion/ddjj", description: "Enviar declaracion jurada de salud (peso, talla, respuestas)", trigger: "Usuario completa formulario DDJJ", dataFlow: "write" },
      { method: "GET", endpoint: "/portal-afiliacion/ddjj", description: "Obtener DDJJ guardada previamente", trigger: "Verificar estado de DDJJ existente", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion/verificacion-biometrica", description: "Actualizar estado de verificacion biometrica", trigger: "Resultado de biometria recibido", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/documentos", description: "Subir documentos (DNI fotos)", trigger: "Usuario captura fotos de DNI", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/medios-pago", description: "Agregar metodo de pago", trigger: "Usuario configura debito automatico", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/firma", description: "Actualizar estado de firma", trigger: "Proceso de firma completado", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/estudios", description: "Subir estudios medicos", trigger: "Usuario carga estudios solicitados por auditor", dataFlow: "write" },
      // Express flow
      { method: "GET", endpoint: "/portal-afiliacion-express/prospecto/{idNegocio}", description: "Obtener negocio express", trigger: "Login en flujo express", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion-express/ddaa", description: "Enviar DDJJ (flujo express)", trigger: "DDJJ en flujo express", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion-express/documentos", description: "Subir documentos (flujo express)", trigger: "Documentos en flujo express", dataFlow: "write" },
      { method: "GET", endpoint: "/portal-afiliacion-express/cotizacion/{idNegocio}", description: "Obtener cotizacion express", trigger: "Pantalla de pricing express", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion-express/employment/validate", description: "Validar empleador (flujo RD)", trigger: "Validacion de CUIT empleador", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion-express/pago", description: "Registrar pago express (PayWay)", trigger: "Pago en flujo express", dataFlow: "write" },
    ],
    userJourney: [
      "1. Login con token encriptado → 'form_submit_success' + 'proceso_portal_express'",
      "2. Recotizacion/pricing → 'recotizacion' (checkIn + checkOut)",
      "3. Carga datos personales → 'carga_datos' (checkIn + checkOut con datos)",
      "4. Captura DNI frente/dorso → 'captura_DNI' (checkIn al entrar, checkOut al completar dorso)",
      "5. Verificacion biometrica → 'Verificacion_Biometrica' (checkIn + checkOut con intentos)",
      "6. Declaracion jurada salud → 'DDJJ' (checkIn + checkOut con estado)",
      "7. Resumen del plan → 'resumen' (checkIn + checkOut)",
      "8. Generacion documentos → 'Generacion_documentos' (checkIn + checkOut)",
      "9. Firma digital → 'firma_solicitud' (checkIn + checkOut)",
      "10. Pago → 'pago' (checkIn + checkOut con reintentos)",
    ],
    notes: [
      "Token Mixpanel: NEXT_PUBLIC_MIXPANEL_TOKEN via next-runtime-env",
      "Mixpanel SOLO activo en produccion (isProd check)",
      "Patron checkIn/checkOut: todos los eventos miden tiempo_en_proceso en ms",
      "Super properties: tipo_flujo (relacion_dependencia/monotributista/particular), modalidad (individual/familiar)",
      "User properties seteados: $nombre, $email, $telefono, localidad, codigo_postal, vigencia",
      "Biometria: max 3 intentos",
      "HubSpot se conecta via gateway URL_GATEWAY_MED + v1/api/hubspot/",
      "Dos flujos paralelos: Standard (portal-afiliacion) y Express (portal-afiliacion-express)",
      "Express incluye validacion de empleo (RD) y pago via PayWay",
    ],
  },

  "whatsapp-flow": {
    name: "whatsapp-flow",
    description: "Flujo de cotizacion via WhatsApp. Los usuarios interactuan con un bot de WhatsApp que los guia paso a paso para cotizar planes de salud.",
    framework: "Express.js",
    role: "Backend - Punto de entrada WhatsApp del funnel de ventas",
    mixpanelEvents: [
      // Envio de formulario (desde N8N)
      { name: "flow_1_envio_formulario", trigger: "N8N envia formulario de WhatsApp al usuario (individual/familiar)", properties: ["contact_name", "flow_id", "flow_type", "message_id", "campaign_name", "origin", "sent_at"], component: "TrackingController.js", step: "envio" },
      { name: "flow_empresas_1_envio", trigger: "N8N envia formulario de empresas", properties: ["contact_name", "flow_id", "flow_type", "message_id", "campaign_name", "origin", "sent_at"], component: "TrackingController.js", step: "envio" },

      // Flujo Individual/Familiar - pantallas
      { name: "flow_2_datos_titular", trigger: "Usuario llega a pantalla de datos del titular", properties: ["coverage", "cartilla", "copago", "incluir_pareja", "incluir_hijos", "origin"], component: "flow.js", step: "datos-titular" },
      { name: "flow_3_datos_pareja", trigger: "Usuario llega a pantalla de datos de pareja (si es familiar)", properties: ["coverage", "cartilla", "copago", "incluir_pareja", "incluir_hijos", "origin"], component: "flow.js", step: "datos-pareja" },
      { name: "flow_4_datos_hijos", trigger: "Usuario llega a pantalla de datos de hijos", properties: ["coverage", "cartilla", "copago", "incluir_pareja", "incluir_hijos", "origin"], component: "flow.js", step: "datos-hijos" },
      { name: "flow_5_tipo_cartilla", trigger: "Usuario llega a seleccion de tipo de cartilla", properties: ["coverage", "origin"], component: "flow.js", step: "tipo-cartilla" },
      { name: "flow_6_opciones", trigger: "Usuario llega a pantalla de opciones", properties: ["coverage", "origin"], component: "flow.js", step: "opciones" },
      { name: "flow_7_tipo_copago", trigger: "Usuario llega a seleccion de copago (con/sin)", properties: ["coverage", "origin"], component: "flow.js", step: "copago" },
      { name: "flow_8_nivel_reintegro", trigger: "Usuario llega a seleccion de nivel de reintegro", properties: ["coverage", "origin"], component: "flow.js", step: "reintegro" },
      { name: "flow_9_plan_mujer", trigger: "Usuario llega a seleccion de plan mujer", properties: ["coverage", "origin"], component: "flow.js", step: "plan-mujer" },
      { name: "flow_10_seleccion_plan", trigger: "Usuario ve la lista de planes y selecciona uno", properties: ["coverage", "origin"], component: "flow.js", step: "seleccion-plan" },
      { name: "flow_12_detalle_plan", trigger: "Usuario ve detalle del plan seleccionado", properties: ["coverage", "origin"], component: "flow.js", step: "detalle-plan" },
      { name: "flow_metodo_pago", trigger: "Usuario llega a seleccion de metodo de pago", properties: ["coverage", "origin"], component: "flow.js", step: "metodo-pago" },

      // Eventos de progreso
      { name: "flow_11_planes_mostrados_{coverage}", trigger: "Planes cargados y mostrados al usuario", properties: ["coverage", "cantidad_planes", "origin"], component: "flow.js", step: "planes" },
      { name: "flow_11_plan_seleccionado_{coverage}", trigger: "Usuario selecciona un plan especifico", properties: ["plan_nombre", "plan_letra", "plan_precio", "coverage", "origin"], component: "flow.js", step: "seleccion" },
      { name: "flow_13_solicitud_contacto_{coverage}", trigger: "Usuario solicita contacto o alta online", properties: ["plan_nombre", "plan_letra", "plan_precio", "coverage", "origin", "es_alta_online"], component: "flow.js", step: "solicitud" },
      { name: "flow_14_flujo_completado_{coverage}", trigger: "Flujo completo terminado", properties: ["plan_nombre", "plan_letra", "plan_precio", "prospecto_id", "cartilla", "copago", "coverage", "origin"], component: "flow.js", step: "completado" },
      { name: "flow_metodo_pago_cuota_fija_seleccionada_{coverage}", trigger: "Usuario selecciona cuota fija", properties: ["coverage", "origin"], component: "flow.js", step: "metodo-pago" },
      { name: "flow_metodo_pago_cuota_variable_seleccionada_{coverage}", trigger: "Usuario selecciona cuota variable", properties: ["coverage", "origin"], component: "flow.js", step: "metodo-pago" },

      // Derivacion a asesor
      { name: "Derivado a Asesor", trigger: "Titular, pareja o hijo mayor a 64 anios", properties: ["screen", "motivo", "edad", "coverage", "prospecto_id", "origin"], component: "flow.js", step: "derivacion" },
      { name: "flow_derivado_asesor_completado", trigger: "Usuario presiona 'Entendido' en pantalla de derivacion", properties: ["coverage", "edad_titular", "edades_hijos", "origin"], component: "flow.js", step: "derivacion" },

      // Errores
      { name: "Validation Error", trigger: "Dato invalido en cualquier pantalla del flujo", properties: ["screen", "error", "origin"], component: "flow.js", step: "error" },
      { name: "API Error", trigger: "Fallo en consulta de planes a API externa", properties: ["screen", "error", "origin"], component: "flow.js", step: "error" },

      // Flujo Empresas
      { name: "flow_empresas_1_inicio", trigger: "Usuario abre flujo de empresas", properties: ["flow_type", "origin", "timestamp"], component: "EmpresasFlowHandler.js", step: "empresas" },
      { name: "flow_empresas_2_completado", trigger: "Formulario de empresa completado", properties: ["nombre_empresa", "nro_empleados", "codigo_postal", "tiene_mensaje", "origin"], component: "EmpresasFlowHandler.js", step: "empresas" },
      { name: "flow_empresas_3_guardado_hubspot", trigger: "Empresa guardada en HubSpot exitosamente", properties: ["nombre_empresa", "origin"], component: "EmpresasFlowHandler.js", step: "empresas" },
      { name: "flow_empresas_validacion_error", trigger: "Error de validacion en formulario empresas", properties: ["error", "screen", "origin"], component: "EmpresasFlowHandler.js", step: "empresas" },
      { name: "flow_empresas_cp_fuera_bsas", trigger: "Codigo postal fuera de Buenos Aires", properties: ["codigo_postal", "origin"], component: "EmpresasFlowHandler.js", step: "empresas" },
      { name: "flow_empresas_error_hubspot", trigger: "Error al guardar empresa en HubSpot", properties: ["error", "origin"], component: "EmpresasFlowHandler.js", step: "empresas" },

      // Flujo Contacto
      { name: "flow_contacto_1_inicio", trigger: "Usuario abre flujo de contacto simple", properties: ["flow_type", "origin", "timestamp"], component: "ContactoFlowHandler.js", step: "contacto" },
      { name: "flow_contacto_2_completado", trigger: "Formulario de contacto completado y guardado", properties: ["nombre", "apellido", "edad", "email", "codigo_postal", "tipo_trabajo", "tiene_mensaje", "hubspot_contact_id", "flow_type", "origin"], component: "ContactoFlowHandler.js", step: "contacto" },
      { name: "flow_contacto_error_codigo_postal", trigger: "Codigo postal invalido", properties: ["codigo_postal", "flow_type", "origin"], component: "ContactoFlowHandler.js", step: "contacto" },
      { name: "flow_contacto_error_email", trigger: "Email invalido", properties: ["email", "flow_type", "origin"], component: "ContactoFlowHandler.js", step: "contacto" },
      { name: "flow_contacto_error_edad", trigger: "Edad invalida", properties: ["edad", "flow_type", "origin"], component: "ContactoFlowHandler.js", step: "contacto" },
      { name: "flow_contacto_error_hubspot", trigger: "Error al guardar contacto en HubSpot", properties: ["error", "flow_type", "origin"], component: "ContactoFlowHandler.js", step: "contacto" },
    ],
    hubspotOperations: [
      { method: "POST", endpoint: "/crm/v3/objects/contacts (search)", description: "Buscar contacto por telefono (normalizado +549XX)", trigger: "Inicio de cualquier flujo, busca si ya existe", dataFlow: "read" },
      { method: "POST", endpoint: "/crm/v3/objects/contacts (search)", description: "Buscar contacto por email", trigger: "Si no se encuentra por telefono", dataFlow: "read" },
      { method: "POST", endpoint: "/crm/v3/objects/contacts", description: "Crear nuevo contacto con datos del formulario", trigger: "Contacto no encontrado en busqueda", dataFlow: "write" },
      { method: "PATCH", endpoint: "/crm/v3/objects/contacts/{id}", description: "Actualizar contacto existente con nuevos datos", trigger: "Contacto encontrado en busqueda", dataFlow: "write" },
      { method: "POST", endpoint: "/crm/v3/objects/notes", description: "Crear nota con detalle de cotizacion/planes mostrados", trigger: "Al mostrar planes, al seleccionar plan, al completar flujo", dataFlow: "write" },
      { method: "PATCH", endpoint: "/crm/v3/objects/contacts/{id} (lead_status)", description: "Actualizar hs_lead_status del contacto", trigger: "Cambios de estado: EN_COTIZACION, REQUIERE_GESTION_COMERCIAL, NO_CONTACTAR", dataFlow: "write" },
    ],
    userJourney: [
      "1. N8N envia formulario WhatsApp → 'flow_1_envio_formulario'",
      "2. Usuario abre formulario → pantalla COVERAGE",
      "3. Datos titular → 'flow_2_datos_titular' + validaciones",
      "4. Si familiar: datos pareja → 'flow_3_datos_pareja'",
      "5. Datos hijos → 'flow_4_datos_hijos' + HubSpot gestionarProspecto()",
      "6. Tipo cartilla → 'flow_5_tipo_cartilla'",
      "7. Opciones → 'flow_6_opciones'",
      "8. Copago → 'flow_7_tipo_copago'",
      "9. Nivel reintegro → 'flow_8_nivel_reintegro'",
      "10. Plan mujer → 'flow_9_plan_mujer' + consulta planes",
      "11. Planes mostrados → 'flow_11_planes_mostrados_{coverage}' + nota HubSpot",
      "12. Metodo pago → 'flow_metodo_pago'",
      "13. Seleccion plan → 'flow_10_seleccion_plan' + 'flow_11_plan_seleccionado_{coverage}'",
      "14. Detalle plan → 'flow_12_detalle_plan' + nota cotizacion HubSpot",
      "15. Solicitud contacto → 'flow_13_solicitud_contacto_{coverage}' + actualizar lead_status",
      "16. Completado → 'flow_14_flujo_completado_{coverage}'",
    ],
    notes: [
      "Token Mixpanel: MIXPANEL_TOKEN (server-side, package: mixpanel v0.19.1)",
      "Token HubSpot: HUBSPOT_TOKEN (PAT, acceso directo a API sin gateway)",
      "3 flujos independientes: Individual/Familiar, Empresas, Contacto",
      "Origenes soportados: cotizadorweb, landing, facebook, instagram, google, referido",
      "Origin se extrae del flow_token (formato: {tipo}_{numero}_{timestamp}_{origen})",
      "Edad > 64 = derivacion a asesor (no puede contratar online)",
      "HubSpot: busca por telefono normalizado → telefono original → email antes de crear",
      "Notas HTML detalladas con planes, importes, bonificaciones",
      "Session data en memoria keyed por flow_token",
    ],
  },

  "huspot-api": {
    name: "huspot-api",
    description: "Gateway central de HubSpot. TODAS las operaciones CRM de los demas proyectos pasan por esta API (excepto whatsapp-flow que conecta directo). Arquitectura Limpia.",
    framework: "Fastify 5",
    role: "Backend - Gateway central HubSpot (Clean Architecture)",
    mixpanelEvents: [],
    hubspotOperations: [
      // Cotizador Online
      { method: "POST", endpoint: "/cotizador-online/prospecto", description: "Crear prospecto desde cotizador web", trigger: "arma-tu-plan envia datos del formulario", dataFlow: "write" },
      { method: "POST", endpoint: "/cotizador-online/cotizacion", description: "Registrar cotizacion", trigger: "arma-tu-plan envia cotizacion con plan seleccionado", dataFlow: "write" },
      // Portal Afiliacion
      { method: "GET", endpoint: "/portal-afiliacion/prospecto/:idRegistro", description: "Obtener prospecto por ID de registro", trigger: "portal-socios al hacer login", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion/ddjj", description: "Guardar declaracion jurada", trigger: "portal-socios DDJJ form", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/ddjj/estado", description: "Cambiar estado de DDJJ", trigger: "Auditor cambia estado", dataFlow: "write" },
      { method: "GET", endpoint: "/portal-afiliacion/ddjj", description: "Obtener DDJJ existente", trigger: "Consulta de estado", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion/estudios", description: "Subir estudios medicos", trigger: "Usuario carga estudios", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/estudios/solicitar", description: "Solicitar estudios al prospecto", trigger: "Auditor solicita estudios", dataFlow: "write" },
      { method: "GET", endpoint: "/portal-afiliacion/candidatos", description: "Listar candidatos", trigger: "Vista de candidatos", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion/documentos", description: "Subir documentos (DNI)", trigger: "Captura de DNI", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/documentosComplementarios", description: "Subir docs complementarios", trigger: "Documentacion adicional", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/verificacion-biometrica", description: "Registrar verificacion biometrica", trigger: "Resultado biometria", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/medios-pago", description: "Agregar medio de pago", trigger: "Setup de debito automatico", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/medios-pago/actualizar-estado", description: "Actualizar estado de pago", trigger: "Cambio de estado de pago", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion/firma", description: "Registrar firma", trigger: "Firma digital completada", dataFlow: "write" },
      // Express
      { method: "GET", endpoint: "/portal-afiliacion-express/prospecto/:idRegistro", description: "Obtener negocio express", trigger: "Login express", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion-express/documentos", description: "Subir docs express", trigger: "Docs en flujo express", dataFlow: "write" },
      { method: "GET", endpoint: "/portal-afiliacion-express/cotizacion/:idRegistro", description: "Obtener cotizacion express", trigger: "Pricing express", dataFlow: "read" },
      { method: "POST", endpoint: "/portal-afiliacion-express/estado-firma", description: "Estado firma express", trigger: "Firma express", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion-express/etapa", description: "Actualizar etapa", trigger: "Cambio de pipeline stage", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion-express/employment/validate", description: "Validar empleador CUIT", trigger: "Flujo RD", dataFlow: "both" },
      { method: "POST", endpoint: "/portal-afiliacion-express/employment", description: "Guardar datos empleo", trigger: "Flujo RD", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion-express/ddaa", description: "DDJJ express", trigger: "DDJJ express", dataFlow: "write" },
      { method: "POST", endpoint: "/portal-afiliacion-express/pago", description: "Pago express", trigger: "Pago express", dataFlow: "write" },
      // Binary
      { method: "POST", endpoint: "/binary/renaper", description: "Verificar identidad RENAPER", trigger: "Validacion de identidad", dataFlow: "both" },
      { method: "POST", endpoint: "/binary/cotizacion", description: "Obtener cotizacion de Binary", trigger: "Calculo de precios", dataFlow: "both" },
      // Contacto/Negocio
      { method: "PATCH", endpoint: "/contacto/updateatributos/:idContacto", description: "Actualizar propiedades de contacto", trigger: "Actualizacion de datos", dataFlow: "write" },
      { method: "PATCH", endpoint: "/negocio/updateatributos/:idNegocio", description: "Actualizar propiedades de negocio", trigger: "Actualizacion de deal", dataFlow: "write" },
      { method: "POST", endpoint: "/negocio/:idNegocio/pago", description: "Agregar pago a negocio", trigger: "Registro de pago", dataFlow: "write" },
      { method: "POST", endpoint: "/negocio/:idRegistro/nota", description: "Agregar nota a negocio", trigger: "Anotaciones", dataFlow: "write" },
    ],
    userJourney: [],
    notes: [
      "Token HubSpot: HUBSPOT_ACCESS_TOKEN (PAT via @hubspot/api-client v12.0.1)",
      "Arquitectura Limpia: domain → application → infrastructure → presentation",
      "Patron de respuesta estandar: { success: true/false, data/message, errorcode }",
      "Todas las operaciones CRM centralizadas aca (excepto whatsapp-flow)",
      "Gestiona: Contacts, Deals, Notes, Files, Custom Objects (integrantes, DDJJ, estudios, pagos, cotizaciones)",
      "Variables de entorno configuran stage IDs para diferentes pipelines",
    ],
  },

  "asignaciones-dashboard": {
    name: "asignaciones-dashboard",
    description: "Dashboard interno de asignacion de asesores. Calcula puntaje/scoring de asesores y sincroniza asignaciones a HubSpot.",
    framework: "Express.js (backend) + Vite/React (frontend)",
    role: "Herramienta interna - Scoring de asesores y asignacion de contactos",
    mixpanelEvents: [],
    hubspotOperations: [
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Buscar contactos por fecha, owner, categoria para calcular scoring", trigger: "Carga del dashboard / calculo de puntajes", dataFlow: "read" },
      { method: "GET", endpoint: "/crm/v3/owners", description: "Listar owners/asesores", trigger: "Carga del dashboard", dataFlow: "read" },
      { method: "PATCH", endpoint: "/crm/v3/objects/contacts/{id}", description: "Actualizar puntaje y ponderacion del contacto", trigger: "Sincronizacion de scoring", dataFlow: "write" },
    ],
    userJourney: [],
    notes: [
      "Token HubSpot: HUBSPOT_API_KEY (PAT)",
      "Propiedades usadas: categoria_de_venta, dato_gh, hubspot_owner_id, hubspot_owner_assigneddate, puntaje, ponderacion",
      "Zonas de scoring: AMBA, INSUR, INNOES, INCTRO, INBSAS",
      "Horarios: Laboral, Fuera de Hora, Fin de Semana",
      "Batch operations para actualizar scoring de multiples contactos",
    ],
  },

  "bases-recontacto": {
    name: "bases-recontacto",
    description: "Herramienta interna para cruzar listas de contactos (CSV/Excel) contra la base de HubSpot por email o telefono.",
    framework: "Next.js 15",
    role: "Herramienta interna - Matching de contactos",
    mixpanelEvents: [],
    hubspotOperations: [
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Buscar contacto por email exacto", trigger: "Upload de lista con emails", dataFlow: "read" },
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Buscar contacto por telefono (phone, mobilephone, hs_calculated_phone_number)", trigger: "Upload de lista con telefonos", dataFlow: "read" },
    ],
    userJourney: [],
    notes: [
      "Token HubSpot: HUBSPOT_API_KEY (PAT, acceso directo)",
      "Solo operaciones de lectura",
      "Health check endpoint para verificar conectividad a HubSpot",
    ],
  },

  "cruce-mios": {
    name: "cruce-mios",
    description: "Herramienta interna para reconciliar contactos de la campana MIOS contra HubSpot. Busca por email, telefono o DNI.",
    framework: "Next.js 16 (TypeScript)",
    role: "Herramienta interna - Reconciliacion de contactos MIOS",
    mixpanelEvents: [],
    hubspotOperations: [
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Buscar contacto por email (case-insensitive)", trigger: "Cruce por email", dataFlow: "read" },
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Buscar contacto por telefono (multiples formatos)", trigger: "Cruce por telefono", dataFlow: "read" },
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Buscar contacto por DNI exacto", trigger: "Cruce por DNI", dataFlow: "read" },
      { method: "POST", endpoint: "/crm/v3/objects/contacts/search", description: "Contar contactos de campana MIOS", trigger: "Reporte de campana", dataFlow: "read" },
    ],
    userJourney: [],
    notes: [
      "Token HubSpot: HUBSPOT_API_KEY (PAT, acceso directo)",
      "Solo operaciones de lectura",
      "Maneja numeros de telefono en notacion cientifica (problema de Excel)",
      "Deteccion de precision truncada en telefonos",
    ],
  },

  "onboarding-api": {
    name: "onboarding-api",
    description: "API de onboarding que actualiza el estado de deals en HubSpot durante el proceso de afiliacion.",
    framework: "Fastify 5",
    role: "Backend - Gestion de estado de onboarding",
    mixpanelEvents: [],
    hubspotOperations: [
      { method: "POST", endpoint: "/negocio/{idHubspot}/nota (via huspot-api)", description: "Agregar notas de auditoria a deals", trigger: "Progreso en el onboarding", dataFlow: "write" },
      { method: "PATCH", endpoint: "/negocio/updateatributos/{idHubspot} (via huspot-api)", description: "Actualizar atributos del deal", trigger: "Cambio de estado en onboarding", dataFlow: "write" },
    ],
    userJourney: [],
    notes: [
      "No conecta directo a HubSpot, usa huspot-api como gateway",
      "Actualiza deals durante el lifecycle de onboarding",
      "Agrega notas de auditoria conforme avanza el proceso",
    ],
  },
};

export function searchEvents(query: string): Array<{ project: string; event: MixpanelEvent }> {
  const q = query.toLowerCase();
  const results: Array<{ project: string; event: MixpanelEvent }> = [];

  for (const [projectName, project] of Object.entries(projects)) {
    for (const event of project.mixpanelEvents) {
      if (
        event.name.toLowerCase().includes(q) ||
        event.trigger.toLowerCase().includes(q) ||
        event.component.toLowerCase().includes(q) ||
        (event.step && event.step.toLowerCase().includes(q))
      ) {
        results.push({ project: projectName, event });
      }
    }
  }

  return results;
}

export function searchHubSpotOps(query: string): Array<{ project: string; operation: HubSpotOperation }> {
  const q = query.toLowerCase();
  const results: Array<{ project: string; operation: HubSpotOperation }> = [];

  for (const [projectName, project] of Object.entries(projects)) {
    for (const op of project.hubspotOperations) {
      if (
        op.endpoint.toLowerCase().includes(q) ||
        op.description.toLowerCase().includes(q) ||
        op.trigger.toLowerCase().includes(q)
      ) {
        results.push({ project: projectName, operation: op });
      }
    }
  }

  return results;
}
